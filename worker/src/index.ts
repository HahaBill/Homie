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
  claimWebhookEvent,
  closeCheckinWithReply,
  completeWebhookEvent,
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
  // Structured and content-free: no message text reaches stdout.
  console.log(JSON.stringify(fields));
}

/**
 * Message text for an audit payload. audit_log is insert-only (PRD §8) and
 * erasure only nulls the user_id link, so raw inbound text written here
 * survives a DELETE request — it is health data that outlives the right to
 * erasure. Store a length instead, unless DEBUG_LOG_TEXT is explicitly on.
 */
function auditText(env: Env, text: string): Record<string, unknown> {
  return env.DEBUG_LOG_TEXT === "1" ? { text } : { text_length: text.length };
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
  c.executionCtx.waitUntil(
    handleInboundMessage(c.env, sender, text, new URL(c.req.url).origin, payload.message_handle)
  );

  return c.json({ received: true });
});

/**
 * The greeting image (worker static asset — see wrangler.jsonc "assets").
 * Rides along when Homie introduces itself: the model flags "who are you"
 * style messages, and a users row created seconds ago means this is their
 * first ever message. Safety paths never attach it.
 */
const GREETING_IMAGE_PATH = "/homie-greeting.png";
const FIRST_CONTACT_WINDOW_MS = 10_000;

function isFirstContact(user: User): boolean {
  return Date.now() - new Date(user.created_at).getTime() < FIRST_CONTACT_WINDOW_MS;
}

/**
 * The one inbound pipeline. Ordering is deliberate on two axes at once —
 * safety and latency:
 *
 *   1. red-flag bypass         — pure string check, zero I/O (PRD §7.1)
 *   2. STOP / DELETE / MY DATA — fixed responses, still no model call (§7.3)
 *   3. normal flow             — the model call is the long pole (~1–2.5s
 *      measured), so it starts at t=0 and every Supabase round trip runs
 *      underneath it; the reply is sent before the observation is persisted,
 *      because the send is the part the user is actually waiting on.
 */
