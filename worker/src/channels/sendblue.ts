import type { Env } from "../env";
import { normalizePhone, type OutboundMessage } from "../types";
import type { MessagingAdapter, SendResult } from "./types";

/** Raw inbound webhook payload shape — see docs.sendblue.com/getting-started/receiving-messages. */
export type SendblueInboundPayload = {
  content?: string;
  from_number?: string;
  to_number?: string;
  number?: string;
  sendblue_number?: string;
  message_handle?: string;
  media_url?: string;
  service?: string;
  is_outbound?: boolean;
  status?: string;
  [key: string]: unknown;
};

export const sendblueAdapter: MessagingAdapter = {
  channel: "imessage",

  isConfigured(env: Env): boolean {
    return Boolean(env.SENDBLUE_API_KEY_ID && env.SENDBLUE_API_KEY_SECRET && env.SENDBLUE_FROM_NUMBER);
  },

  async send(env: Env, to: string, message: OutboundMessage): Promise<SendResult> {
    if (!this.isConfigured(env)) {
      return { status: "failed", error: "sendblue not configured" };
    }
    try {
      const res = await fetch("https://api.sendblue.co/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "sb-api-key-id": env.SENDBLUE_API_KEY_ID,
          "sb-api-secret-key": env.SENDBLUE_API_KEY_SECRET,
        },
        body: JSON.stringify({
          number: normalizePhone(to),
          from_number: normalizePhone(env.SENDBLUE_FROM_NUMBER),
          content: message.text,
          ...(message.media_url ? { media_url: message.media_url } : {}),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { message_handle?: string; error_message?: string };
      if (!res.ok) {
        return { status: "failed", error: `sendblue ${res.status}: ${body.error_message ?? "unknown error"}` };
      }
      return { status: "sent", providerMessageId: body.message_handle };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : "sendblue send failed" };
    }
  },
};

/**
 * Sendblue's webhook docs describe per-webhook / global secrets delivered in
 * "request headers" without pinning down a name on the receiving-messages
 * page; the `sb-signing-secret` header is the one documented for their own
 * Chat SDK adapter, so that's what we check here. Gated by
 * SKIP_SENDBLUE_VERIFY — flip it off and confirm the real header from a
 * captured webhook before relying on this in production (see README).
 */
export function verifySendblueSignature(env: Env, header: string | undefined): boolean {
  if (!env.SENDBLUE_WEBHOOK_SECRET) return true;
  return header === env.SENDBLUE_WEBHOOK_SECRET;
}
