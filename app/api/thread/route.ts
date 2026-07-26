import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";

/**
 * The signed-in thread.
 *
 * GET  — the caller's own messages, oldest first, assembled from checkins
 *        (message_text = Homie's side, reply_text = theirs).
 * POST — a message typed on the web. Forwarded server-to-server to the
 *        Cloudflare worker's /chat route by users-row id — the Clerk
 *        session resolves to a patient row here (phone or email door), so
 *        email-only accounts chat through the same pipeline as texts.
 *
 * Everything here is that person's own health data: private, no-store,
 * scoped by the Clerk-verified session — never a client-supplied id.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

export type ThreadMessage = {
  who: "homie" | "her";
  text: string;
  at: string | null;
};

export async function GET() {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    const status = lookup.reason === "unauthenticated" ? 401 : 200;
    return NextResponse.json(
      { linked: false, reason: lookup.reason, messages: [] },
      { status, headers: NO_STORE },
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("checkins")
    .select("sent_at, message_text, replied_at, reply_text")
    .eq("user_id", lookup.patient.id)
    .order("sent_at", { ascending: true })
    .limit(60);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });
  }

  const messages: ThreadMessage[] = [];
  for (const c of data ?? []) {
    if (c.message_text) messages.push({ who: "homie", text: c.message_text, at: c.sent_at });
    if (c.reply_text) messages.push({ who: "her", text: c.reply_text, at: c.replied_at });
  }

  return NextResponse.json(
    {
      linked: true,
      name: lookup.patient.name,
      onboarded: Boolean(lookup.patient.consent_at),
      messages,
    },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    const status = lookup.reason === "unauthenticated" ? 401 : 400;
    return NextResponse.json({ error: lookup.reason }, { status, headers: NO_STORE });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400, headers: NO_STORE });
  }
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400, headers: NO_STORE });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: "message too long" }, { status: 413, headers: NO_STORE });
  }

  const workerUrl = process.env.WORKER_URL;
  const workerToken = process.env.WORKER_ADMIN_TOKEN;
  if (!workerUrl || !workerToken) {
    return NextResponse.json(
      { error: "worker not configured" },
      { status: 503, headers: NO_STORE },
    );
  }

  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({ user_id: lookup.patient.id, text }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json(
      { error: "Homie could not answer just now. Nothing you sent was lost." },
      { status: 502, headers: NO_STORE },
    );
  }
  const payload = (await res.json()) as {
    reply?: string;
    red_flag?: boolean;
    duplicate?: boolean;
  };
  // A suppressed duplicate is not a failure — the first request already
  // answered. Passed through so the composer can stay quiet instead of
  // reporting an error for a message that was delivered.
  return NextResponse.json(
    {
      reply: payload.reply ?? "",
      red_flag: payload.red_flag ?? false,
      duplicate: payload.duplicate ?? false,
    },
    { headers: NO_STORE },
  );
}
