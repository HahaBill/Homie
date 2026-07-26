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
      const number = normalizePhone(to);
      const fromNumber = normalizePhone(env.SENDBLUE_FROM_NUMBER);
      const service = await evaluateService(env, number);
      if (!service.ok) {
        return { status: "failed", error: service.error };
      }

      const res = await fetch("https://api.sendblue.co/api/send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "sb-api-key-id": env.SENDBLUE_API_KEY_ID,
          "sb-api-secret-key": env.SENDBLUE_API_KEY_SECRET,
        },
        body: JSON.stringify({
          number,
          from_number: fromNumber,
          content: message.text,
          ...(message.media_url ? { media_url: message.media_url } : {}),
        }),
      });

      const body = (await res.json().catch(() => ({}))) as { message_handle?: string; error_message?: string };
      if (!res.ok) {
        return { status: "failed", error: `sendblue ${res.status}: ${body.error_message ?? "unknown error"}` };
      }
      return { status: "sent", providerMessageId: body.message_handle, service: service.service };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : "sendblue send failed" };
    }
  },
};

async function evaluateService(
  env: Env,
  number: string,
): Promise<{ ok: true; service: "iMessage" | "SMS" } | { ok: false; error: string }> {
  const url = new URL("https://api.sendblue.co/api/evaluate-service");
  url.searchParams.set("number", number);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "sb-api-key-id": env.SENDBLUE_API_KEY_ID,
      "sb-api-secret-key": env.SENDBLUE_API_KEY_SECRET,
    },
  });
  const body = (await res.json().catch(() => ({}))) as {
    service?: "iMessage" | "SMS";
    error_message?: string;
  };

  if (!res.ok) {
    return {
      ok: false,
      error: `sendblue lookup ${res.status}: ${body.error_message ?? "unknown error"}`,
    };
  }
  if (body.service !== "iMessage" && body.service !== "SMS") {
    return { ok: false, error: "sendblue lookup did not return a supported service" };
  }
  return { ok: true, service: body.service };
}

/**
 * Confirmed against Sendblue's docs: signing secrets (per-webhook or
 * account-level "global") are delivered in the `sb-signing-secret` header.
 */
export function verifySendblueSignature(env: Env, header: string | undefined): boolean {
  if (!env.SENDBLUE_WEBHOOK_SECRET) return true;
  return header === env.SENDBLUE_WEBHOOK_SECRET;
}