async function handleInboundMessage(
  env: Env,
  sender: string,
  text: string,
  origin: string,
  providerMessageId?: string
): Promise<void> {
  try {
    // Red-flag bypass runs ahead of everything that can fail: the 999
    // guidance must go out even if Supabase or OpenAI are down, so it
    // deliberately skips the dedupe claim too — a Sendblue retry re-sending
    // the safety message is the acceptable failure mode; not sending it
    // because the database hiccuped is not.
    if (isRedFlag(text)) {
      const audit = (async () => {
        const user = await findOrCreateUserByPhone(env, sender);
        await insertAuditLog(env, user.id, "red_flag_bypass", auditText(env, text));
      })().catch((err) => log({ event: "red_flag_audit_failed", error: String(err) }));
      const result = await sendblueAdapter.send(env, sender, { text: RED_FLAG_RESPONSE });
      log({ event: "red_flag_bypass", status: result.status });
      await audit;
      return;
    }

    const dedupeKey = providerMessageId
      ? `sendblue:${providerMessageId}`
      : `sendblue:${sender}:${text}:${utcMinute()}`;

    const command = classifyCommand(text);
    if (command) {
      if (!(await claimWebhookEvent(env, dedupeKey))) {
        log({ event: "webhook_duplicate", dedupe_key: dedupeKey });
        return;
      }
      const user = await findOrCreateUserByPhone(env, sender);
      await handleSafetyCommand(env, user, command, sender);
      await completeWebhookEvent(env, dedupeKey);
      return;
    }

    // Normal flow. Start the model call first — everything below happens
    // while it runs.
    const parsePromise = parseAndComposeReply(env, text);
    parsePromise.catch(() => {}); // bail-out paths below must not leave an unhandled rejection

    if (!(await claimWebhookEvent(env, dedupeKey))) {
      // A duplicate burns one abandoned model call; retries are rare enough
      // that this beats putting the claim's round trip ahead of the model.
      log({ event: "webhook_duplicate", dedupe_key: dedupeKey });
      return;
    }

    const user = await findOrCreateUserByPhone(env, sender);
    const auditInbound = insertAuditLog(env, user.id, "inbound_received", auditText(env, text)).catch((err) =>
      log({ event: "audit_failed", user_id: user.id, error: String(err) })
    );

    if (user.status !== "active") {
      log({ event: "inbound_ignored", reason: "user_not_active", status: user.status, user_id: user.id });
      await auditInbound;
      await completeWebhookEvent(env, dedupeKey);
      return;
    }

    const open = await getOpenCheckin(env, user.id);
    const checkin = open
      ? await closeCheckinWithReply(env, open.id, text)
      : await createAdHocCheckin(env, user.id, text);

    const parsed = await parsePromise;
    const withGreeting = parsed.is_introduction || isFirstContact(user);

    // The send is what she's actually waiting on, so it still starts alongside
    // the observation write — but the two settle independently. Under
    // Promise.all a failed observation insert rejected the whole step, which
    // logged a reply that had already been delivered as inbound_reply_failed
    // and skipped its reply_sent audit entry.
    const [sendResult, persistResult] = await Promise.allSettled([
      sendblueAdapter.send(env, sender, {
        text: parsed.reply_text,
        ...(withGreeting ? { media_url: `${origin}${GREETING_IMAGE_PATH}` } : {}),
      }),
      insertObservation(env, checkin.id, parsed),
    ]);
    await auditInbound;

    if (persistResult.status === "rejected") {
      log({
        event: "observation_persist_failed",
        user_id: user.id,
        checkin_id: checkin.id,
        error: String(persistResult.reason),
      });
    }

    // Only a failed send is worth a retry — rethrow so the claim's lease is
    // left open for Sendblue's next attempt.
    if (sendResult.status === "rejected") throw sendResult.reason;

    await insertAuditLog(env, user.id, "reply_sent", {
      checkin_id: checkin.id,
      status: sendResult.value.status,
      observation_persisted: persistResult.status === "fulfilled",
    });
    log({
      event: "inbound_reply_sent",
      user_id: user.id,
      checkin_id: checkin.id,
      status: sendResult.value.status,
    });
    await completeWebhookEvent(env, dedupeKey);
  } catch (err) {
    log({ event: "inbound_reply_failed", sender, error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleSafetyCommand(env: Env, user: User, command: SafetyCommand, sender: string): Promise<void> {
  if (command === "stop") {
    // Strictly ordered, never raced: the confirmation is a promise that the
    // messages have stopped. Running it alongside the status write meant a
    // failed write could still be followed by "you're stopped" while the next
    // morning cron, reading status 'active', texted her anyway.
    await setUserStatus(env, user.id, "stopped");
    await sendblueAdapter.send(env, sender, { text: STOP_RESPONSE });
    await insertAuditLog(env, user.id, "stop", {});
    log({ event: "safety_command", command, user_id: user.id });
    return;
  }

  if (command === "delete") {
    const summary = await getDataSummary(env, user);
    // Erasure is the obligation here (PRD §7.3); the confirmation text is not.
    // Audit strictly first — the row's user_id must still exist at insert time
    // (it becomes NULL afterwards via ON DELETE SET NULL) — but neither a
    // failed audit nor a failed send may skip the delete, which is what
    // bundling them into Promise.all did: one rejection and deleteUserData
    // never ran, leaving the data she asked us to erase in place.
    try {
      await insertAuditLog(env, user.id, "delete", { checkins_deleted: summary.checkins_count });
    } catch (err) {
      log({ event: "delete_audit_failed", user_id: user.id, error: String(err) });
    }
    await deleteUserData(env, user.id);
    log({ event: "safety_command", command, user_id: user.id, checkins_deleted: summary.checkins_count });
    await sendblueAdapter.send(env, sender, { text: DELETE_RESPONSE });
    return;
  }

  const summary = await getDataSummary(env, user);
  // Her answer comes first; a failed audit write must not swallow it.
  await sendblueAdapter.send(env, sender, { text: myDataResponseText(summary) });
  try {
    await insertAuditLog(env, user.id, "my_data_request", {});
  } catch (err) {
    log({ event: "my_data_audit_failed", user_id: user.id, error: String(err) });
  }
  log({ event: "safety_command", command, user_id: user.id });
}

/**
 * Fallback dedupe bucket when Sendblue omits message_handle: the same
 * sender+text within the same UTC minute collapses to one delivery.
 */
function utcMinute(): string {
  return new Date().toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Inbound: web chat. Same pipeline as the Sendblue webhook — same gates in
// the same order — but the reply travels back over HTTP to the Next.js app
// instead of out through Sendblue. Server-to-server only: the Next route
// holds the bearer token and the Clerk-verified phone number; a browser
// never reaches this directly.
// ---------------------------------------------------------------------------

app.post("/chat", async (c) => {
  if (!c.env.WORKER_ADMIN_TOKEN) {
    return c.json({ error: "WORKER_ADMIN_TOKEN not configured — route disabled" }, 501);
  }
  const auth = c.req.header("Authorization");
  if (auth !== `Bearer ${c.env.WORKER_ADMIN_TOKEN}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const body = await c.req.json<{ phone?: string; text?: string }>().catch(() => ({}) as any);
  if (!body.phone || !body.text?.trim()) {
    return c.json({ error: "phone and text are required" }, 400);
  }

  let sender: string;
  try {
    sender = normalizePhone(body.phone);
  } catch {
    return c.json({ error: "invalid phone" }, 400);
  }
  const text = body.text.trim();

  try {
    // Red-flag bypass first, same as the webhook path (PRD §7.1) — fixed
    // guidance, no model call, and the audit must not block the response.
    if (isRedFlag(text)) {
      c.executionCtx.waitUntil(
        (async () => {
          const user = await findOrCreateUserByPhone(c.env, sender);
          await insertAuditLog(c.env, user.id, "red_flag_bypass", { ...auditText(c.env, text), channel: "web" });
        })().catch((err) => log({ event: "red_flag_audit_failed", channel: "web", error: String(err) }))
      );
      log({ event: "red_flag_bypass", channel: "web" });
      return c.json({ reply: RED_FLAG_RESPONSE, red_flag: true });
    }

    const command = classifyCommand(text);
    if (command) {
      const user = await findOrCreateUserByPhone(c.env, sender);
      if (command === "stop") {
        await setUserStatus(c.env, user.id, "stopped");
        await insertAuditLog(c.env, user.id, "stop", { channel: "web" });
        return c.json({ reply: STOP_RESPONSE });
      }
      if (command === "delete") {
        const summary = await getDataSummary(c.env, user);
        // Same contract as the SMS path: audit first so user_id still resolves,
        // but never let a failed audit write cancel the erasure itself.
        try {
          await insertAuditLog(c.env, user.id, "delete", {
            channel: "web",
            checkins_deleted: summary.checkins_count,
          });
        } catch (err) {
          log({ event: "delete_audit_failed", channel: "web", user_id: user.id, error: String(err) });
        }
        await deleteUserData(c.env, user.id);
        return c.json({ reply: DELETE_RESPONSE });
      }
      const summary = await getDataSummary(c.env, user);
      try {
        await insertAuditLog(c.env, user.id, "my_data_request", { channel: "web" });
      } catch (err) {
        log({ event: "my_data_audit_failed", channel: "web", user_id: user.id, error: String(err) });
      }
      return c.json({ reply: myDataResponseText(summary) });
    }

    // Normal flow, model call first as in handleInboundMessage.
    const parsePromise = parseAndComposeReply(c.env, text);
    parsePromise.catch(() => {});

    const user = await findOrCreateUserByPhone(c.env, sender);
    if (user.status !== "active") {
      return c.json({ reply: "Homie is paused for this number. Text START from your phone to pick it back up." });
    }
    const auditInbound = insertAuditLog(c.env, user.id, "inbound_received", {
      ...auditText(c.env, text),
      channel: "web",
    }).catch((err) => log({ event: "audit_failed", user_id: user.id, error: String(err) }));

    const open = await getOpenCheckin(c.env, user.id);
    const checkin = open
      ? await closeCheckinWithReply(c.env, open.id, text)
      : await createAdHocCheckin(c.env, user.id, text);

    const parsed = await parsePromise;

    await Promise.all([insertObservation(c.env, checkin.id, parsed), auditInbound]);
    await insertAuditLog(c.env, user.id, "reply_sent", { checkin_id: checkin.id, channel: "web" });
    log({ event: "web_chat_reply", user_id: user.id, checkin_id: checkin.id });

    const withGreeting = parsed.is_introduction || isFirstContact(user);
    return c.json({
      reply: parsed.reply_text,
      ...(withGreeting ? { image_url: `${new URL(c.req.url).origin}${GREETING_IMAGE_PATH}` } : {}),
    });
  } catch (err) {
    log({ event: "web_chat_failed", error: err instanceof Error ? err.message : String(err) });
    return c.json({ error: "chat failed" }, 500);
  }
});

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
