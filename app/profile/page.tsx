import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import RecordsView from "./RecordsView";

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
      <header className="site-header">
        <div className="inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-mark" src="/homie-logo.jpg" alt="" />
          <a href="/" className="wordmark" aria-label="Homie, home">
            Homie
          </a>
          <nav className="site-nav" aria-label="Primary">
            <a href="/dashboard">the thread</a>
            <UserButton />
          </nav>
        </div>
      </header>

      <main className="wrap" style={{ paddingTop: 24, paddingBottom: 88 }}>
        <RecordsView />
      </main>
    </>
  );
}
