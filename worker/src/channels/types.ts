import type { Env } from "../env";
import type { MessagingChannel, OutboundMessage } from "../types";

export type SendResult = {
  providerMessageId?: string;
  service?: "iMessage" | "SMS";
  status: "sent" | "failed";
  error?: string;
};

/**
 * Transport-only. Adapters must not touch Supabase, decide safety overrides,
 * or call OpenAI — that all lives in index.ts, which is the one place that
 * knows about users and check-ins.
 */
export interface MessagingAdapter {
  channel: MessagingChannel;
  isConfigured(env: Env): boolean;
  send(env: Env, to: string, message: OutboundMessage): Promise<SendResult>;
}
