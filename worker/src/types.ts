// Shared domain types for the Homie worker. No provider-specific shapes live
// here — those belong in channels/*.ts.

export type MessagingChannel = "imessage";

export type OutboundMessage = {
  text: string;
  media_url?: string;
};

export type UserStatus = "active" | "stopped" | "deleted";

export type User = {
  id: string;
  phone: string;
  name: string | null;
  timezone: string;
  consent_at: string | null;
  consent_version: string | null;
  baseline_hrv: number | null;
  status: UserStatus;
  created_at: string;
};

export type Checkin = {
  id: string;
  user_id: string;
  sent_at: string;
  message_text: string | null;
  replied_at: string | null;
  reply_text: string | null;
  created_at: string;
};

export type Observation = {
  id: string;
  checkin_id: string;
  pain_level: number | null;
  areas: string[];
  meds_taken: boolean | null;
  confidence: number | null;
  note: string | null;
  created_at: string;
};

/** Structured output of the reply-parsing model call — see ai.ts. */
export type ParsedReply = {
  pain_level: number | null;
  areas: string[];
  meds_taken: boolean | null;
  confidence: number;
  note: string;
  reply_text: string;
};

/**
 * Normalises any phone-ish string (WhatsApp-prefixed, spaced, etc.) to bare
 * E.164. Used everywhere a phone number crosses a provider boundary, so the
 * canonical user identity never carries a provider prefix.
 *
 *   normalizePhone("+44 7700 900123") -> "+447700900123"
 */
export function normalizePhone(value: string): string {
  const normalized = value
    .replace(/^whatsapp:/i, "")
    .replace(/[^\d+]/g, "")
    .trim();

  if (!normalized || !normalized.startsWith("+")) {
    throw new Error("Phone number must be valid E.164");
  }

  return normalized;
}
