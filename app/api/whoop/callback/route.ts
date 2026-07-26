import { NextRequest, NextResponse } from "next/server";

import { getPatientForSession } from "@/lib/server/patient";
import {
  consumeWhoopState,
  exchangeWhoopCode,
} from "@/lib/server/whoop-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  if (req.nextUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL("/profile?whoop=denied", req.url));
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return NextResponse.redirect(new URL("/profile?whoop=invalid", req.url));
  }
  const pending = consumeWhoopState(lookup.patient.id, state);
  if (!pending) {
    return NextResponse.redirect(new URL("/profile?whoop=invalid", req.url));
  }

  try {
    await exchangeWhoopCode(
      lookup.patient.id,
      code,
      pending.redirectUri,
    );
    return NextResponse.redirect(new URL("/profile?whoop=connected", req.url));
  } catch {
    return NextResponse.redirect(new URL("/profile?whoop=failed", req.url));
  }
}
