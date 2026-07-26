import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import SiteHeader from "@/components/SiteHeader";
import ThreadChat from "@/app/dashboard/ThreadChat";
import RecordsView from "@/app/profile/RecordsView";
import { getPatientForSession } from "@/lib/server/patient";

export const metadata: Metadata = {
  title: "Live record — Homie",
  description: "Live chat, calls and transcripts in one place.",
};

export const dynamic = "force-dynamic";

export default async function LivePage({
  searchParams,
}: {
  searchParams?: { calling?: string };
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const lookup = await getPatientForSession();
  const patient = lookup.ok ? lookup.patient : null;
  const greetingName = patient?.name ? `, ${patient.name.toLowerCase()}` : "";
  const calling = searchParams?.calling === "1";

  return (
    <>
      <SiteHeader />

      <main className="wrap live-page" style={{ paddingTop: 32, paddingBottom: 88 }}>
        <div className="app-head">
          <span className="mono">LIVE</span>
          <span className="note">
            hey{greetingName}. chat, calls and transcripts update here.
          </span>
        </div>

        {calling ? (
          <div className="call-soon" role="status">
            I&apos;m calling you in a minute.
          </div>
        ) : null}

        <section className="live-section">
          <div className="app-head compact">
            <span className="mono">CHAT</span>
            <span className="note">web chat</span>
          </div>
          <ThreadChat />
        </section>

        <section className="live-section">
          <RecordsView />
        </section>
      </main>
    </>
  );
}
