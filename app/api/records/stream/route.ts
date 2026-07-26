import { getPatientForSession } from "@/lib/server/patient";
import { getUnifiedRecords, type TimelineItem } from "@/lib/server/records";

/**
 * Server-Sent Events for the unified record.
 *
 * A call transcript lands asynchronously — Vapi posts its end-of-call report
 * to the worker seconds after the call drops — so the profile would otherwise
 * need a refresh to show it. This pushes new timeline items as they appear.
 *
 * Implemented by polling Supabase on an interval rather than subscribing to
 * realtime: this route already holds a service-role client, the cadence is
 * seconds not milliseconds, and it avoids standing up a second auth path for
 * a websocket. The stream closes itself before the serverless ceiling and
 * EventSource reconnects on its own.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POLL_MS = 3000;
const LIFETIME_MS = 50_000;

function keyOf(item: TimelineItem): string {
  return item.kind === "call" ? `call:${item.callId}` : `msg:${item.at}:${item.text.slice(0, 40)}`;
}

export async function GET() {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return new Response("unauthorized", { status: 401 });
  }
  const patientId = lookup.patient.id;

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const seen = new Set<string>();

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed by the client going away */
        }
      };

      // First frame is the whole record, so a subscriber never needs a
      // separate fetch to render.
      try {
        const initial = await getUnifiedRecords(patientId);
        initial.timeline.forEach((item) => seen.add(keyOf(item)));
        send("snapshot", initial);
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "load failed" });
        stop();
        return;
      }

      timer = setInterval(async () => {
        if (closed) return;
        try {
          const next = await getUnifiedRecords(patientId);
          const fresh = next.timeline.filter((item) => !seen.has(keyOf(item)));
          for (const item of fresh) {
            seen.add(keyOf(item));
            send("item", item);
          }
          if (fresh.length > 0) send("correlation", next.correlation);
          // Comment frame keeps proxies from idling the connection out.
          if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          /* a failed poll is not fatal — try again on the next tick */
        }
      }, POLL_MS);

      setTimeout(() => {
        send("bye", { reason: "lifetime" });
        stop();
      }, LIFETIME_MS);
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "private, no-store, no-transform",
      connection: "keep-alive",
      // Nginx-style proxies buffer SSE into uselessness without this.
      "x-accel-buffering": "no",
    },
  });
}
