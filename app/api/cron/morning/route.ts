import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { fetchPressure, type PressureSnapshot } from "@/lib/server/openmeteo";
import { secretsMatch } from "@/lib/server/secret-compare";

/**
 * The morning message (PRD §5), fired by Vercel cron — see vercel.json.
 *
 * Gates, in order:
 *  - CRON_SECRET bearer check (Vercel sends it automatically once set).
 *  - Consent: only users with consent_at set and status 'active' are ever
 *    messaged (PRD §7.4). The worker auto-creates rows without consent;
 *    those users are skipped here, silently.
 *  - Quiet hours: nothing sends outside 08:00–21:59 in the user's own
 *    timezone (PRD §6 cadence rules).
 *
 * Composition is a deterministic template in Homie's voice (PRD §14) —
 * lowercase-comfortable, compared to her own recent baseline, ends on a
 * question that is easy to ignore. The LLM lives in the worker's reply
 * parser, not here: a scheduled broadcast is exactly where a model surprise
 * is least affordable.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sends are sequential and each Sendblue call allows up to 15s, so the default
// serverless ceiling can kill the loop partway through the user list. The
// per-user claim above makes a truncated run safe to re-trigger.
export const maxDuration = 60;

type UserRow = {
  id: string;
  phone: string;
  name: string | null;
  timezone: string;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secretsMatch(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const { data: users, error } = await db
    .from("users")
    .select("id, phone, name, timezone")
    .eq("status", "active")
    .not("consent_at", "is", null);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const snapshot = await fetchPressure();
  const dryRun = !sendblueConfigured();
  const today = new Date().toISOString().slice(0, 10);

  // One round trip for everyone's medication schedule; first-listed med per
  // user is the one the briefing may mention. Failure degrades to briefings
  // without a medication line rather than no briefings.
  const medByUser = new Map<string, { name: string; schedule: string | null }>();
  {
    const { data: meds, error: medsError } = await db
      .from("medications")
      .select("user_id, name, schedule")
      .order("created_at", { ascending: true });
    if (medsError) {
      console.error(`medications fetch: ${medsError.message}`);
    } else {
      for (const m of meds ?? []) {
        if (!medByUser.has(m.user_id)) {
          medByUser.set(m.user_id, { name: m.name, schedule: m.schedule });
        }
      }
    }
  }

  const results: Array<Record<string, unknown>> = [];
  for (const user of (users ?? []) as UserRow[]) {
    // One user's failure is never allowed to cost everyone else their morning
    // message, so each iteration is isolated. Anything thrown below — a
    // Supabase outage, an audit write, a malformed row — is recorded against
    // that user and the loop moves on.
    try {
      if (!withinWakingHours(user.timezone)) {
        results.push({ user: user.id, skipped: "quiet_hours" });
        continue;
      }

      const text = composeMorning(user, snapshot, medByUser.get(user.id));

      if (dryRun) {
        results.push({ user: user.id, dry_run: true, preview: text });
        continue;
      }

      // Claim the day before sending, not after. The insert is the idempotency
      // guard (see the partial unique index in
      // supabase/migrations/20260725210500_one_morning_checkin_per_day.sql):
      // a second invocation — Vercel cron is at-least-once — loses the race
      // here and sends nothing, instead of texting her twice.
      const { data: claim, error: claimError } = await db
        .from("checkins")
        .insert({ user_id: user.id, message_text: text })
        .select("id")
        .single();
      if (claimError) {
        if (claimError.code === "23505") {
          results.push({ user: user.id, skipped: "already_sent_today" });
          continue;
        }
        throw new Error(`claim checkin: ${claimError.message}`);
      }

      const sent = await sendViaSendblue(user.phone, text);
      if (!sent.ok) {
        // Release the claim so a re-trigger can retry today rather than the
        // failed attempt silently consuming her only message of the day.
        await db.from("checkins").delete().eq("id", claim.id);
        await audit("morning_send_failed", user.id, { error: sent.error });
        results.push({ user: user.id, failed: sent.error });
        continue;
      }

      // Weather is supporting detail, not the message — a failed upsert is
      // worth surfacing but must not turn a delivered check-in into a failure.
      let weatherStored: boolean | null = null;
      if (snapshot) {
        const { error: weatherError } = await db.from("weather").upsert(
          {
            user_id: user.id,
            date: today,
            pressure_hpa: snapshot.pressureHpa,
            pressure_delta_24h: snapshot.pressureDelta24h,
            temp_c: snapshot.tempC,
            humidity: snapshot.humidity,
          },
          { onConflict: "user_id,date" },
        );
        weatherStored = !weatherError;
        if (weatherError) {
          console.error(`weather upsert (${user.id}): ${weatherError.message}`);
        }
      }

      await audit("morning_sent", user.id, {
        pressure_delta: snapshot?.pressureDelta24h ?? null,
        weather_stored: weatherStored,
      });
      results.push({ user: user.id, sent: true, weather_stored: weatherStored });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`morning cron (${user.id}): ${message}`);
      results.push({ user: user.id, failed: message });
    }
  }

  return NextResponse.json(
    { date: today, dry_run: dryRun, pressure: snapshot, results },
    { headers: { "cache-control": "private, no-store" } },
  );
}

/**
 * The morning briefing, per the shape the design fixes (one idea per line,
 * blank lines between, one ignorable question at the end) and the PRD's
 * limits: patterns are reported as what has been seen before — never a
 * prediction, never a diagnosis, never a dose. The sun and heat lines are
 * generic photosensitivity and heat-pacing precautions relevant to lupus,
 * phrased as information about the day, not instructions about medication.
 */
