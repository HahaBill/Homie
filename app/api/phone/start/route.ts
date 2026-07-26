import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";
import { normalizePhone } from "@/lib/server/phone";

/**
 * Save the phone number Homie should use for texts, calls and record joins.
 *
 * This intentionally does not send a verification code. The onboarding path
 * collects explicit consent and persists the number so the user's Vapi calls,
 * Sendblue messages and web record have the same join key.
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

  const { data: existingUser, error: profileError } = await db
    .from("users")
    .select("phone, onboarding_profile")
    .eq("id", lookup.patient.id)
    .maybeSingle();
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500, headers: NO_STORE });
  }
  const profile =
    typeof existingUser?.onboarding_profile === "object" &&
    existingUser.onboarding_profile !== null &&
    !Array.isArray(existingUser.onboarding_profile)
      ? existingUser.onboarding_profile
      : {};
  const profilePatch: Record<string, unknown> = {
    onboarding_profile: { ...profile, call_phone: phone },
  };
  let savedPhoneColumn = existingUser?.phone === phone;
  if (!existingUser?.phone || existingUser.phone === phone) {
    const { data: phoneOwner, error: phoneOwnerError } = await db
      .from("users")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (phoneOwnerError) {
      return NextResponse.json({ error: phoneOwnerError.message }, { status: 500, headers: NO_STORE });
    }
    if (!phoneOwner || phoneOwner.id === lookup.patient.id) {
      profilePatch.phone = phone;
      savedPhoneColumn = true;
    }
  }
  const { error: profileUpdateError } = await db
    .from("users")
    .update(profilePatch)
    .eq("id", lookup.patient.id);
  if (profileUpdateError) {
    return NextResponse.json({ error: profileUpdateError.message }, { status: 500, headers: NO_STORE });
  }

  await db.from("phone_verifications").delete().eq("user_id", lookup.patient.id);
  await audit("phone_saved", lookup.patient.id, { phone_column: savedPhoneColumn });

  return NextResponse.json(
    { status: "saved", phone, phone_column: savedPhoneColumn },
    { headers: NO_STORE },
  );
}
