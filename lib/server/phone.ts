import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Phone verification, over Sendblue rather than Clerk.
 *
 * Clerk gates phone sign-in behind its paid tier, and a number typed into a
 * form is worthless on its own: anyone could claim a number they do not own
 * and start receiving another person's pain scores and medication history.
 * Since Homie already texts through Sendblue, it can prove ownership the
 * same way — send a code to the number and require it back.
 */

export const CODE_TTL_SECONDS = 10 * 60;
/** Six attempts against a six-digit code leaves a 1-in-166k guess. */
export const MAX_ATTEMPTS = 6;

/**
 * E.164, matching worker/src/types.ts normalizePhone exactly — the two sides
 * must agree or a verified number still fails to join the texting row.
 * Accepts a UK-style leading 0 with an explicit country code supplied by the
 * caller, because "07…" is what people actually type.
 */
export function normalizePhone(value: string, defaultCountry = "+44"): string {
  let v = value.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "").trim();
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (!v.startsWith("+")) {
    // A national number: drop the trunk zero before prefixing the country.
    v = `${defaultCountry}${v.replace(/^0+/, "")}`;
  }
  if (!/^\+[1-9]\d{6,14}$/.test(v)) {
    throw new Error("That does not look like a mobile number.");
  }
  return v;
}

/** Cryptographically random, and never zero-padded away from six digits. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Codes are stored hashed. The row is password-equivalent while it lives, and
 * the phone is mixed in so a hash lifted from one row cannot be replayed
 * against another number.
 */
export function hashCode(code: string, phone: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}

export function codeMatches(code: string, phone: string, expected: string): boolean {
  const a = Buffer.from(hashCode(code, phone), "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** In Homie's voice — this text is the product, not a system notice. */
export function verificationMessage(code: string): string {
  return `Hi, this is Homie, checking in with you. Your code is ${code}. It expires in ten minutes.`;
}