function composeMorning(
  user: UserRow,
  w: PressureSnapshot | null,
  med?: { name: string; schedule: string | null },
): string {
  const lines: string[] = [];
  lines.push(user.name ? `morning, ${user.name.toLowerCase()}.` : "morning.");

  // What the weather is doing, read against the pattern Homie has seen.
  if (w && w.pressureDelta24h <= -5) {
    lines.push(
      "pressure's dropping hard today — the same shape as mornings that have been rough on your hands before.",
    );
  } else if (w && w.pressureDelta24h >= 5) {
    lines.push("pressure's climbing back up today.");
  } else if (w) {
    lines.push("pressure's steady today.");
  }

  // Sun and heat, when today actually calls for it.
  const precautions: string[] = [];
  if (w?.uvIndexMax != null && w.uvIndexMax >= 6) {
    precautions.push(
      `strong sun today (uv ${w.uvIndexMax}) — sleeves, a hat, or shade if you're out for long`,
    );
  } else if (w?.uvIndexMax != null && w.uvIndexMax >= 3) {
    precautions.push("moderate sun today — worth the sunscreen if you'll be outside a while");
  }
  if (w?.tempMaxC != null && w.tempMaxC >= 27) {
    precautions.push(
      `it'll reach about ${Math.round(w.tempMaxC)}° — pace the day and keep water close`,
    );
  }
  if (precautions.length) lines.push(precautions.join(". ") + ".");

  // The plan for the day stays hers: one gentle medication mention at most,
  // phrased from her own schedule.
  if (med) {
    lines.push(
      med.schedule
        ? `no rush — did the ${med.name.toLowerCase()} happen ${med.schedule.toLowerCase()}?`
        : `no rush — did the ${med.name.toLowerCase()} happen?`,
    );
  } else {
    lines.push("no rush — how are the hands this morning?");
  }

  return lines.join("\n\n");
}

function withinWakingHours(timezone: string): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: timezone || "Europe/London",
      }).format(new Date()),
    );
    return hour >= 8 && hour < 22;
  } catch {
    return true; // an unparseable timezone should not silence the message
  }
}

function sendblueConfigured(): boolean {
  return Boolean(
    process.env.SENDBLUE_API_KEY_ID &&
      process.env.SENDBLUE_API_KEY_SECRET &&
      process.env.SENDBLUE_FROM_NUMBER,
  );
}

async function sendViaSendblue(
  to: string,
  content: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.sendblue.co/api/send-message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "sb-api-key-id": process.env.SENDBLUE_API_KEY_ID as string,
        "sb-api-secret-key": process.env.SENDBLUE_API_KEY_SECRET as string,
      },
      body: JSON.stringify({
        number: to,
        from_number: process.env.SENDBLUE_FROM_NUMBER,
        content,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error_message?: string;
      };
      return {
        ok: false,
        error: `sendblue ${res.status}: ${body.error_message ?? "unknown"}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "sendblue send failed",
    };
  }
}
