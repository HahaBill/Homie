import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { getPatientForSession } from "@/lib/server/patient";
import ThreadChat from "./ThreadChat";
import DailySummary from "./DailySummary";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Your thread — Homie",
  description: "Your own conversation with Homie.",
};

export const dynamic = "force-dynamic";

/**
 * The signed-in surface — where the Clerk portal's after-sign-in redirect
 * lands. One idea on screen: the thread. The side column carries the
 * onboarding nudge and the standing promises, nothing else.
 */
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const lookup = await getPatientForSession();
  const patient = lookup.ok ? lookup.patient : null;
  const greetingName = patient?.name ? `, ${patient.name.toLowerCase()}` : "";

  return (
    <>
      <SiteHeader />

      <main className="wrap" style={{ paddingTop: 32, paddingBottom: 88 }}>
        <div className="app-head">
          <span className="mono">YOUR THREAD</span>
          <span className="note">hey{greetingName}. say as much or as little as you like.</span>
        </div>

        <div className="thread-grid">
          <ThreadChat />

          <div className="side-cards">
            <DailySummary />
            {/* Onboarding is parked for now — no setup gate stands between
                signing in and the thread. Consent for morning texts is
                captured separately when that flow returns. */}
            <div className="side-card">
              <span className="mono">THE STANDING PROMISES</span>
              <ul>
                <li>It notices. It does not advise, diagnose, or change a dose.</li>
                <li>Silence is a valid reply, here and on the phone.</li>
                <li>
                  Texting <strong>STOP</strong>, <strong>DELETE</strong> or{" "}
                  <strong>MY DATA</strong> — or typing them here — works at any
                  time.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
