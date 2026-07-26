import { NextResponse } from "next/server";
import { getPatientForSession } from "@/lib/server/patient";

/**
 * On-demand daily summary for the signed-in patient.
 *
 * Same shape as /api/thread's POST: the Clerk session resolves to a users
 * row here, and only its id crosses to the worker — the browser never
 * supplies an identity, and the worker never sees a session.
 *
 * POST rather than GET because it costs a model call; a GET would be
 * prefetched and speculatively fired by browsers and crawlers.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "cache-control": "private, no-store" };

export async function POST() {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    const status = lookup.reason === "unauthenticated" ? 401 : 400;
    return NextResponse.json({ error: lookup.reason }, { status, headers: NO_STORE });
  }

  const workerUrl = process.env.WORKER_URL;
  const workerToken = process.env.WORKER_ADMIN_TOKEN;
  if (!workerUrl || !workerToken) {
    return NextResponse.json({ error: "worker not configured" }, { status: 503, headers: NO_STORE });
  }

  const res = await fetch(`${workerUrl.replace(/\/$/, "")}/summary`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${workerToken}`,
    },
    body: JSON.stringify({ user_id: lookup.patient.id }),
    signal: AbortSignal.timeout(55_000),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json(
      { error: "Homie could not put that together just now." },
      { status: 502, headers: NO_STORE },
    );
  }

  return NextResponse.json(await res.json(), { headers: NO_STORE });
}
