import { Hono } from "hono";
import { parseAndComposeReply } from "./ai";
import { sendblueAdapter, verifySendblueSignature, type SendblueInboundPayload } from "./channels/sendblue";
import type { Env } from "./env";
import {
  classifyCommand,
  DELETE_RESPONSE,
  isRedFlag,
  myDataResponseText,
  RED_FLAG_RESPONSE,
  STOP_RESPONSE,
  type SafetyCommand,
} from "./safety";
import {
  closeCheckinWithReply,
  createAdHocCheckin,
  deleteUserData,
  findOrCreateUserByPhone,
  getDataSummary,
  getOpenCheckin,
  insertAuditLog,
  insertObservation,
  setUserStatus,
} from "./supabase";
import { normalizePhone, type User } from "./types";

const app = new Hono<{ Bindings: Env }>();

function log(fields: Record<string, unknown>): void {
  // Structured, content-free-where-possible logs — see the sender/text fields
  // below, which are the one deliberate exception (needed to debug delivery
  // during the hackathon build) and should be dropped before real users are live.
  console.log(JSON.stringify(fields));
}

app.get("/health", (c) => c.json({ ok: true, service: "homie-worker" }));

// ---------------------------------------------------------------------------
// Inbound: Sendblue webhook
// ---------------------------------------------------------------------------

app.post("/webhooks/sendblue", async (c) => {
  const skipVerify = c.env.SKIP_SENDBLUE_VERIFY === "1";
  if (!skipVerify && c.env.SENDBLUE_WEBHOOK_SECRET) {
    const ok = verifySendblueSignature(c.env, c.req.header("sb-signing-secret"));
    if (!ok) return c.json({ error: "invalid signature" }, 401);
  }

  const payload = await c.req.json<SendblueInboundPayload>().catch(() => null);
  if (!payload) return c.json({ received: true });

  // Ignore outbound status callbacks — only inbound messages reach this handler.
  if (payload.is_outbound) return c.json({ received: true });

  const senderRaw = payload.from_number || payload.number;
  const text = payload.content ?? "";
  if (!senderRaw || !text) {
    log({ event: "webhook_received", provider: "sendblue", ignored: true, reason: "no_sender_or_text" });
    return c.json({ received: true });
  }

  let sender: string;
  try {
    sender = normalizePhone(senderRaw);
  } catch {
    log({ event: "webhook_received", provider: "sendblue", ignored: true, reason: "bad_phone" });
    return c.json({ received: true });
  }

  log({ event: "webhook_received", provider: "sendblue", sender, message_handle: payload.message_handle ?? null });

  // Acknowledge Sendblue immediately; do the actual work after responding.
  c.executionCtx.waitUntil(handleInboundMessage(c.env, sender, text));

  return c.json({ received: true });
});

/**
 * The one inbound pipeline. Order is deliberate and safety-critical:
 *   1. resolve the user (cheap read/write, not a "model path" concern)
 *   2. red-flag bypass                         — PRD §7.1, before any model call
 *   3. STOP / DELETE / MY DATA fixed responses  — PRD §7.3, also before any model call
 *   4. normal flow: structure the reply via OpenAI, persist, reply
 */
async function handleInboundMessage(env: Env, sender: string, text: string): Promise<void> {
  try {
    const user = await findOrCreateUserByPhone(env, sender);
    await insertAuditLog(env, user.id, "inbound_received", { text });

    if (isRedFlag(text)) {
      await sendblueAdapter.send(env, sender, { text: RED_FLAG_RESPONSE });
      await insertAuditLog(env, user.id, "red_flag_bypass", { text });
      log({ event: "red_flag_bypass", user_id: user.id });
      return;
    }

    const command = classifyCommand(text);
    if (command) {
      await handleSafetyCommand(env, user, command, sender);
      return;
    }

    if (user.status !== "active") {
      log({ event: "inbound_ignored", reason: "user_not_active", status: user.status, user_id: user.id });
      return;
    }

    const open = await getOpenCheckin(env, user.id);
    const checkin = open
      ? await closeCheckinWithReply(env, open.id, text)
      : await createAdHocCheckin(env, user.id, text);

    const parsed = await parseAndComposeReply(env, text);
    await insertObservation(env, checkin.id, parsed);

    const result = await sendblueAdapter.send(env, sender, { text: parsed.reply_text });
    await insertAuditLog(env, user.id, "reply_sent", { checkin_id: checkin.id, status: result.status });
    log({ event: "inbound_reply_sent", user_id: user.id, checkin_id: checkin.id, status: result.status });
  } catch (err) {
    log({ event: "inbound_reply_failed", sender, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleSafetyCommand(env: Env, user: User, command: SafetyCommand, sender: string): Promise<void> {
  if (command === "stop") {
    await setUserStatus(env, user.id, "stopped");
    await sendblueAdapter.send(env, sender, { text: STOP_RESPONSE });
    await insertAuditLog(env, user.id, "stop", {});
    log({ event: "safety_command", command, user_id: user.id });
    return;
  }

  if (command === "delete") {
    const summary = await getDataSummary(env, user);
    await sendblueAdapter.send(env, sender, { text: DELETE_RESPONSE });
    await insertAuditLog(env, user.id, "delete", { checkins_deleted: summary.checkins_count });
    await deleteUserData(env, user.id);
    log({ event: "safety_command", command, user_id: user.id, checkins_deleted: summary.checkins_count });
    return;
  }

  const summary = await getDataSummary(env, user);
  await sendblueAdapter.send(env, sender, { text: myDataResponseText(summary) });
  await insertAuditLog(env, user.id, "my_data_request", {});
  log({ event: "safety_command", command, user_id: user.id });
}

// ---------------------------------------------------------------------------
// Outbound smoke test — proves the Sendblue adapter works without waiting on
// a real inbound webhook. Refuses if WORKER_ADMIN_TOKEN isn't configured.
// ---------------------------------------------------------------------------

app.post("/send-test", async (c) => {
  if (!c.env.WORKER_ADMIN_TOKEN) {
    return c.json({ error: "WORKER_ADMIN_TOKEN not configured — route disabled" }, 501);
  }
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${c.env.WORKER_ADMIN_TOKEN}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json<{ to?: string; text?: string }>().catch(() => ({}) as any);
  if (!body.to || !body.text) {
    return c.json({ error: "to and text are required" }, 400);
  }

  const result = await sendblueAdapter.send(c.env, body.to, { text: body.text });
  return c.json(result, result.status === "sent" ? 200 : 502);
});

export default {
  fetch: app.fetch.bind(app),
};
