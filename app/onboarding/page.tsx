import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import OnboardingForm from "./OnboardingForm";

export const metadata: Metadata = {
  title: "A little about you — Homie",
  description: "Everything here is optional, and nothing is a score.",
};

export const dynamic = "force-dynamic";

/** Where the Clerk portal's after-sign-up redirect lands. All skippable. */
export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <>
      <header className="site-header">
        <div className="inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-mark" src="/homie-logo.jpg" alt="" />
          <a href="/home" className="wordmark" aria-label="Homie, home">
            Homie
          </a>
          <div className="header-actions" style={{ marginLeft: "auto" }}>
            <a className="btn btn-quiet btn-sm" href="/dashboard">
              skip for now
            </a>
          </div>
        </div>
      </header>

      <main className="auth-wrap" style={{ maxWidth: 620 }}>
        <OnboardingForm />
        <p className="auth-note" style={{ textAlign: "center", marginTop: 24 }}>
          Every field is optional. Homie works fine knowing nothing.
        </p>
      </main>
    </>
  );
}
