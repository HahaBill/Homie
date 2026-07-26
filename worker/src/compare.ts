/**
 * Constant-time string comparison for shared secrets.
 *
 * `a === b` on a secret leaks its prefix through timing: the comparison exits
 * at the first differing byte, so an attacker can recover the value one
 * character at a time. This always walks the full length.
 *
 * Workers have no node:crypto timingSafeEqual, so it is done by hand. Lengths
 * are compared up front — that leaks the length, which is not the secret.
 */
export function secretsMatch(given: string | undefined | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
