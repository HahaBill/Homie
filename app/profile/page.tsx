import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import RecordsView from "./RecordsView";
import SiteHeader from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Your record — Homie",
  description: "Everything Homie holds for you, on one timeline.",
};

export const dynamic = "force-dynamic";

/**
 * The unified record. Texts, web chat and voice-call transcripts all resolve
 * to the same users row (by phone or email — see lib/server/patient.ts), so
 * this is one history rather than three.
 */
export default async function ProfilePage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <>
      <SiteHeader />

      <main className="wrap" style={{ paddingTop: 24, paddingBottom: 88 }}>
        <RecordsView />
      </main>
    </>
  );
}
