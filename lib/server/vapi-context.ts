import "server-only";
import { supabaseAdmin } from "./supabase";
import { getUnifiedRecords } from "./records";

function clean(value: string, max = 240): string {
  return value.replace(/[{}<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Builds the bounded digest inserted into the live assistant's
 * {{patient_context}} variable. Conditions and symptoms remain explicitly
 * user-reported; weather and wearable values are observations, never causes
 * or treatment signals.
 */
export async function buildVapiPatientContext(patientId: string): Promise<string> {
  const db = supabaseAdmin();
  const [userRes, medsRes, records, weatherRes, readingRes] = await Promise.all([
    db
      .from("users")
      .select("name, primary_condition, conditions, symptoms, baseline_feeling, bad_day, remember, care_contact")
      .eq("id", patientId)
      .maybeSingle(),
    db.from("medications").select("name, dose, schedule").eq("user_id", patientId).limit(5),
    getUnifiedRecords(patientId),
    db
      .from("weather")
      .select("pressure_delta_24h, temp_c")
      .eq("user_id", patientId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("readings")
      .select("sleep_minutes, sleep_quality, resting_hr")
      .eq("user_id", patientId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const user = userRes.data;
  const lines: string[] = [];
  if (user?.name) lines.push(`Name: ${clean(user.name, 80)}.`);
  if (user?.conditions?.length) {
    lines.push(`User-reported conditions to confirm: ${user.conditions.map((item: string) => clean(item, 60)).join(", ")}.`);
  } else if (user?.primary_condition) {
    lines.push(`User-reported primary condition to confirm: ${clean(user.primary_condition, 100)}.`);
  }
  if (user?.symptoms?.length) {
    lines.push(`User-reported symptoms to confirm: ${user.symptoms.map((item: string) => clean(item, 60)).join(", ")}.`);
  }

  const meds = medsRes.data ?? [];
  if (meds.length) {
    const medText = meds
      .map((med) => [med.name, med.dose, med.schedule].filter(Boolean).map((value) => clean(String(value), 80)).join(", "))
      .join("; ");
    lines.push(`Medication on record, for confirmation only: ${medText}.`);
  }
  if (user?.baseline_feeling) lines.push(`Baseline feeling reported at signup: ${user.baseline_feeling} out of 5.`);
  if (user?.bad_day) lines.push(`A difficult day was described as: ${clean(user.bad_day)}.`);
  if (user?.remember) lines.push(`They asked Homie to remember: ${clean(user.remember)}.`);
  if (user?.care_contact) lines.push(`Usual care contact: ${clean(user.care_contact, 100)}.`);

  const recentQuotes = records.timeline
    .filter((item) => item.kind === "message" && item.who === "her")
    .slice(-3)
    .map((item) => (item.kind === "message" ? `"${clean(item.text, 180)}"` : ""));
  if (recentQuotes.length) lines.push(`Recent check-ins, in their own words: ${recentQuotes.join("; ")}.`);

  const observations = [
    weatherRes.data?.pressure_delta_24h != null
      ? `24-hour pressure change ${weatherRes.data.pressure_delta_24h} hPa`
      : "",
    weatherRes.data?.temp_c != null ? `temperature ${weatherRes.data.temp_c} C` : "",
    readingRes.data?.sleep_minutes != null
      ? `recent sleep ${Math.round(readingRes.data.sleep_minutes / 6) / 10} hours`
      : "",
    readingRes.data?.sleep_quality != null ? `sleep performance ${readingRes.data.sleep_quality}%` : "",
    readingRes.data?.resting_hr != null ? `resting heart rate ${readingRes.data.resting_hr}` : "",
  ].filter(Boolean);
  if (observations.length) lines.push(`Recent observations, with no causal inference: ${observations.join("; ")}.`);
  if (records.correlation.statement) lines.push(records.correlation.statement);
  lines.push(
    "Confirm user-reported details. Do not diagnose, predict symptoms, or recommend treatment or medication changes from weather or wearable data.",
  );
  return lines.join(" ");
}
