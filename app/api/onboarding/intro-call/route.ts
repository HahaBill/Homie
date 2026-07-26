import { NextResponse } from "next/server";
import { audit, supabaseAdmin } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";
import { normalizePhone } from "@/lib/server/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

type OnboardingProfile = {
  call_phone?: string;
};

export async function POST(req: Request) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const body = (await req.json().catch(() => ({}))) as { phone?: string };

  const db = supabaseAdmin();
  const { data: user, error } = await db
    .from("users")
    .select("id, phone, name, call_consent_at, onboarding_profile")
    .eq("id", lookup.patient.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  if (!user) return NextResponse.json({ error: "user not found" }, { status: 404, headers: NO_STORE });
  if (!user.call_consent_at) {
    return NextResponse.json({ error: "call consent is required before Homie can call" }, { status: 400, headers: NO_STORE });
  }

  let callPhone = user.phone;
  let unverifiedFallback = false;
  if (!callPhone && body.phone) {
    try {
      callPhone = normalizePhone(body.phone);
      unverifiedFallback = true;
    } catch {
      return NextResponse.json({ error: "that phone number is not valid for a call" }, { status: 400, headers: NO_STORE });
    }
  }
  const savedPhone =
    typeof user.onboarding_profile === "object" && user.onboarding_profile !== null
      ? (user.onboarding_profile as OnboardingProfile).call_phone
      : undefined;
  if (!callPhone && savedPhone) {
    try {
      callPhone = normalizePhone(savedPhone);
      unverifiedFallback = true;
    } catch {
      /* ignore bad saved fallback */
    }
  }
  if (!callPhone) {
    return NextResponse.json({ error: "add a phone number before starting a call" }, { status: 400, headers: NO_STORE });
  }

  const token = process.env.VAPI_API_KEY;
  const assistantId = process.env.VAPI_ASSISTANT_ID;
  const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID;
  if (!token || !assistantId || !phoneNumberId) {
    return NextResponse.json({ error: "vapi outbound calling is not configured" }, { status: 501, headers: NO_STORE });
  }

  const res = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      assistantId,
      phoneNumberId,
      customer: {
        number: callPhone,
        name: user.name ?? undefined,
      },
      name: "Homie introductory call",
    }),
  }).catch(() => null);

  if (!res?.ok) {
    await audit("intro_call_failed", user.id, { status: res?.status ?? null, unverified_fallback: unverifiedFallback });
    return NextResponse.json({ error: "Homie could not start the call just now" }, { status: 502, headers: NO_STORE });
  }

  const call = (await res.json()) as { id?: string };
  await audit("intro_call_started", user.id, {
    vapi_call_id: call.id ?? null,
    unverified_fallback: unverifiedFallback,
  });
  return NextResponse.json({ ok: true, call_id: call.id ?? null }, { headers: NO_STORE });
}
