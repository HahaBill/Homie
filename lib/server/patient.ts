import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "./supabase";

/**
 * Bridges the two identity systems. The thread's canonical identity is the
 * users row; a Clerk session can reach it through either door:
 *
 *   phone — the original join; the Sendblue worker keys on users.phone
 *   email — added when Clerk email sign-in shipped ahead of phone auth
 *
 * Resolution order is phone, then email, then create-by-email — so a
 * signed-in visitor is ALWAYS linked and the dashboard always opens their
 * own (possibly empty) thread. When a phone lands on a Clerk account later,
 * the same row is backfilled and both doors open onto one record.
 */

export type PatientRow = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  status: string;
  timezone?: string;
  consent_at?: string | null;
};

export type PatientLookup =
  | { ok: true; patient: PatientRow }
  | { ok: false; reason: "unauthenticated" | "no_identity" };

const COLS = "id, phone, email, name, status, timezone, consent_at";

export async function getPatientForSession(): Promise<PatientLookup> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const phone =
    user.phoneNumbers.find((p) => p.id === user.primaryPhoneNumberId)
      ?.phoneNumber ?? user.phoneNumbers[0]?.phoneNumber ?? null;
  const email =
    (
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
        ?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? ""
    )
      .trim()
      .toLowerCase() || null;

  if (!phone && !email) return { ok: false, reason: "no_identity" };

  const db = supabaseAdmin();

  if (phone) {
    const { data, error } = await db
      .from("users")
      .select(COLS)
      .eq("phone", phone)
      .maybeSingle();
    if (error) throw new Error(`patient lookup (phone): ${error.message}`);
    if (data) return { ok: true, patient: data as PatientRow };
  }

  if (email) {
    const { data, error } = await db
      .from("users")
      .select(COLS)
      .eq("email", email)
      .maybeSingle();
    if (error) throw new Error(`patient lookup (email): ${error.message}`);
    if (data) {
      // The account gained a phone since this row was created by email —
      // backfill it so the Sendblue thread and the web thread converge.
      // Best-effort: a unique collision (that phone already has its own
      // texting row) leaves the rows separate rather than failing the login.
      if (phone && !data.phone) {
        const { data: updated } = await db
          .from("users")
          .update({ phone })
          .eq("id", data.id)
          .is("phone", null)
          .select(COLS)
          .maybeSingle();
        if (updated) return { ok: true, patient: updated as PatientRow };
      }
      return { ok: true, patient: data as PatientRow };
    }
  }

  // First visit through the web door: create the record. consent_at stays
  // unset — browsing your own page is not consent to be messaged (PRD §7.4);
  // the morning cron keeps skipping this row until the onboarding flow
  // captures explicit consent.
  const { data: created, error: insertError } = await db
    .from("users")
    .insert({
      phone,
      email,
      name: user.firstName ?? null,
    })
    .select(COLS)
    .single();
  if (insertError) {
    // Raced by a concurrent request creating the same identity — re-read.
    const { data: raced } = email
      ? await db.from("users").select(COLS).eq("email", email).maybeSingle()
      : await db.from("users").select(COLS).eq("phone", phone as string).maybeSingle();
    if (raced) return { ok: true, patient: raced as PatientRow };
    throw new Error(`patient create: ${insertError.message}`);
  }
  return { ok: true, patient: created as PatientRow };
}
