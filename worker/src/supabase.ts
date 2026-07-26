import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "./env";
import type { Checkin, CheckinChannel, Observation, ParsedReply, User, UserStatus } from "./types";

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
 * Direct lookup for server-to-server callers that already resolved the user
 * — the web chat path, where Next.js has matched a Clerk session (by phone
 * or, since email sign-in, by email) to a users row and sends its id.
 * Deliberately no create-on-miss: an unknown id is a caller bug, not a new
 * patient.
 */
export async function getUserById(env: Env, id: string): Promise<User | null> {
  const db = client(env);
  const { data, error } = await db.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getUserById: ${error.message}`);
  return (data as User | null) ?? null;
}

/**
 * How long a claim may sit in "processing" before a retry is allowed to take
 * it over. Comfortably longer than the worst-case inbound pipeline (one model
 * call plus a handful of Supabase round trips), short enough that a genuinely
 * dropped delivery still gets a second chance while Sendblue is retrying.
 */
const CLAIM_LEASE_MS = 5 * 60 * 1000;

/**
 * Webhook replay guard. Sendblue retries deliveries, so the worker claims each
 * one before writing anything else and a retry can never double-book a
 * check-in or double-reply.
 *
 * The claim is a lease, not a tombstone. An insert-only guard suppresses the
 * retry the moment the key lands — which means a delivery that claimed and
 * then died mid-pipeline (model timeout, isolate eviction, Supabase blip) is
 * permanently swallowed: the message is never processed and never retried.
 * So a claim starts as "processing" and only becomes "completed" once the
 * pipeline has actually finished. A duplicate of a completed event is
 * rejected; a duplicate of a lease older than CLAIM_LEASE_MS is handed to the
 * retry that asked for it.
 */
export async function claimWebhookEvent(env: Env, dedupeKey: string): Promise<boolean> {
  const db = client(env);
  const now = new Date();
  const { error } = await db
    .from("webhook_events")
    .insert({ dedupe_key: dedupeKey, status: "processing", claimed_at: now.toISOString() });
  if (!error) return true;
  if (error.code !== "23505") throw new Error(`claimWebhookEvent: ${error.message}`);

  // The key exists. Reclaim it only if it is an expired lease — the filters
  // ride on the UPDATE itself, so two concurrent retries can't both win: the
  // first moves claimed_at forward and the second no longer matches.
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS).toISOString();
  const { data, error: reclaimError } = await db
    .from("webhook_events")
    .update({ claimed_at: now.toISOString() })
    .eq("dedupe_key", dedupeKey)
    .eq("status", "processing")
    .lt("claimed_at", staleBefore)
    .select("dedupe_key");
  if (reclaimError) throw new Error(`claimWebhookEvent: ${reclaimError.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Closes a claim. Until this runs the event is only leased, so a crash between
 * claim and completion leaves the delivery retryable rather than lost.
 */
export async function completeWebhookEvent(env: Env, dedupeKey: string): Promise<void> {
  const db = client(env);
  const { error } = await db
    .from("webhook_events")
    .update({ status: "completed" })
    .eq("dedupe_key", dedupeKey);
  if (error) throw new Error(`completeWebhookEvent: ${error.message}`);
}

/**
 * Most recent checkin awaiting a reply, if any. Scoped to channel='text' —
 * belt and suspenders alongside createCallCheckin never leaving a call-row
 * open in the first place: this is the function a text reply gets matched
 * against, and a call's row must never be a candidate for it regardless of
 * how it was created.
 */
export async function getOpenCheckin(env: Env, userId: string): Promise<Checkin | null> {
  const db = client(env);
  const { data, error } = await db
    .from("checkins")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", "text" satisfies CheckinChannel)
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

/**
 * Creates the checkins row for a call in one insert, already closed —
 * replied_at and reply_text set to the final recap text, never left "open"
 * the way a text checkin briefly is. An open call-checkin would be a real
 * race: getOpenCheckin has no channel filter, so a text arriving in the
 * gap between "call recorded" and "recap generated" could be matched
 * against it and closed with her text reply instead of getting its own
 * row. Only called once the recap text (red-flag response or the model's)
 * is final — see sendCallRecap in index.ts.
 */
export async function createCallCheckin(
  env: Env,
  userId: string,
  sentAt: string | null,
  replyText: string
): Promise<Checkin> {
  const db = client(env);
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("checkins")
    .insert({
      user_id: userId,
      channel: "call" satisfies CheckinChannel,
      sent_at: sentAt ?? now,
      message_text: null,
      replied_at: now,
      reply_text: replyText,
    })
    .select("*")
    .single();
  return orThrow(data as Checkin | null, error, "createCallCheckin");
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

/** Everything the report page renders — see report.ts. */
export type ReportData = {
  user: User;
  /** One entry per structured observation, dated by the check-in it closed. */
  observations: Array<{
    at: string;
    pain_level: number | null;
    areas: string[];
    meds_taken: boolean | null;
    note: string | null;
  }>;
  /**
   * Every check-in, oldest first, either channel. A call's "reply" is its
   * recap (see createCallCheckin) and its message_text is always null — the
   * full transcript/duration live on `call`, joined in below by checkin_id,
   * so the page can offer it as an optional detail without carrying a
   * potentially-long transcript on every checkin row it doesn't need it on.
   */
  checkins: Array<{
    channel: CheckinChannel;
    at: string;
    message_text: string | null;
    reply_text: string | null;
    call?: { duration_seconds: number | null; transcript: string | null };
  }>;
  /** Daily barometric context, when the cron has been writing it. */
  weather: Array<{ date: string; pressure_delta_24h: number | null }>;
};

/**
 * One parallel round trip for the whole page: user row, check-ins (both
 * channels — see docs/PRD.md via the 20260726040000 migration), observations
 * (dated via their check-in through an embedded join, so no second dependent
 * query), weather, and calls (joined onto their checkin by id, for the
 * "see the whole call" detail) all fly together. Returns null when the user
 * doesn't exist; the caller decides what a non-active status means.
 */
export async function getReportPayload(env: Env, userId: string): Promise<ReportData | null> {
  const db = client(env);

  const [userRes, checkinsRes, obsRes, weatherRes, callsRes] = await Promise.all([
    db.from("users").select("*").eq("id", userId).maybeSingle(),
    db
      .from("checkins")
      .select("id, channel, sent_at, message_text, replied_at, reply_text")
      .eq("user_id", userId)
      .order("sent_at", { ascending: true })
      .limit(120),
    db
      .from("observations")
      .select("pain_level, areas, meds_taken, note, created_at, checkins!inner(user_id, sent_at, replied_at)")
      .eq("checkins.user_id", userId)
      // Newest 200 — without an order the limit would keep an arbitrary
      // subset once a long-running user passes it. Re-sorted ascending below.
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("weather")
      .select("date, pressure_delta_24h")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(120),
    db
      .from("calls")
      .select("checkin_id, duration_seconds, transcript")
      .eq("user_id", userId)
      .not("checkin_id", "is", null)
      .limit(60),
  ]);
  if (userRes.error) throw new Error(`getReportPayload (user): ${userRes.error.message}`);
  if (checkinsRes.error) throw new Error(`getReportPayload (checkins): ${checkinsRes.error.message}`);
  if (obsRes.error) throw new Error(`getReportPayload (observations): ${obsRes.error.message}`);
  if (weatherRes.error) throw new Error(`getReportPayload (weather): ${weatherRes.error.message}`);
  if (callsRes.error) throw new Error(`getReportPayload (calls): ${callsRes.error.message}`);

  const user = userRes.data as User | null;
  if (!user) return null;

  const callByCheckinId = new Map<string, { duration_seconds: number | null; transcript: string | null }>();
  for (const c of (callsRes.data ?? []) as Array<{
    checkin_id: string | null;
    duration_seconds: number | null;
    transcript: string | null;
  }>) {
    if (c.checkin_id) callByCheckinId.set(c.checkin_id, { duration_seconds: c.duration_seconds, transcript: c.transcript });
  }

  const checkins: ReportData["checkins"] = ((checkinsRes.data ?? []) as Array<{
    id: string;
    channel: CheckinChannel;
    sent_at: string;
    message_text: string | null;
    replied_at: string | null;
    reply_text: string | null;
  }>).map((c) => ({
    channel: c.channel,
    at: c.replied_at ?? c.sent_at,
    message_text: c.message_text,
    reply_text: c.reply_text,
    call: c.channel === "call" ? callByCheckinId.get(c.id) : undefined,
  }));

  type ObsRow = {
    pain_level: number | null;
    areas: string[] | null;
    meds_taken: boolean | null;
    note: string | null;
    created_at: string;
    // supabase-js types an embedded to-one as object, but returns an array
    // when it can't infer the relationship's cardinality — accept both.
    checkins: { sent_at: string; replied_at: string | null } | Array<{ sent_at: string; replied_at: string | null }>;
  };
  const observations = ((obsRes.data ?? []) as unknown as ObsRow[])
    .map((o) => {
      const c = Array.isArray(o.checkins) ? o.checkins[0] : o.checkins;
      return {
        at: c?.replied_at ?? c?.sent_at ?? o.created_at,
        pain_level: o.pain_level,
        areas: o.areas ?? [],
        meds_taken: o.meds_taken,
        note: o.note,
      };
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1));

  return {
    user,
    observations,
    checkins,
    weather: (weatherRes.data ?? []) as ReportData["weather"],
  };
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

/**
 * A Vapi call report. Keyed on vapi_call_id so a webhook retry (or the
 * status-update that precedes the end-of-call report) updates the same row
 * rather than duplicating the call.
 *
 * user_id is resolved by the caller and may be null: an unknown number is
 * recorded as an unlinked call rather than minting a patient nobody
 * consented to being.
 */
export async function upsertCall(
  env: Env,
  row: {
    vapi_call_id: string;
    user_id: string | null;
    phone: string | null;
    direction: string | null;
    status: string | null;
    ended_reason: string | null;
    started_at: string | null;
    ended_at: string | null;
    duration_seconds: number | null;
    cost: number | null;
    summary: string | null;
    transcript: string | null;
    recording_url: string | null;
    payload: unknown;
  }
): Promise<void> {
  const db = client(env);
  const { error } = await db.from("calls").upsert(row, { onConflict: "vapi_call_id" });
  if (error) throw new Error(`upsertCall: ${error.message}`);
}

/**
 * Finalizes a stored call: writes Homie's own generated recap as
 * calls.summary — replacing whatever Vapi's analysis.summary held, since
 * that field is generated by Vapi's own model with no voice/safety review
 * — and links it to the checkins row created for it, so the report page's
 * unified check-in list can reach this call's full transcript/duration
 * (see getReportPayload) without a second lookup keyed on something else.
 */
export async function finalizeCallSummary(
  env: Env,
  vapiCallId: string,
  summary: string,
  checkinId: string
): Promise<void> {
  const db = client(env);
  const { error } = await db.from("calls").update({ summary, checkin_id: checkinId }).eq("vapi_call_id", vapiCallId);
  if (error) throw new Error(`finalizeCallSummary: ${error.message}`);
}

/** Look up a patient by phone WITHOUT creating one. */
export async function findUserByPhone(env: Env, phone: string): Promise<User | null> {
  const db = client(env);
  const { data, error } = await db.from("users").select("*").eq("phone", phone).maybeSingle();
  if (error) throw new Error(`findUserByPhone: ${error.message}`);
  return (data as User | null) ?? null;
}

/**
 * The inbound-call twin of lib/server/vapi-context.ts's buildVapiPatientContext
 * — same purpose (fills {{patient_context}} in the assistant's system prompt),
 * different runtime, so it can't share that implementation (Next's version
 * imports "server-only" and path-aliased modules that don't resolve here).
 * Deliberately lighter: no weather/pressure correlation, because this runs
 * inside Vapi's assistant-request response window (the call is ringing,
 * waiting on this), not a user-initiated button press with no such budget.
 * Same exclusion as the outbound version and for the same reason: never
 * includes a flare-prediction score, only what already happened.
 */
export async function buildCallContext(env: Env, userId: string): Promise<string> {
  const db = client(env);

  const [userRes, medsRes, checkinsRes] = await Promise.all([
    db.from("users").select("name, onboarding_profile").eq("id", userId).maybeSingle(),
    db.from("medications").select("name, dose, schedule").eq("user_id", userId).limit(5),
    db
      .from("checkins")
      .select("reply_text")
      .eq("user_id", userId)
      .eq("channel", "text" satisfies CheckinChannel)
      .not("reply_text", "is", null)
      .order("sent_at", { ascending: false })
      .limit(3),
  ]);

  const profile =
    typeof userRes.data?.onboarding_profile === "object" && userRes.data.onboarding_profile !== null
      ? (userRes.data.onboarding_profile as Record<string, unknown>)
      : {};

  const lines: string[] = [];

  if (userRes.data?.name) lines.push(`Name: ${userRes.data.name}.`);

  const conditions = Array.isArray(profile.conditions)
    ? profile.conditions.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];
  if (conditions.length) lines.push(`Conditions: ${conditions.join(", ")}.`);

  const meds = (medsRes.data ?? []) as Array<{ name: string; dose: string | null; schedule: string | null }>;
  if (meds.length) {
    const medText = meds.map((m) => [m.name, m.dose, m.schedule].filter(Boolean).join(", ")).join("; ");
    lines.push(`Medication: ${medText}.`);
  }

  if (typeof profile.baseline_feeling === "number") {
    lines.push(`Baseline feeling reported at signup: ${profile.baseline_feeling} out of 5.`);
  }
  if (typeof profile.remember === "string" && profile.remember.trim()) {
    lines.push(`She asked to be remembered: ${profile.remember.trim()}.`);
  }
  if (typeof profile.care_contact === "string" && profile.care_contact.trim()) {
    lines.push(`Usual care contact: ${profile.care_contact.trim()}.`);
  }

  const quotes = ((checkinsRes.data ?? []) as Array<{ reply_text: string }>)
    .reverse()
    .map((c) => `"${c.reply_text}"`);
  if (quotes.length) lines.push(`Recent check-ins, in her own words: ${quotes.join("; ")}.`);

  return lines.join(" ");
}
