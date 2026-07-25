import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { fetchPressure, type PressureSnapshot } from "@/lib/server/openmeteo";

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

type UserRow = {
  id: string;
  phone: string;
  name: string | null;
  timezone: string;
};

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
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

  const results: Array<Record<string, unknown>> = [];
  for (const user of (users ?? []) as UserRow[]) {
    if (!withinWakingHours(user.timezone)) {
      results.push({ user: user.id, skipped: "quiet_hours" });
      continue;
    }

    const text = composeMorning(user, snapshot);

    if (dryRun) {
      results.push({ user: user.id, dry_run: true, preview: text });
      continue;
    }

    const sent = await sendViaSendblue(user.phone, text);
    if (!sent.ok) {
      await audit("morning_send_failed", user.id, { error: sent.error });
      results.push({ user: user.id, failed: sent.error });
      continue;
    }

    if (snapshot) {
      await db.from("weather").upsert(
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
    }
    await db.from("checkins").insert({ user_id: user.id, message_text: text });
    await audit("morning_sent", user.id, {
      pressure_delta: snapshot?.pressureDelta24h ?? null,
    });
    results.push({ user: user.id, sent: true });
  }

  return NextResponse.json(
    { date: today, dry_run: dryRun, pressure: snapshot, results },
    { headers: { "cache-control": "private, no-store" } },
  );
}

function composeMorning(user: UserRow, w: PressureSnapshot | null): string {
  const name = user.name ? `morning, ${user.name.toLowerCase()}` : "morning";
  let weatherLine = "";
  if (w && w.pressureDelta24h <= -5) {
    weatherLine =
      " pressure's dropping today, which is usually a rough combination for you.";
  } else if (w && w.pressureDelta24h >= 5) {
    weatherLine = " pressure's climbing back up today.";
  } else if (w) {
    weatherLine = " pressure's steady today.";
  }
  return `${name}.${weatherLine}\n\nno rush — how are the hands this morning?`;
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
