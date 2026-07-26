import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";
import { MAX_ATTEMPTS, codeMatches } from "@/lib/server/phone";

/**
 * Step two: the code comes back, and the two halves of the person join up.
 *
 * The interesting case is not setting a column. It is that the number
 * usually already belongs to a row — the one the Sendblue worker created on
 * her first text, carrying the check-ins and the Vapi call transcripts. That
 * row and the signed-in row are the same person, so they are merged (see
 * merge_user_into in the migration), and the web session inherits the
 * history it could never reach before.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

export async function POST(req: NextRequest) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: NO_STORE });
  }
  const code = (body.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) {
    return NextResponse.json({ error: "that code is six digits" }, { status: 400, headers: NO_STORE });
  }

  const db = supabaseAdmin();
  const sessionUserId = lookup.patient.id;

  const { data: challenge, error } = await db
    .from("phone_verifications")
    .select("phone, code_hash, attempts, expires_at")
    .eq("user_id", sessionUserId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }
  if (!challenge) {
    return NextResponse.json(
      { error: "ask for a new code" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await db.from("phone_verifications").delete().eq("user_id", sessionUserId);
    return NextResponse.json({ error: "that code has expired" }, { status: 400, headers: NO_STORE });
  }
  if (challenge.attempts >= MAX_ATTEMPTS) {
    await db.from("phone_verifications").delete().eq("user_id", sessionUserId);
    return NextResponse.json(
      { error: "too many tries — ask for a new code" },
      { status: 429, headers: NO_STORE },
    );
  }

  if (!codeMatches(code, challenge.phone, challenge.code_hash)) {
    // Count the attempt before answering, so a burst of guesses still spends
    // the budget even if the client ignores the response.
    await db
      .from("phone_verifications")
      .update({ attempts: challenge.attempts + 1 })
      .eq("user_id", sessionUserId);
    return NextResponse.json(
      { error: "that code did not match", attempts_left: MAX_ATTEMPTS - challenge.attempts - 1 },
      { status: 400, headers: NO_STORE },
    );
  }

  // Verified. Does this number already have a row of its own?
  const { data: existing, error: existingError } = await db
    .from("users")
    .select("id")
    .eq("phone", challenge.phone)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500, headers: NO_STORE });
  }

  let merged = false;
  if (existing && existing.id !== sessionUserId) {
    // It does — the texting side of the same person. Fold it in, atomically.
    const { error: mergeError } = await db.rpc("merge_user_into", {
      source_id: existing.id,
      target_id: sessionUserId,
    });
    if (mergeError) {
      return NextResponse.json(
        { error: `could not join your records: ${mergeError.message}` },
        { status: 500, headers: NO_STORE },
      );
    }
    merged = true;
  } else if (!existing) {
    const { error: setError } = await db
      .from("users")
      .update({ phone: challenge.phone })
      .eq("id", sessionUserId);
    if (setError) {
      return NextResponse.json({ error: setError.message }, { status: 500, headers: NO_STORE });
    }
  }

  await db.from("phone_verifications").delete().eq("user_id", sessionUserId);
  await audit("phone_verified", sessionUserId, { merged });

  return NextResponse.json({ status: "verified", merged }, { headers: NO_STORE });
}
