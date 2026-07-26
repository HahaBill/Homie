import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * The unified record: one chronological view of everything Homie holds for a
 * patient, whatever surface it arrived on.
 *
 * The join key is the users row, which a Clerk session resolves to by phone
 * or email (see patient.ts). A text thread, a web chat message and a Vapi
 * call transcript all hang off the same id, so signing in shows one history
 * rather than three.
 */

export type TimelineItem =
  | {
      kind: "message";
      at: string;
      who: "homie" | "her";
      text: string;
    }
  | {
      kind: "call";
      at: string;
      callId: string;
      durationSeconds: number | null;
      endedReason: string | null;
      summary: string | null;
      transcript: string | null;
      recordingUrl: string | null;
    };

export type Correlation = {
  windowDays: number;
  pressureDrops: number;
  worseAfterDrop: number;
  /** Null when there is not yet enough to say anything honest. */
  statement: string | null;
};

export type UnifiedRecords = {
  timeline: TimelineItem[];
  callCount: number;
  messageCount: number;
  correlation: Correlation;
};

/** A pressure fall this size is the one the product is built around. */
const DROP_HPA = -5;
const WINDOW_DAYS = 30;

export async function getUnifiedRecords(patientId: string): Promise<UnifiedRecords> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [checkins, calls, weather, observations] = await Promise.all([
    db
      .from("checkins")
      .select("id, sent_at, message_text, replied_at, reply_text")
      .eq("user_id", patientId)
      .order("sent_at", { ascending: true })
      .limit(200),
    db
      .from("calls")
      .select("vapi_call_id, started_at, created_at, duration_seconds, ended_reason, summary, transcript, recording_url")
      .eq("user_id", patientId)
      .order("created_at", { ascending: true })
      .limit(100),
    db
      .from("weather")
      .select("date, pressure_delta_24h")
      .eq("user_id", patientId)
      .gte("date", since.slice(0, 10))
      .order("date", { ascending: true }),
    db
      .from("observations")
      .select("pain_level, created_at, checkin_id")
      .order("created_at", { ascending: true })
      .limit(400),
  ]);

  const timeline: TimelineItem[] = [];

  for (const c of checkins.data ?? []) {
    if (c.message_text) {
      timeline.push({ kind: "message", at: c.sent_at, who: "homie", text: c.message_text });
    }
    if (c.reply_text) {
      timeline.push({
        kind: "message",
        at: c.replied_at ?? c.sent_at,
        who: "her",
        text: c.reply_text,
      });
    }
  }

  for (const call of calls.data ?? []) {
    timeline.push({
      kind: "call",
      at: call.started_at ?? call.created_at,
      callId: call.vapi_call_id,
      durationSeconds: call.duration_seconds,
      endedReason: call.ended_reason,
      summary: call.summary,
      transcript: call.transcript,
      recordingUrl: call.recording_url,
    });
  }

  timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    timeline,
    callCount: calls.data?.length ?? 0,
    messageCount: timeline.filter((t) => t.kind === "message").length,
    correlation: correlate(
      weather.data ?? [],
      // Observations are keyed to checkins, so narrow to this patient's.
      (observations.data ?? []).filter((o) =>
        (checkins.data ?? []).some((c) => c.id === o.checkin_id),
      ),
    ),
  };
}

/**
 * The observed correlation, stated backwards only.
 *
 * This deliberately does NOT forecast. docs/PRD.md §4 makes flare prediction a
 * hard prohibition and §14's worked example of what Homie must never say is
 * "you're trending toward a flare" — a predicted probability is both a
 * prediction about her body and a score she can fail (§3). So this counts
 * what already happened and says only that. A clinician can act on it; it
 * claims nothing about tomorrow.
 */
function correlate(
  weather: Array<{ date: string; pressure_delta_24h: number | null }>,
  observations: Array<{ pain_level: number | null; created_at: string }>,
): Correlation {
  const dropDates = weather
    .filter((w) => typeof w.pressure_delta_24h === "number" && w.pressure_delta_24h <= DROP_HPA)
    .map((w) => w.date);

  // Worse == a reported pain level of 4 or 5, on the day of or the day after
  // the fall — the lag the product claims to have noticed.
  let worseAfterDrop = 0;
  for (const date of dropDates) {
    const start = new Date(`${date}T00:00:00Z`).getTime();
    const end = start + 2 * 86_400_000;
    const hit = observations.some((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= start && t < end && (o.pain_level ?? 0) >= 4;
    });
    if (hit) worseAfterDrop += 1;
  }

  let statement: string | null = null;
  if (dropDates.length >= 2) {
    statement =
      worseAfterDrop > 0
        ? `Pressure fell sharply on ${dropDates.length} days in the last ${WINDOW_DAYS}. You reported worse symptoms within a day on ${worseAfterDrop} of them.`
        : `Pressure fell sharply on ${dropDates.length} days in the last ${WINDOW_DAYS}. You did not report worse symptoms after them.`;
  }

  return {
    windowDays: WINDOW_DAYS,
    pressureDrops: dropDates.length,
    worseAfterDrop,
    statement,
  };
}
