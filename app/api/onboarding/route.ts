import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";
import { normalizePhone } from "@/lib/server/phone";

/**
 * The onboarding flow's single write. Everything is optional except the
 * consent decision, which is the whole point: PRD §7.4 requires explicit,
 * timestamped consent before the morning cron will ever message this row.
 * Opting out later clears consent_at and the cron goes quiet again.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };
const CONSENT_VERSION = "web-onboarding-1";

type OnboardingProfile = {
  call_phone?: string;
  date_of_birth?: string;
  gender?: string;
  height_cm?: number;
  weight_kg?: number;
  conditions?: string[];
  primary_condition?: string;
  symptoms?: string[];
  baseline_feeling?: number;
  bad_day?: string;
  remember?: string;
  care_contact?: string;
  country?: string;
};

function short(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function shortList(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => short(item, 80))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function cleanProfile(profile: unknown): OnboardingProfile {
  const raw = typeof profile === "object" && profile !== null ? profile as Record<string, unknown> : {};
  const dateOfBirth = short(raw.date_of_birth, 20);
  let callPhone: string | undefined;
  try {
    const candidate = short(raw.call_phone, 32);
    callPhone = candidate ? normalizePhone(candidate) : undefined;
  } catch {
    callPhone = undefined;
  }
  const cleaned: OnboardingProfile = {
    call_phone: callPhone,
    gender: short(raw.gender, 80),
    height_cm: boundedNumber(raw.height_cm, 60, 260),
    weight_kg: boundedNumber(raw.weight_kg, 20, 350),
    conditions: shortList(raw.conditions),
    primary_condition: short(raw.primary_condition, 120),
    symptoms: shortList(raw.symptoms),
    baseline_feeling: boundedNumber(raw.baseline_feeling, 1, 5),
    bad_day: short(raw.bad_day, 700),
    remember: short(raw.remember, 700),
    care_contact: short(raw.care_contact, 120),
    country: short(raw.country, 80),
  };
  if (dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    cleaned.date_of_birth = dateOfBirth;
  }
  return Object.fromEntries(
    Object.entries(cleaned).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined,
    ),
  ) as OnboardingProfile;
}

export async function POST(req: NextRequest) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: {
    name?: string;
    timezone?: string;
    medication_name?: string;
    medication_dose?: string;
    medication_schedule?: string;
    morning_briefing?: boolean;
    call_consent?: boolean;
    transcript_consent?: boolean;
    onboarding_profile?: OnboardingProfile;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: NO_STORE });
  }

  const db = supabaseAdmin();
  const patch: Record<string, unknown> = {};

  const name = body.name?.trim();
  if (name) patch.name = name.slice(0, 80);

  const timezone = body.timezone?.trim();
  if (timezone && timezone.length <= 64) {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
      patch.timezone = timezone;
    } catch {
      /* unknown zone — keep the existing one */
    }
  }

  if (typeof body.morning_briefing === "boolean") {
    patch.consent_at = body.morning_briefing ? new Date().toISOString() : null;
    patch.consent_version = body.morning_briefing ? CONSENT_VERSION : null;
    patch.text_consent_at = body.morning_briefing ? patch.consent_at : null;
  }

  if (typeof body.call_consent === "boolean") {
    patch.call_consent_at = body.call_consent ? new Date().toISOString() : null;
  }

  if (typeof body.transcript_consent === "boolean") {
    patch.transcript_consent_at = body.transcript_consent ? new Date().toISOString() : null;
  }

  patch.onboarding_profile = cleanProfile(body.onboarding_profile);
  patch.onboarded_at = new Date().toISOString();

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("users").update(patch).eq("id", lookup.patient.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
    }
  }

  const medName = body.medication_name?.trim();
  if (medName) {
    const { error } = await db.from("medications").insert({
      user_id: lookup.patient.id,
      name: medName.slice(0, 120),
      dose: body.medication_dose?.trim().slice(0, 120) || null,
      schedule: body.medication_schedule?.trim().slice(0, 200) || null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
    }
  }

  await audit(
    typeof body.morning_briefing === "boolean"
      ? body.morning_briefing
        ? "consent_granted"
        : "consent_withdrawn"
      : "onboarding_updated",
    lookup.patient.id,
    { consent_version: body.morning_briefing ? CONSENT_VERSION : null },
  );

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
