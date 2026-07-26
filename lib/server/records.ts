import "server-only";
import { supabaseAdmin } from "./supabase";
import { computeFlareRisk, type FlareRisk } from "./flare";
import { normalizePhone } from "./phone";

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

export type WhoopSleepDay = {
  date: string;
  start: string;
  end: string;
  scoreState: "SCORED";
  sleepPerformancePercentage: number;
  sleepConsistencyPercentage: number;
  sleepEfficiencyPercentage: number;
  respiratoryRate: number;
  totalInBedHours: number;
  totalSleepHours: number;
  disturbanceCount: number;
};

export type UnifiedRecords = {
  timeline: TimelineItem[];
  callCount: number;
  messageCount: number;
  correlation: Correlation;
  /** Null when today's pressure was not supplied by the caller. */
  flareRisk: FlareRisk | null;
  whoopSleep: {
    source: "mock";
    windowDays: 7;
    days: WhoopSleepDay[];
    averages: {
      sleepPerformancePercentage: number;
      sleepConsistencyPercentage: number;
      sleepEfficiencyPercentage: number;
      respiratoryRate: number;
      totalSleepHours: number;
    };
  };
};

/** A pressure fall this size is the one the product is built around. */
const DROP_HPA = -5;
const WINDOW_DAYS = 30;

export async function getUnifiedRecords(
  patientId: string,
  /** Today's 24h barometric change, when the caller has it. */
  pressureDelta24h: number | null = null,
): Promise<UnifiedRecords> {
  const db = supabaseAdmin();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  const { data: patient } = await db
    .from("users")
    .select("phone, onboarding_profile")
    .eq("id", patientId)
    .maybeSingle();
  const profile =
    typeof patient?.onboarding_profile === "object" &&
    patient.onboarding_profile !== null &&
    !Array.isArray(patient.onboarding_profile)
      ? patient.onboarding_profile as { call_phone?: string }
      : {};
  const callPhones = Array.from(
    new Set(
      [patient?.phone, profile.call_phone]
        .map((phone) => {
          try {
            return phone ? normalizePhone(phone) : null;
          } catch {
            return null;
          }
        })
        .filter((phone): phone is string => Boolean(phone)),
    ),
  );
  const linkedUsers =
    callPhones.length > 0
      ? await db.from("users").select("id").in("phone", callPhones)
      : { data: [], error: null };
  const patientIds = Array.from(
    new Set([patientId, ...((linkedUsers.data ?? []) as Array<{ id: string }>).map((u) => u.id)]),
  );

  const [checkins, callsByUser, callsByPhone, weather, observations] = await Promise.all([
    db
      .from("checkins")
      .select("id, sent_at, message_text, replied_at, reply_text")
      .in("user_id", patientIds)
      .order("sent_at", { ascending: true })
      .limit(200),
    db
      .from("calls")
      .select("vapi_call_id, started_at, created_at, duration_seconds, ended_reason, summary, transcript, recording_url")
      .in("user_id", patientIds)
      .order("created_at", { ascending: true })
      .limit(100),
    callPhones.length > 0
      ? db
          .from("calls")
          .select("vapi_call_id, started_at, created_at, duration_seconds, ended_reason, summary, transcript, recording_url")
          .in("phone", callPhones)
          .order("created_at", { ascending: true })
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
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

  const calls = Array.from(
    new Map(
      [...(callsByUser.data ?? []), ...(callsByPhone.data ?? [])].map((call) => [
        call.vapi_call_id,
        call,
      ]),
    ).values(),
  );

  for (const call of calls) {
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

  // Observations are keyed to checkins, so narrow to this patient's.
  const mine = (observations.data ?? []).filter((o) =>
    (checkins.data ?? []).some((c) => c.id === o.checkin_id),
  );
  const correlation = correlate(weather.data ?? [], mine);

  // Last week of reported pain, most recent last.
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recentPain = mine
    .filter((o) => new Date(o.created_at).getTime() >= weekAgo)
    .map((o) => o.pain_level ?? 0);

  return {
    timeline,
    callCount: calls.length,
    messageCount: timeline.filter((t) => t.kind === "message").length,
    correlation,
    whoopSleep: mockWhoopSleep(),
    flareRisk:
      pressureDelta24h === null && correlation.pressureDrops === 0
        ? null
        : computeFlareRisk({
            pressureDelta24h,
            pressureDrops: correlation.pressureDrops,
            worseAfterDrop: correlation.worseAfterDrop,
            recentPain,
          }),
  };
}

function mockWhoopSleep(): UnifiedRecords["whoopSleep"] {
  const now = new Date();
  const template = [
    { performance: 82, consistency: 75, efficiency: 89, respiratory: 16.3, inBed: 8.1, asleep: 7.2, disturbances: 14 },
    { performance: 76, consistency: 72, efficiency: 86, respiratory: 16.8, inBed: 7.7, asleep: 6.6, disturbances: 18 },
    { performance: 91, consistency: 81, efficiency: 92, respiratory: 15.9, inBed: 8.4, asleep: 7.7, disturbances: 10 },
    { performance: 68, consistency: 63, efficiency: 84, respiratory: 17.1, inBed: 7.3, asleep: 6.1, disturbances: 22 },
    { performance: 87, consistency: 79, efficiency: 90, respiratory: 16.2, inBed: 8.0, asleep: 7.2, disturbances: 12 },
    { performance: 73, consistency: 70, efficiency: 85, respiratory: 16.6, inBed: 7.5, asleep: 6.4, disturbances: 19 },
    { performance: 84, consistency: 77, efficiency: 91, respiratory: 16.1, inBed: 8.2, asleep: 7.5, disturbances: 11 },
  ];
  const days = template.map((day, index) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - index));
    d.setHours(0, 0, 0, 0);
    const start = new Date(d);
    start.setDate(d.getDate() - 1);
    start.setHours(23, 10 + (index % 3) * 12, 0, 0);
    const end = new Date(start.getTime() + day.inBed * 60 * 60 * 1000);
    return {
      date: d.toISOString().slice(0, 10),
      start: start.toISOString(),
      end: end.toISOString(),
      scoreState: "SCORED" as const,
      sleepPerformancePercentage: day.performance,
      sleepConsistencyPercentage: day.consistency,
      sleepEfficiencyPercentage: day.efficiency,
      respiratoryRate: day.respiratory,
      totalInBedHours: day.inBed,
      totalSleepHours: day.asleep,
      disturbanceCount: day.disturbances,
    };
  });
  const avg = (field: keyof Pick<
    WhoopSleepDay,
    | "sleepPerformancePercentage"
    | "sleepConsistencyPercentage"
    | "sleepEfficiencyPercentage"
    | "respiratoryRate"
    | "totalSleepHours"
  >) => Number((days.reduce((sum, day) => sum + day[field], 0) / days.length).toFixed(1));

  return {
    source: "mock",
    windowDays: 7,
    days,
    averages: {
      sleepPerformancePercentage: avg("sleepPerformancePercentage"),
      sleepConsistencyPercentage: avg("sleepConsistencyPercentage"),
      sleepEfficiencyPercentage: avg("sleepEfficiencyPercentage"),
      respiratoryRate: avg("respiratoryRate"),
      totalSleepHours: avg("totalSleepHours"),
    },
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
