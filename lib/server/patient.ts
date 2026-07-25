import "server-only";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "./supabase";

/**
 * Bridges the two identity systems: Clerk authenticates the browser with a
 * phone number, and that same E.164 number is the key the Sendblue worker
 * stores against `users.phone`. No mapping table — the number is the join.
 */

export type PatientRow = {
  id: string;
  phone: string;
  name: string | null;
  status: string;
};

export type PatientLookup =
  | { ok: true; patient: PatientRow }
  | { ok: false; reason: "unauthenticated" | "no_phone" | "no_record" };

export async function getPatientForSession(): Promise<PatientLookup> {
  const user = await currentUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const phone =
    user.phoneNumbers.find((p) => p.id === user.primaryPhoneNumberId)
      ?.phoneNumber ?? user.phoneNumbers[0]?.phoneNumber;
  if (!phone) return { ok: false, reason: "no_phone" };

  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id, phone, name, status")
    .eq("phone", phone)
    .maybeSingle();
  if (error) throw new Error(`patient lookup: ${error.message}`);
  if (!data) return { ok: false, reason: "no_record" };
  return { ok: true, patient: data as PatientRow };
}
