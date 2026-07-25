import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC-signed, expiring report-link tokens (docs/ARCHITECTURE.md).
 * Format: base64url(userId.exp) + "." + base64url(hmac-sha256(payload)).
 * A token is a bearer credential — short expiry, every issue is audited,
 * and STOP / DELETE invalidate outstanding links by flipping user status
 * (verifyToken callers must re-check the user row).
 */

const b64url = (buf: Buffer) => buf.toString("base64url");

function secret(): string {
  const s = process.env.LINK_SIGNING_SECRET;
  if (!s) throw new Error("LINK_SIGNING_SECRET must be set");
  return s;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}

/** Hard ceiling on a link's lifetime, independent of what a caller asks for. */
export const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;

export function mintToken(userId: string, ttlSeconds: number): string {
  // A bearer credential's expiry is a security property, so it is validated
  // at the point of signing rather than trusted from the caller. NaN would
  // otherwise sign an exp of "NaN", which parses back to a malformed token,
  // and a negative or absurd TTL would mint something already dead or
  // effectively permanent.
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new RangeError(`ttlSeconds must be an integer in 1..${MAX_TTL_SECONDS}`);
  }
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${exp}`;
  return `${b64url(Buffer.from(payload))}.${b64url(sign(payload))}`;
}

export type TokenCheck =
  | { ok: true; userId: string; exp: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyToken(token: string): TokenCheck {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  let payload: string;
  try {
    payload = Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const dot = payload.lastIndexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed" };
  const userId = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  if (!userId || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };

  const expected = sign(payload);
  let given: Buffer;
  try {
    given = Buffer.from(parts[1], "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, userId, exp };
}
