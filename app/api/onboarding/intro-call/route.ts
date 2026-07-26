import { NextResponse } from "next/server";
import { audit, supabaseAdmin } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";
import { normalizePhone } from "@/lib/server/phone";
import { buildVapiPatientContext } from "@/lib/server/vapi-context";

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

  const savedPhone =
    typeof user.onboarding_profile === "object" && user.onboarding_profile !== null
      ? (user.onboarding_profile as OnboardingProfile).call_phone
      : undefined;

  // The onboarding number is the latest number the person explicitly chose
  // for calls. Older rows can carry a stale users.phone value that passes our
  // broad E.164 shape check but fails Vapi's country-aware validation. Apply
  // formatting only at this provider boundary and fall through candidates
  // instead of letting one stale value block the saved onboarding flow.
  let callPhone: string | null = null;
  let phoneSource: "onboarding_profile" | "users.phone" | "request" | null = null;
  const candidates = [
    { value: savedPhone, source: "onboarding_profile" as const },
    { value: user.phone, source: "users.phone" as const },
    { value: body.phone, source: "request" as const },
  ];
  for (const candidate of candidates) {
    if (!candidate.value) continue;
    try {
      callPhone = normalizePhone(candidate.value);
      phoneSource = candidate.source;
      break;
    } catch {
      /* try the next stored candidate */
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

  // Best-effort: a context-building failure must not block the call itself.
  // The assistant's system prompt has a {{patient_context}} placeholder
  // that reads naturally as empty, so an empty string here just means the
  // call starts the way it always did before this existed.
  const patientContext = await buildVapiPatientContext(user.id).catch(() => "");

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
      ...(patientContext ? { assistantOverrides: { variableValues: { patient_context: patientContext } } } : {}),
    }),
  }).catch(() => null);

  if (!res?.ok) {
    const detail = res
      ? await res.text().catch(() => "")
      : "Vapi request failed before a response was received";
    await audit("intro_call_failed", user.id, {
      status: res?.status ?? null,
      detail: detail.slice(0, 500),
      phone_source: phoneSource,
    });
    return NextResponse.json(
      {
        error: detail
          ? `Homie could not start the call: ${detail.slice(0, 220)}`
          : "Homie could not start the call just now",
      },
      { status: 502, headers: NO_STORE },
    );
  }

  const call = (await res.json()) as { id?: string };
  await audit("intro_call_started", user.id, {
    vapi_call_id: call.id ?? null,
    phone_source: phoneSource,
    context_included: Boolean(patientContext),
  });
  return NextResponse.json({ ok: true, call_id: call.id ?? null }, { headers: NO_STORE });
}
