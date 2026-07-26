import { Agent, run } from "@openai/agents-core";
import { setDefaultOpenAIKey } from "@openai/agents-openai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Env } from "./env";

/**
 * The on-demand daily summary.
 *
 * Homie's answer to the personal-agent-template's morning briefing skill.
 * That one surfaces active focus from memory, assigned issues and a next
 * action; the equivalents here are what Homie has been noticing, what stands
 * out across the surfaces, and one suggested next step.
 *
 * The point is that it reads ACROSS surfaces. A text thread, a web chat and a
 * voice-call transcript all hang off the same users row, so the summary can
 * say "you mentioned this on the phone on Tuesday and again by text on
 * Thursday" — which no single surface could say on its own.
 *
 * Its own Agent instance, deliberately separate from the reply parser in
 * ai.ts: different job, different output shape, and one changing should not
 * drag the other with it.
 */

const SummarySchema = z.object({
  focus: z.string(),
  notable: z.array(z.string()),
  suggestion: z.string(),
});

export type DailySummary = z.infer<typeof SummarySchema> & {
  generatedAt: string;
  sources: { messages: number; calls: number; days: number };
};

const WINDOW_DAYS = 14;
/** Long transcripts are trimmed — the model needs the gist, not every turn. */
const TRANSCRIPT_CHARS = 1200;

const INSTRUCTIONS = `You are Homie, writing a short private summary for the person you check in on.
They asked for it; they are reading it themselves.

You are given the last two weeks across every surface: morning texts and their replies,
web chat, voice call transcripts and summaries, reported symptoms, medication records, and
today's weather.

Produce three things.

focus — two or three sentences on what has actually been going on for them lately, in plain
warm language. Their own words where you have them. This is the part they will read first,
so it must be specific: not "you have had some symptoms" but what, when, and how it went.

notable — two to four short lines, each one concrete observation worth seeing on its own.
Prefer things that only become visible by looking across surfaces or across days: something
said on a call and again in a text, a run of days, a change from their own usual. Reference
dates or days where you have them. Skip anything you cannot support from the data.

suggestion — one next step, gentle, easy to decline. Something they could do or note or
raise with their clinician. Never more than one.

Rules, no exceptions:
- Never diagnose, never change or suggest changing a dose, never predict a flare.
- Compare them to their own baseline, never to other people or an average.
- No scores or grades in your prose.
- Lowercase-comfortable, plain, warm, like a friend who has been paying attention.
- If there is very little data, say so plainly and keep it short rather than padding.
- If something in the data reads as urgent or frightening, say plainly that it is worth
  raising with a person, and name their clinician rather than trying to handle it.`;

let cachedAgent: Agent<unknown, typeof SummarySchema> | null = null;
let cachedModel: string | null = null;

function agentFor(env: Env): Agent<unknown, typeof SummarySchema> {
  if (!cachedAgent || cachedModel !== env.OPENAI_MODEL) {
    cachedAgent = new Agent({
      name: "Homie daily summary",
      instructions: INSTRUCTIONS,
      model: env.OPENAI_MODEL,
      modelSettings: { temperature: 0.4 },
      outputType: SummarySchema,
    });
    cachedModel = env.OPENAI_MODEL;
  }
  return cachedAgent;
}

export async function buildDailySummary(env: Env, userId: string): Promise<DailySummary | null> {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [user, checkins, calls, meds, weather] = await Promise.all([
    db.from("users").select("name").eq("id", userId).maybeSingle(),
    db
      .from("checkins")
      .select("id, sent_at, message_text, replied_at, reply_text")
      .eq("user_id", userId)
      .gte("sent_at", since)
      .order("sent_at", { ascending: true }),
    db
      .from("calls")
      .select("started_at, created_at, duration_seconds, summary, transcript")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: true }),
    db.from("medications").select("name, dose, schedule").eq("user_id", userId),
    db
      .from("weather")
      .select("date, pressure_delta_24h, temp_c")
      .eq("user_id", userId)
      .gte("date", since.slice(0, 10))
      .order("date", { ascending: true }),
  ]);

  const checkinRows = checkins.data ?? [];
  const callRows = calls.data ?? [];

  // Observations hang off checkins, so fetch them by the ids we already have.
  const ids = checkinRows.map((c) => c.id);
  const observations = ids.length
    ? await db
        .from("observations")
        .select("checkin_id, pain_level, areas, meds_taken, note, created_at")
        .in("checkin_id", ids)
    : { data: [] as Array<Record<string, unknown>> };

  if (checkinRows.length === 0 && callRows.length === 0) return null;

  const lines: string[] = [];
  const name = user.data?.name;
  if (name) lines.push(`Their name: ${name}`);

  if (meds.data?.length) {
    lines.push(
      `Medications on record: ${meds.data
        .map((m) => [m.name, m.dose, m.schedule].filter(Boolean).join(" "))
        .join("; ")}`,
    );
  }

  lines.push("", "MESSAGES (texts and web chat):");
  for (const c of checkinRows) {
    const day = (c.sent_at ?? "").slice(0, 10);
    if (c.message_text) lines.push(`  ${day} homie: ${c.message_text.replace(/\n+/g, " ")}`);
    if (c.reply_text) lines.push(`  ${day} them: ${c.reply_text.replace(/\n+/g, " ")}`);
  }

  const obs = (observations.data ?? []) as Array<{
    pain_level: number | null;
    areas: string[] | null;
    meds_taken: boolean | null;
    note: string | null;
    created_at: string;
  }>;
  if (obs.length) {
    lines.push("", "STRUCTURED OBSERVATIONS (pain 1-5, null means they were not clear):");
    for (const o of obs) {
      lines.push(
        `  ${o.created_at.slice(0, 10)} pain=${o.pain_level ?? "unclear"} areas=${
          (o.areas ?? []).join(",") || "none"
        } meds_taken=${o.meds_taken ?? "unsaid"}${o.note ? ` note="${o.note}"` : ""}`,
      );
    }
  }

  if (callRows.length) {
    lines.push("", "VOICE CALLS:");
    for (const call of callRows) {
      const day = (call.started_at ?? call.created_at ?? "").slice(0, 10);
      const mins = call.duration_seconds ? `${Math.round(call.duration_seconds / 60)} min` : "";
      lines.push(`  ${day} call ${mins}${call.summary ? ` — ${call.summary}` : ""}`);
      if (call.transcript) {
        lines.push(`    transcript: ${call.transcript.slice(0, TRANSCRIPT_CHARS).replace(/\n+/g, " | ")}`);
      }
    }
  }

  if (weather.data?.length) {
    lines.push("", "WEATHER BY DAY (pressure change over 24h in hPa):");
    for (const w of weather.data) {
      lines.push(`  ${w.date} delta=${w.pressure_delta_24h ?? "?"}`);
    }
  }

  setDefaultOpenAIKey(env.OPENAI_API_KEY);
  const result = await run(agentFor(env), lines.join("\n"));
  if (!result.finalOutput) return null;

  return {
    ...result.finalOutput,
    generatedAt: new Date().toISOString(),
    sources: {
      messages: checkinRows.reduce(
        (n, c) => n + (c.message_text ? 1 : 0) + (c.reply_text ? 1 : 0),
        0,
      ),
      calls: callRows.length,
      days: WINDOW_DAYS,
    },
  };
}
