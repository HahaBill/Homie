import { Agent, run, setDefaultModelProvider, setTracingDisabled } from "@openai/agents-core";
import { OpenAIProvider, setDefaultOpenAIKey } from "@openai/agents-openai";
import { z } from "zod";
import type { Env } from "./env";
import { weatherTool } from "./tools/weather";
import type { ParsedReply } from "./types";

// Imported from @openai/agents-core + @openai/agents-openai directly instead
// of the @openai/agents facade: the facade's entrypoint statically does
// `export * as realtime from '@openai/agents-realtime'`, and with no
// sideEffects markers anywhere in the packages esbuild can't tree-shake any
// of it — the realtime/voice stack would ride along in the bundle unused.
// The two setup lines below mirror exactly what the facade's own entrypoint
// runs at import time (minus its tracing exporter, which we disable anyway).
setDefaultModelProvider(new OpenAIProvider({ cacheResponsesWebSocketModels: false }));

// Workers can't reliably flush the SDK's background trace-export loop before
// the request ends (see the SDK's Cloudflare Workers troubleshooting notes) —
// disable tracing rather than ship traces that may silently never make it out.
setTracingDisabled(true);

const ParsedReplySchema = z.object({
  pain_level: z.number().int().min(1).max(5).nullable(),
  areas: z.array(z.string()),
  meds_taken: z.boolean().nullable(),
  confidence: z.number().min(0).max(1),
  note: z.string(),
  reply_text: z.string(),
  is_introduction: z.boolean(),
  wants_report: z.boolean(),
});

const INSTRUCTIONS = `You are Homie, texting a person who has lupus or rheumatoid arthritis, right after they
replied to a check-in. Homie notices. It never advises.

Convert their free-text reply into structured data:
- pain_level: your best estimate on a 1-5 scale, but ONLY if the text gives you a real basis
  for a number. If it's ambiguous ("okay I guess", "meh"), return null rather than guessing a
  number that looks certain — ambiguity is stored as ambiguity, never as false precision.
- areas: body parts or joints mentioned as affected, lowercase, empty array if none mentioned.
- meds_taken: true/false only if the reply actually says so; null if not mentioned.
- confidence: 0 to 1, your confidence in pain_level specifically (0 if pain_level is null).
- note: one short factual clause capturing anything else worth keeping, in their own words
  where possible. Empty string if there's nothing beyond the fields above.
- is_introduction: true only when they're asking who or what Homie is ("who is this",
  "what are you", "who am i texting"), or the message reads like a first hello with nothing
  health related in it. False for everything else, including ordinary greetings that come
  with a health update.
- wants_report: true when they're asking to see their health over time, like "how's my
  health been", "show me my progress", "can i see my report", "how am i doing overall",
  "show me the trends or charts". False for an ordinary day update, and false for a bare
  "how are you" aimed at homie itself.

Then write reply_text, the next thing Homie says back. Rules, no exceptions:
- Under 12 words.
- Lowercase comfortable, plain, warm, like a friend, not a form.
- No dashes or colons anywhere, not a hyphen, not an em dash, not a colon. Write it as one
  plain sentence the way someone would actually type a text, not the way a written paragraph
  is punctuated.
- Weave in who you are sometimes, naturally, like "hey it's homie" or "i'm your homie either
  way", but not in every single reply. Never let it crowd out actually responding to what they
  said, and never push past the 12-word limit for it.
- When is_introduction is true, the reply should say who homie is in one warm plain
  sentence, like "i'm homie, i check in so you don't have to", still within every rule above.
- When wants_report is true, say the page is right below, like "here you go, your page is
  just below". Never write a link or url yourself, one gets attached for you.
- Never a diagnosis, a medication change, a flare prediction, or a score.
- Never a population comparison, like "worse than average", only ever their own words back to them.
- Give an easy way to not continue (never demand more detail).
- If the reply already contains red-flag emergency language, you will not be called — a
  hard-coded rule handles that before you ever see the message. Do not attempt to triage
  urgency yourself.

Tools:
- You have a \`weather\` tool. Call it when they ask about the weather, the pressure, the
  sun, the heat, or how the day looks outside. Report what it gives you plainly, still
  inside every rule above, and still under 12 words.
- Never turn a weather reading into a prediction about their symptoms. "pressure's dropping
  today" is a fact and is fine. "you'll flare tomorrow" is a forecast about their body and
  is never allowed. You may say a pattern has happened before; you may not say it will
  happen again.
- Do not call the tool for an ordinary day update that never mentions the weather.`;

// One Agent per isolate — instructions and schema are static, and the model
// name is the same on every request of a deployment, so there's no reason to
// re-derive the JSON schema from zod per message.
let cachedAgent: Agent<unknown, typeof ParsedReplySchema> | null = null;
let cachedModel: string | null = null;

