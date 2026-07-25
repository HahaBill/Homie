import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { Checkin, Observation, ParsedReply, User, UserStatus } from "./types";

let cachedClient: SupabaseClient | null = null;

/**
 * Service-role client — this worker is a trusted backend, not a browser, so
 * it deliberately bypasses RLS rather than impersonating a user JWT. RLS
 * policies in supabase/migrations/0001_init.sql exist for future direct
 * client access (e.g. the report page), not for this process.
 */
function client(env: Env): SupabaseClient {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

function orThrow<T>(data: T | null, error: { message: string } | null, context: string): T {
  if (error) throw new Error(`${context}: ${error.message}`);
  if (data === null) throw new Error(`${context}: no row returned`);
  return data;
}

/**
 * Looks up a user by phone, creating one on first contact. There is no
 * consent-capture UI wired up yet (that's the Next.js sign-in flow — see
 * app/sign-in) — a fresh row starts as "active" with consent_at unset. Do
 * not treat this as a substitute for PRD §7.4's explicit-consent requirement
 * before a real (non-synthetic) user goes live.
 */
export async function findOrCreateUserByPhone(env: Env, phone: string): Promise<User> {
  const db = client(env);
  // Upsert: one round trip instead of select-then-insert, and race-safe —
  // two concurrent first-contact webhooks both land on the same row instead
  // of one losing the insert race. The conflict "update" writes phone back
  // to itself and touches no other column.
  const { data, error } = await db
    .from("users")
    .upsert({ phone }, { onConflict: "phone" })
    .select("*")
    .single();
  return orThrow(data as User | null, error, "findOrCreateUserByPhone");
}

/**
 * Webhook replay guard. Sendblue retries deliveries; the first insert of a
 * dedupe key wins and every later one hits the primary key and returns
 * false. Callers claim before writing anything else so a retry can never
 * double-book a check-in or double-reply.
 */
export async function claimWebhookEvent(env: Env, dedupeKey: string): Promise<boolean> {
  const db = client(env);
  const { error } = await db.from("webhook_events").insert({ dedupe_key: dedupeKey });
  if (error) {
    if (error.code === "23505") return false;
    throw new Error(`claimWebhookEvent: ${error.message}`);
  }
  return true;
}

/** Most recent checkin awaiting a reply, if any. */
export async function getOpenCheckin(env: Env, userId: string): Promise<Checkin | null> {
  const db = client(env);
  const { data, error } = await db
    .from("checkins")
    .select("*")
    .eq("user_id", userId)
    .is("replied_at", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOpenCheckin: ${error.message}`);
  return data as Checkin | null;
}

/** A reply that arrived with no outstanding morning message to answer. */
export async function createAdHocCheckin(env: Env, userId: string, replyText: string): Promise<Checkin> {
  const db = client(env);
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("checkins")
    .insert({ user_id: userId, sent_at: now, message_text: null, replied_at: now, reply_text: replyText })
    .select("*")
    .single();
  return orThrow(data as Checkin | null, error, "createAdHocCheckin");
}

export async function closeCheckinWithReply(env: Env, checkinId: string, replyText: string): Promise<Checkin> {
  const db = client(env);
  const { data, error } = await db
    .from("checkins")
    .update({ replied_at: new Date().toISOString(), reply_text: replyText })
    .eq("id", checkinId)
    .select("*")
    .single();
  return orThrow(data as Checkin | null, error, "closeCheckinWithReply");
}

export async function insertObservation(env: Env, checkinId: string, parsed: ParsedReply): Promise<Observation> {
  const db = client(env);
  const { data, error } = await db
    .from("observations")
    .insert({
      checkin_id: checkinId,
      pain_level: parsed.pain_level,
      areas: parsed.areas,
      meds_taken: parsed.meds_taken,
      confidence: parsed.confidence,
      note: parsed.note,
    })
    .select("*")
    .single();
  return orThrow(data as Observation | null, error, "insertObservation");
}

/** audit_log is insert-only — see docs/PRD.md §8. Never update or delete rows. */
export async function insertAuditLog(
  env: Env,
  userId: string | null,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  const db = client(env);
  const { error } = await db.from("audit_log").insert({ user_id: userId, event, payload });
  if (error) throw new Error(`insertAuditLog: ${error.message}`);
}

export async function setUserStatus(env: Env, userId: string, status: UserStatus): Promise<void> {
  const db = client(env);
  const { error } = await db.from("users").update({ status }).eq("id", userId);
  if (error) throw new Error(`setUserStatus: ${error.message}`);
}

/**
 * PRD §7.3: DELETE must actually erase data, not just flag it. Checkins and
 * observations cascade from the users row (see migration); audit_log rows
 * keep their event history but drop the user_id link (ON DELETE SET NULL) so
 * the audit trail survives without retaining personal data.
 */
export async function deleteUserData(env: Env, userId: string): Promise<void> {
  const db = client(env);
  const { error } = await db.from("users").delete().eq("id", userId);
  if (error) throw new Error(`deleteUserData: ${error.message}`);
}

export type DataSummary = {
  phone: string;
  consent_at: string | null;
  checkins_count: number;
  first_checkin_at: string | null;
};

/** Powers the MY DATA reply — a plain summary of what Homie holds, computed live rather than from a stale export. */
export async function getDataSummary(env: Env, user: User): Promise<DataSummary> {
  const db = client(env);
  // One round trip: `count: "exact"` reports the full match set while the
  // ascending order + limit(1) returns just the earliest row.
  const { data, count, error } = await db
    .from("checkins")
    .select("sent_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("sent_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`getDataSummary: ${error.message}`);

  return {
    phone: user.phone,
    consent_at: user.consent_at,
    checkins_count: count ?? 0,
    first_checkin_at: (data?.[0] as { sent_at: string } | undefined)?.sent_at ?? null,
  };
}
