import { NextRequest, NextResponse } from "next/server";

import { getPatientForSession } from "@/lib/server/patient";
import {
  createWhoopState,
  getWhoopOAuthConfig,
} from "@/lib/server/whoop-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lookup = await getPatientForSession();
  if (!lookup.ok) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  const config = getWhoopOAuthConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/profile?whoop=config", req.url));
  }

  const redirectUri =
    process.env.WHOOP_REDIRECT_URI ??
    new URL("/api/whoop/callback", req.nextUrl.origin).toString();
  const state = createWhoopState(lookup.patient.id, redirectUri);
  const authorization = new URL(
    "https://api.prod.whoop.com/oauth/oauth2/auth",
  );
  authorization.searchParams.set("response_type", "code");
  authorization.searchParams.set("client_id", config.clientId);
  authorization.searchParams.set("redirect_uri", redirectUri);
  authorization.searchParams.set("scope", "read:sleep offline");
  authorization.searchParams.set("state", state);

  return NextResponse.redirect(authorization);
}
