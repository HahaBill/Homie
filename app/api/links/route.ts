import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, audit } from "@/lib/server/supabase";
import { mintToken } from "@/lib/server/token";

/**
 * Report-link generation (docs/ARCHITECTURE.md).
 *
 * Server-to-server only: the worker calls this when she texts something
 * like "report", and the morning composer can include a fresh link before
 * an appointment. Guarded by a shared secret header, never exposed to a
 * browser.
 *
 * The minted URL points at REPORT_BASE_URL (the worker's /r/:token route
 * once it exists; this app's origin as a fallback). Tokens expire in 72h
 * by default, every issue is audited, and because verification re-checks
 * the user row, STOP / DELETE kill outstanding links immediately.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TTL_SECONDS = 72 * 60 * 60;

export async function POST(req: NextRequest) {
  const secret = process.env.LINK_API_SECRET;
  if (!secret || req.headers.get("x-homie-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { user_id?: string; ttl_seconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const userId = body.user_id;
  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const { data: user, error } = await supabaseAdmin()
    .from("users")
    .select("id, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!user || user.status !== "active") {
    // A stopped or deleted user gets no new links — same contract as STOP.
    return NextResponse.json({ error: "user not eligible" }, { status: 404 });
  }

  const ttl = clampTtl(body.ttl_seconds);
  const token = mintToken(user.id, ttl);
  const base =
    process.env.REPORT_BASE_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;

  await audit("report_link_issued", user.id, { ttl_seconds: ttl });

  return NextResponse.json(
    {
      url: `${base}/r/${token}`,
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

function clampTtl(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_TTL_SECONDS;
  // Never below 5 minutes, never above 7 days.
  return Math.min(Math.max(Math.floor(requested), 300), 7 * 24 * 60 * 60);
}
