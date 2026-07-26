import { NextResponse } from "next/server";
import { getPatientForSession } from "@/lib/server/patient";
import { getUnifiedRecords } from "@/lib/server/records";
import { fetchPressure } from "@/lib/server/openmeteo";
import { syncVapiCallsForUser } from "@/lib/server/vapi-sync";

/**
 * The unified record for the signed-in patient: thread messages and Vapi call
 * transcripts on one timeline, plus today's weather and the observed
 * pressure/symptom correlation.
 *
 * Scoped entirely by the Clerk session — never by a client-supplied id — and
 * private/no-store, because every byte of it is special-category health data.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

export async function GET() {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    const status = lookup.reason === "unauthenticated" ? 401 : 400;
    return NextResponse.json({ error: lookup.reason }, { status, headers: NO_STORE });
  }

  // Weather first: the flare figure is computed from today's pressure change
  // against this person's own history, so the record needs it.
  const weather = await fetchPressure();
  await syncVapiCallsForUser(lookup.patient.id);
  const records = await getUnifiedRecords(
    lookup.patient.id,
    weather?.pressureDelta24h ?? null,
  );

  return NextResponse.json(
    {
      profile: {
        name: lookup.patient.name,
        phone: lookup.patient.phone,
        email: lookup.patient.email,
        /** Whether the texting surface is reachable — the phone is the join key. */
        phoneLinked: Boolean(lookup.patient.phone),
      },
      weather,
      ...records,
    },
    { headers: NO_STORE },
  );
}
