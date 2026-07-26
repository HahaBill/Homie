import "server-only";
import { supabaseAdmin } from "./supabase";
import { getUnifiedRecords } from "./records";

/**
 * The plain-language digest injected into a Vapi call via
 * assistantOverrides.variableValues.patient_context (see the {{patient_context}}
 * placeholder added to the assistant's system prompt) — so the agent isn't
 * starting cold on every call, whether Homie is dialling out after
 * onboarding or she's calling in.
 *
 * Deliberately excludes getUnifiedRecords().flareRisk: that field is a
 * forward-looking score, and docs/PRD.md §4/§14 make flare prediction a
 * hard prohibition — this context must not hand the voice agent something
 * it could repeat aloud. correlation.statement is safe precisely because
 * records.ts already restricts it to what already happened (see that
 * file's own comment on why it never forecasts).
 */
export async function buildVapiPatientContext(patientId: string): Promise<string> {
  const db = supabaseAdmin();

  const [userRes, medsRes, records] = await Promise.all([
    db.from("users").select("name, onboarding_profile").eq("id", patientId).maybeSingle(),
    db.from("medications").select("name, dose, schedule").eq("user_id", patientId).limit(5),
    getUnifiedRecords(patientId),
  ]);

  const profile =
    typeof userRes.data?.onboarding_profile === "object" && userRes.data.onboarding_profile !== null
      ? (userRes.data.onboarding_profile as Record<string, unknown>)
      : {};

  const lines: string[] = [];

  if (userRes.data?.name) lines.push(`Name: ${userRes.data.name}.`);

  const conditions = Array.isArray(profile.conditions)
    ? profile.conditions.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (conditions.length) lines.push(`Conditions: ${conditions.join(", ")}.`);

  const meds = medsRes.data ?? [];
  if (meds.length) {
    const medText = meds.map((m) => [m.name, m.dose, m.schedule].filter(Boolean).join(", ")).join("; ");
    lines.push(`Medication: ${medText}.`);
  }

  if (typeof profile.baseline_feeling === "number") {
    lines.push(`Baseline feeling reported at signup: ${profile.baseline_feeling} out of 5.`);
  }
  if (typeof profile.remember === "string" && profile.remember.trim()) {
    lines.push(`She asked to be remembered: ${profile.remember.trim()}.`);
  }
  if (typeof profile.care_contact === "string" && profile.care_contact.trim()) {
    lines.push(`Usual care contact: ${profile.care_contact.trim()}.`);
  }

  const recentQuotes = records.timeline
    .filter((t) => t.kind === "message" && t.who === "her")
    .slice(-3)
    .map((t) => (t.kind === "message" ? `"${t.text}"` : ""))
    .filter(Boolean);
  if (recentQuotes.length) lines.push(`Recent check-ins, in her own words: ${recentQuotes.join("; ")}.`);

  if (records.correlation.statement) lines.push(records.correlation.statement);

  return lines.join(" ");
}
