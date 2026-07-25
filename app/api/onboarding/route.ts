import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";

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
  }

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
