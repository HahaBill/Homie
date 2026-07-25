import { Agent, run, setDefaultModelProvider, setTracingDisabled } from "@openai/agents-core";
import { OpenAIProvider, setDefaultOpenAIKey } from "@openai/agents-openai";
import { z } from "zod";
import type { Env } from "./env";
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

Then write reply_text, the next thing Homie says back. Rules, no exceptions:
- Under 12 words.
- Lowercase comfortable, plain, warm, like a friend, not a form.
- No dashes or colons anywhere, not a hyphen, not an em dash, not a colon. Write it as one
  plain sentence the way someone would actually type a text, not the way a written paragraph
  is punctuated.
- Weave in who you are sometimes, naturally, like "hey it's homie" or "i'm your homie either
  way", but not in every single reply. Never let it crowd out actually responding to what they
  said, and never push past the 12-word limit for it.
- Never a diagnosis, a medication change, a flare prediction, or a score.
- Never a population comparison, like "worse than average", only ever their own words back to them.
- Give an easy way to not continue (never demand more detail).
- If the reply already contains red-flag emergency language, you will not be called — a
  hard-coded rule handles that before you ever see the message. Do not attempt to triage
  urgency yourself.`;

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
      outputType: ParsedReplySchema,
    });
    cachedModel = env.OPENAI_MODEL;
  }
  return cachedAgent;
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
  return result.finalOutput;
}
