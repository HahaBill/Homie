import type { Env } from "./env";

/**
 * HMAC-signed, expiring report-link tokens — the exact wire format of
 * lib/server/token.ts in the Next.js app: base64url(userId.exp) + "." +
 * base64url(hmac-sha256(payload)). Both sides sign with the same
 * LINK_SIGNING_SECRET, so a link minted by either verifies here. Web Crypto
 * rather than node:crypto because that's what the Workers runtime speaks
 * natively (and crypto.subtle.verify is constant-time, standing in for
 * timingSafeEqual). A token is a bearer credential: short expiry, every
 * issue audited, and STOP / DELETE invalidate outstanding links because
 * verification re-checks the user row.
 */

const enc = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(env: Env): Promise<CryptoKey> {
  if (!env.LINK_SIGNING_SECRET) throw new Error("LINK_SIGNING_SECRET must be set");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(env.LINK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function mintReportToken(env: Env, userId: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${userId}.${exp}`;
  const key = await hmacKey(env);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${b64urlEncode(enc.encode(payload))}.${b64urlEncode(sig)}`;
}

export type TokenCheck =
  | { ok: true; userId: string; exp: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export async function verifyReportToken(env: Env, token: string): Promise<TokenCheck> {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };

  const payloadBytes = b64urlDecode(parts[0]);
  const sigBytes = b64urlDecode(parts[1]);
  if (!payloadBytes || !sigBytes) return { ok: false, reason: "malformed" };

  const payload = new TextDecoder().decode(payloadBytes);
  const dot = payload.lastIndexOf(".");
  if (dot < 1) return { ok: false, reason: "malformed" };
  const userId = payload.slice(0, dot);
  const exp = Number(payload.slice(dot + 1));
  if (!userId || !Number.isFinite(exp)) return { ok: false, reason: "malformed" };

  const key = await hmacKey(env);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes as BufferSource, enc.encode(payload));
  if (!valid) return { ok: false, reason: "bad_signature" };
  if (exp * 1000 < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, userId, exp };
}
