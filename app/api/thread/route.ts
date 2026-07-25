import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/server/supabase";
import { getPatientForSession } from "@/lib/server/patient";

/**
 * The signed-in thread.
 *
 * GET  — the caller's own messages, oldest first, assembled from checkins
 *        (message_text = Homie's side, reply_text = hers).
 * POST — a message typed on the web. Forwarded server-to-server to the
 *        Cloudflare worker's /chat route, which runs the same safety gates
 *        and agent pipeline as an inbound text, persists it, and returns
 *        Homie's reply.
 *
 * Everything here is that person's own health data: private, no-store,
 * and scoped by the Clerk-verified phone number — never a client-supplied id.
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
    { linked: true, name: lookup.patient.name, messages },
    { headers: NO_STORE },
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const user = await currentUser();
  const phone =
    user?.phoneNumbers.find((p) => p.id === user.primaryPhoneNumberId)
      ?.phoneNumber ?? user?.phoneNumbers[0]?.phoneNumber;
  if (!phone) {
    return NextResponse.json({ error: "no phone on account" }, { status: 400, headers: NO_STORE });
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
    body: JSON.stringify({ phone, text }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json(
      { error: "Homie could not answer just now. Nothing you sent was lost." },
      { status: 502, headers: NO_STORE },
    );
  }
  const payload = (await res.json()) as { reply?: string; red_flag?: boolean };
  return NextResponse.json(
    { reply: payload.reply ?? "", red_flag: payload.red_flag ?? false },
    { headers: NO_STORE },
  );
}
