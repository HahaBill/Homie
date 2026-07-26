import "server-only";

import type { UnifiedRecords, WhoopSleepDay } from "./records";
import { supabaseAdmin } from "./supabase";

type WhoopSleepRecord = {
  id?: string;
  start?: string;
  end?: string;
  nap?: boolean;
  score_state?: "SCORED" | "PENDING_SCORE" | "UNSCORABLE";
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_no_data_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      disturbance_count?: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
};

type WhoopSleepResponse = {
  records?: WhoopSleepRecord[];
};

export type WhoopStatus =
  | "live"
  | "not_connected"
  | "unauthorized"
  | "empty"
  | "unavailable";

export type WhoopFetchResult = {
  sleep: UnifiedRecords["whoopSleep"];
  status: WhoopStatus;
};

const WHOOP_SLEEP_URL = "https://api.prod.whoop.com/developer/v2/activity/sleep";
const MS_PER_HOUR = 3_600_000;

function hours(ms: number | undefined): number {
  return Number(((ms ?? 0) / MS_PER_HOUR).toFixed(1));
}

function round(value: number | undefined): number {
  return Number((value ?? 0).toFixed(1));
}

function totalSleepHours(stage: NonNullable<NonNullable<WhoopSleepRecord["score"]>["stage_summary"]>): number {
  return hours(
    (stage.total_light_sleep_time_milli ?? 0) +
      (stage.total_slow_wave_sleep_time_milli ?? 0) +
      (stage.total_rem_sleep_time_milli ?? 0),
  );
}

function toDay(record: WhoopSleepRecord): WhoopSleepDay | null {
  if (record.score_state !== "SCORED" || !record.start || !record.end || !record.score) return null;
  const stage = record.score.stage_summary;
  if (!stage) return null;
  return {
    date: record.end.slice(0, 10),
    start: record.start,
    end: record.end,
    scoreState: "SCORED",
    sleepPerformancePercentage: round(record.score.sleep_performance_percentage),
    sleepConsistencyPercentage: round(record.score.sleep_consistency_percentage),
    sleepEfficiencyPercentage: round(record.score.sleep_efficiency_percentage),
    respiratoryRate: round(record.score.respiratory_rate),
    totalInBedHours: hours(stage.total_in_bed_time_milli),
    totalSleepHours: totalSleepHours(stage),
    disturbanceCount: stage.disturbance_count ?? 0,
  };
}

function average(
  days: WhoopSleepDay[],
  field: keyof Pick<
    WhoopSleepDay,
    | "sleepPerformancePercentage"
    | "sleepConsistencyPercentage"
    | "sleepEfficiencyPercentage"
    | "respiratoryRate"
    | "totalSleepHours"
  >,
): number {
  return Number((days.reduce((sum, day) => sum + day[field], 0) / days.length).toFixed(1));
}

export function summarizeWhoopSleep(
  source: "live",
  days: WhoopSleepDay[],
): UnifiedRecords["whoopSleep"] {
  return {
    source,
    windowDays: 7,
    days,
    averages: {
      sleepPerformancePercentage: average(days, "sleepPerformancePercentage"),
      sleepConsistencyPercentage: average(days, "sleepConsistencyPercentage"),
      sleepEfficiencyPercentage: average(days, "sleepEfficiencyPercentage"),
      respiratoryRate: average(days, "respiratoryRate"),
      totalSleepHours: average(days, "totalSleepHours"),
    },
  };
}

export async function fetchWhoopSleep(
  token: string | null,
): Promise<WhoopFetchResult> {
  if (!token) return { sleep: null, status: "not_connected" };

  const end = new Date();
  const start = new Date(end.getTime() - 8 * 86_400_000);
  const url = new URL(WHOOP_SLEEP_URL);
  url.searchParams.set("limit", "25");
  url.searchParams.set("start", start.toISOString());
  url.searchParams.set("end", end.toISOString());

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 900 },
  }).catch(() => null);
  if (!res) return { sleep: null, status: "unavailable" };
  if (res.status === 401) return { sleep: null, status: "unauthorized" };
  if (!res.ok) return { sleep: null, status: "unavailable" };

  const payload = (await res.json().catch(() => null)) as WhoopSleepResponse | null;
  const days = (payload?.records ?? [])
    .filter((record) => !record.nap)
    .map(toDay)
    .filter((day): day is WhoopSleepDay => Boolean(day))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(-7);

  return days.length > 0
    ? { sleep: summarizeWhoopSleep("live", days), status: "live" }
    : { sleep: null, status: "empty" };
}

export async function persistWhoopSleep(
  userId: string,
  sleep: UnifiedRecords["whoopSleep"],
): Promise<void> {
  if (!sleep?.days.length) return;
  const { error } = await supabaseAdmin()
    .from("readings")
    .upsert(
      sleep.days.map((day) => ({
        user_id: userId,
        date: day.date,
        source: "whoop",
        sleep_minutes: Math.round(day.totalSleepHours * 60),
        sleep_quality: day.sleepPerformancePercentage,
      })),
      { onConflict: "user_id,date,source" },
    );
  if (error) throw new Error(`persistWhoopSleep: ${error.message}`);
}
