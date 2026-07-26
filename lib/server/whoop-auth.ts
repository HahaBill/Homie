import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";

const TOKEN_COOKIE = "homie_whoop_tokens";
const STATE_COOKIE = "homie_whoop_oauth_state";
const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

type WhoopTokenPayload = {
  patientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
};

type WhoopStatePayload = {
  patientId: string;
  state: string;
  redirectUri: string;
  expiresAt: number;
};

type WhoopTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type WhoopOAuthConfig = {
  clientId: string;
  clientSecret: string;
};

function encryptionKey(): Buffer | null {
  const secret = process.env.WHOOP_TOKEN_SECRET ?? process.env.LINK_SIGNING_SECRET;
  if (!secret) return null;
  return createHash("sha256")
    .update(`homie:whoop-oauth:v1:${secret}`)
    .digest();
}

function seal(value: object): string {
  const key = encryptionKey();
  if (!key) throw new Error("WHOOP token encryption is not configured");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

function unseal<T>(value: string | undefined): T | null {
  const key = encryptionKey();
  if (!key || !value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const encrypted = Buffer.from(parts[2], "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch {
    return null;
  }
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function parseTokenResponse(value: WhoopTokenResponse): Omit<WhoopTokenPayload, "patientId"> {
  if (!value.access_token) throw new Error("WHOOP did not return an access token");
  return {
    accessToken: value.access_token,
    refreshToken: value.refresh_token ?? null,
    expiresAt: Date.now() + Math.max(60, value.expires_in ?? 3600) * 1000,
  };
}

async function requestTokens(body: URLSearchParams): Promise<WhoopTokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`WHOOP token request failed (${response.status})`);
  }
  return (await response.json()) as WhoopTokenResponse;
}

export function getWhoopOAuthConfig(): WhoopOAuthConfig | null {
  const clientId = process.env.WHOOP_CLIENT_ID ?? process.env.Client_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret || !encryptionKey()) return null;
  return { clientId, clientSecret };
}

export function createWhoopState(
  patientId: string,
  redirectUri: string,
): string {
  const state = randomBytes(24).toString("base64url");
  const payload: WhoopStatePayload = {
    patientId,
    state,
    redirectUri,
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  cookies().set(STATE_COOKIE, seal(payload), cookieOptions(10 * 60));
  return state;
}

export function consumeWhoopState(
  patientId: string,
  state: string,
): WhoopStatePayload | null {
  const store = cookies();
  const payload = unseal<WhoopStatePayload>(store.get(STATE_COOKIE)?.value);
  store.delete(STATE_COOKIE);
  if (!payload || payload.patientId !== patientId || payload.expiresAt < Date.now()) {
    return null;
  }
  const expected = Buffer.from(payload.state);
  const received = Buffer.from(state);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  ) {
    return null;
  }
  return payload;
}

export async function exchangeWhoopCode(
  patientId: string,
  code: string,
  redirectUri: string,
): Promise<void> {
  const config = getWhoopOAuthConfig();
  if (!config) throw new Error("WHOOP OAuth is not configured");
  const response = await requestTokens(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
    }),
  );
  setWhoopTokens({ patientId, ...parseTokenResponse(response) });
}

function setWhoopTokens(payload: WhoopTokenPayload): void {
  cookies().set(TOKEN_COOKIE, seal(payload), cookieOptions(30 * 24 * 60 * 60));
}

async function refreshWhoopTokens(
  payload: WhoopTokenPayload,
): Promise<WhoopTokenPayload | null> {
  const config = getWhoopOAuthConfig();
  if (!config || !payload.refreshToken) return null;
  try {
    const response = await requestTokens(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: payload.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "offline",
      }),
    );
    const refreshed = {
      patientId: payload.patientId,
      ...parseTokenResponse(response),
    };
    setWhoopTokens(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}

export async function getWhoopAccessToken(
  patientId: string,
): Promise<string | null> {
  const payload = unseal<WhoopTokenPayload>(
    cookies().get(TOKEN_COOKIE)?.value,
  );
  if (payload?.patientId === patientId) {
    if (payload.expiresAt > Date.now() + 60_000) return payload.accessToken;
    const refreshed = await refreshWhoopTokens(payload);
    if (refreshed) return refreshed.accessToken;
  }
  return null;
}

export function disconnectWhoop(): void {
  cookies().delete(TOKEN_COOKIE);
}
