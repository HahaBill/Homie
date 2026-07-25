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

  const { data: existing, error: findError } = await db.from("users").select("*").eq("phone", phone).maybeSingle();
  if (findError) throw new Error(`findOrCreateUserByPhone (lookup): ${findError.message}`);
  if (existing) return existing as User;

  const { data: created, error: insertError } = await db
    .from("users")
    .insert({ phone })
    .select("*")
    .single();
  return orThrow(created as User | null, insertError, "findOrCreateUserByPhone (insert)");
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
  const { count, error: countError } = await db
    .from("checkins")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (countError) throw new Error(`getDataSummary (count): ${countError.message}`);

  const { data: earliest, error: earliestError } = await db
    .from("checkins")
    .select("sent_at")
    .eq("user_id", user.id)
    .order("sent_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (earliestError) throw new Error(`getDataSummary (earliest): ${earliestError.message}`);

  return {
    phone: user.phone,
    consent_at: user.consent_at,
    checkins_count: count ?? 0,
    first_checkin_at: (earliest as { sent_at: string } | null)?.sent_at ?? null,
  };
}
