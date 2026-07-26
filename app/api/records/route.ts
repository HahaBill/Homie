import { NextResponse } from "next/server";
import { getPatientForSession } from "@/lib/server/patient";
import { getUnifiedRecords } from "@/lib/server/records";
import { fetchPressure, upsertPressureSnapshot } from "@/lib/server/openmeteo";
import { syncVapiCallsForUser } from "@/lib/server/vapi-sync";
import {
  getWhoopAccessToken,
  getWhoopOAuthConfig,
} from "@/lib/server/whoop-auth";
import { persistWhoopSleep } from "@/lib/server/whoop";

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
  // against this person's own history, so persist the live API reading before
  // loading that history. Persistence is supporting detail and must not make
  // the record unavailable when the weather table has a transient failure.
  const weather = await fetchPressure();
  let weatherStored = false;
  if (weather) {
    try {
      await upsertPressureSnapshot(lookup.patient.id, weather);
      weatherStored = true;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "weather upsert failed");
    }
  }
  const whoopAccessToken = await getWhoopAccessToken(lookup.patient.id);
  await syncVapiCallsForUser(lookup.patient.id);
  const records = await getUnifiedRecords(
    lookup.patient.id,
    weather?.pressureDelta24h ?? null,
    whoopAccessToken,
  );
  await persistWhoopSleep(lookup.patient.id, records.whoopSleep).catch((error) => {
    console.error(error instanceof Error ? error.message : "WHOOP readings upsert failed");
  });

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
      weatherStored,
      whoopOAuthConfigured: Boolean(getWhoopOAuthConfig()),
      ...records,
    },
    { headers: NO_STORE },
  );
}