function agentFor(env: Env): Agent<unknown, typeof ParsedReplySchema> {
  if (!cachedAgent || cachedModel !== env.OPENAI_MODEL) {
    cachedAgent = new Agent({
      name: "Homie reply parser",
      instructions: INSTRUCTIONS,
      model: env.OPENAI_MODEL,
      modelSettings: { temperature: 0.2 },
      tools: [weatherTool],
      outputType: ParsedReplySchema,
    });
    cachedModel = env.OPENAI_MODEL;
  }
  return cachedAgent;
}

const CallRecapSchema = z.object({
  recap_text: z.string(),
});

/**
 * Deliberately our own call, not a pass-through of Vapi's analysis.summary:
 * that field is generated by Vapi's own model with no visibility into
 * Homie's voice or safety rules, and texting it straight to a patient would
 * bypass every constraint the rest of this file enforces. Same rules as
 * reply_text, minus the introduction/report-link cases (a call recap is
 * never someone's first message), plus room for two sentences since a call
 * covers more ground than a text reply.
 */
const CALL_RECAP_INSTRUCTIONS = `You are Homie, texting a short follow up right after a phone call just ended. Homie
notices. It never advises.

You are given the full transcript of the call. Write recap_text: one short text message
reflecting back what was actually said, for the person you just spoke with.

Rules, no exceptions:
- Two short sentences at most.
- Lowercase comfortable, plain, warm, like a friend, not a form.
- No dashes or colons anywhere, not a hyphen, not an em dash, not a colon.
- Reflect only what was actually said on the call. Never invent a detail, a next step, or a
  fact that was not in the transcript.
- Never a diagnosis, a medication change, a flare prediction, or a score.
- Never a population comparison, only ever their own words back to them.
- Weave in who you are sometimes, naturally, like "hey it's homie", but do not force it if it
  does not fit in two sentences.
- If the transcript already contains red-flag emergency language, you will not be called for
  it — a hard-coded rule handles that before you ever see the transcript. Do not attempt to
  triage urgency yourself.`;

let cachedCallRecapAgent: Agent<unknown, typeof CallRecapSchema> | null = null;
let cachedCallRecapModel: string | null = null;

function callRecapAgentFor(env: Env): Agent<unknown, typeof CallRecapSchema> {
  if (!cachedCallRecapAgent || cachedCallRecapModel !== env.OPENAI_MODEL) {
    cachedCallRecapAgent = new Agent({
      name: "Homie call recap",
      instructions: CALL_RECAP_INSTRUCTIONS,
      model: env.OPENAI_MODEL,
      modelSettings: { temperature: 0.2 },
      outputType: CallRecapSchema,
    });
    cachedCallRecapModel = env.OPENAI_MODEL;
  }
  return cachedCallRecapAgent;
}

/**
 * Turns a Vapi call transcript into the text sent after the call (see
 * index.ts's sendCallRecap). Callers must run isRedFlag() on the transcript
 * themselves before calling this — this function performs no safety
 * classification of its own, same division of responsibility as
 * parseAndComposeReply and the text pipeline it mirrors.
 */
export async function summarizeCallForText(env: Env, transcript: string): Promise<string> {
  setDefaultOpenAIKey(env.OPENAI_API_KEY);

  const result = await run(callRecapAgentFor(env), transcript);
  if (!result.finalOutput) {
    throw new Error("Homie call recap produced no output");
  }
  return result.finalOutput.recap_text;
}

/**
 * The one OpenAI call behind an inbound Sendblue reply: structures it into an
 * observation (see docs/PRD.md §5, §8) and drafts the short reply Homie sends
 * back. No conversation memory yet — see docs/ARCHITECTURE.md's note that a
 * Durable Object could carry that context later; this call only ever sees
 * the single reply it's parsing.
 */
export async function parseAndComposeReply(env: Env, replyText: string): Promise<ParsedReply> {
  // Workers have no persistent process.env, so the SDK's lazy key lookup
  // never sees a Worker secret — set it from the per-request binding every
  // call (a module-global assignment, effectively free).
  setDefaultOpenAIKey(env.OPENAI_API_KEY);

  const result = await run(agentFor(env), replyText);
  if (!result.finalOutput) {
    throw new Error("Homie reply parser produced no output");
  }

  // confidence is defined as confidence in pain_level specifically, so it is
  // meaningless without one. The instructions ask for 0 when pain_level is
  // null, but an instruction is not a guarantee — normalise here so a stored
  // observation can never claim 0.8 confidence in a score that doesn't exist.
  // Enforced after the run rather than in ParsedReplySchema: the schema is
  // handed to the SDK to derive the structured-output JSON schema, and a
  // transform on it would not survive that round trip.
  const parsed = result.finalOutput;
  return parsed.pain_level === null ? { ...parsed, confidence: 0 } : parsed;
}
