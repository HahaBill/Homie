import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison for shared secrets arriving in request headers.
 *
 * `a !== b` on a secret leaks its prefix through response timing: an attacker
 * who can measure enough requests recovers it one byte at a time. lib/server/
 * token.ts already gets this right for report links; the CRON_SECRET and
 * LINK_API_SECRET header checks did not.
 *
 * Both sides are hashed first so the comparison is over two fixed-width
 * digests — timingSafeEqual throws on length mismatch, and the raw lengths
 * would themselves leak the secret's size.
 */
export function secretsMatch(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
