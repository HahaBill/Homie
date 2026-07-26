import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";
import {
  CODE_TTL_SECONDS,
  generateCode,
  hashCode,
  normalizePhone,
  verificationMessage,
} from "@/lib/server/phone";

/**
 * Step one of claiming a phone number: text a code to it.
 *
 * Sent through the worker's Sendblue adapter rather than a second SMS
 * provider, so the code arrives in the same thread Homie already talks in —
 * which is itself part of the proof, and means no new credential.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

export async function POST(req: NextRequest) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: NO_STORE });
  }

  let phone: string;
  try {
    phone = normalizePhone(body.phone ?? "");
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "invalid number" },
      { status: 400, headers: NO_STORE },
    );
  }

  const db = supabaseAdmin();

  // Already ours and already verified — nothing to do, and saying so beats
  // sending a code for a number the account plainly holds.
  if (lookup.patient.phone === phone) {
    return NextResponse.json({ status: "already_linked" }, { headers: NO_STORE });
  }

  const code = generateCode();
  const { error: upsertError } = await db.from("phone_verifications").upsert(
    {
      user_id: lookup.patient.id,
      phone,
      code_hash: hashCode(code, phone),
      attempts: 0,
      expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500, headers: NO_STORE });
  }

  const workerUrl = process.env.WORKER_URL;
  const workerToken = process.env.WORKER_ADMIN_TOKEN;
  if (!workerUrl || !workerToken) {
    return NextResponse.json(
      { error: "texting is not configured" },
      { status: 501, headers: NO_STORE },
    );
  }

  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/send-test`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({ to: phone, text: verificationMessage(code) }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!res || !res.ok) {
    // Drop the challenge rather than leave one nobody can answer.
    await db.from("phone_verifications").delete().eq("user_id", lookup.patient.id);
    return NextResponse.json(
      { error: "could not send the code — check the number and try again" },
      { status: 502, headers: NO_STORE },
    );
  }

  // The number is not secret to its owner, but it does not belong in an
  // insert-only table that outlives erasure, so only the fact is recorded.
  await audit("phone_verification_sent", lookup.patient.id, {});

  return NextResponse.json(
    { status: "sent", expires_in: CODE_TTL_SECONDS },
    { headers: NO_STORE },
  );
}
