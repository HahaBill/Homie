import type { Env } from "./env";
import type { ParsedReply } from "./types";

async function structured<T>(env: Env, systemPrompt: string, userPayload: unknown, schemaName: string, schema: object): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload, null, 2) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, strict: true, schema },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no structured content");
  return JSON.parse(content) as T;
}

const PARSE_REPLY_SCHEMA = {
  type: "object",
  properties: {
    pain_level: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    areas: { type: "array", items: { type: "string" } },
    meds_taken: { type: ["boolean", "null"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    note: { type: "string" },
    reply_text: { type: "string" },
  },
  required: ["pain_level", "areas", "meds_taken", "confidence", "note", "reply_text"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are Homie, texting a person who has lupus or rheumatoid arthritis, right after they
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

Then write reply_text — the next thing Homie says back. Rules, no exceptions:
- Under 12 words.
- Lowercase-comfortable, plain, warm — like a friend, not a form.
- Never a diagnosis, a medication change, a flare prediction, or a score.
- Never a population comparison ("worse than average") — only ever their own words back to them.
- Give an easy way to not continue (never demand more detail).
- If the reply already contains red-flag emergency language, you will not be called — a
  hard-coded rule handles that before you ever see the message. Do not attempt to triage
  urgency yourself.`;

/**
 * The one OpenAI call behind an inbound Sendblue reply: structures it into an
 * observation (see docs/PRD.md §5, §8) and drafts the short reply Homie sends
 * back. No conversation memory yet — see docs/ARCHITECTURE.md's note that a
 * Durable Object could carry that context later; this call only ever sees
 * the single reply it's parsing.
 */
export async function parseAndComposeReply(env: Env, replyText: string): Promise<ParsedReply> {
  return structured<ParsedReply>(
    env,
    SYSTEM_PROMPT,
    { patient_message: replyText },
    "parsed_reply",
    PARSE_REPLY_SCHEMA
  );
}
