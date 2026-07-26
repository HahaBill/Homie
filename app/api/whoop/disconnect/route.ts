import { NextResponse } from "next/server";

import { getPatientForSession } from "@/lib/server/patient";
import { disconnectWhoop } from "@/lib/server/whoop-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  disconnectWhoop();
  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "private, no-store" } },
  );
}
