import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import OnboardingForm from "./OnboardingForm";
import SiteHeader from "@/components/SiteHeader";
import PhoneLink from "@/components/PhoneLink";
import { getPatientForSession } from "@/lib/server/patient";
import { supabaseAdmin } from "@/lib/server/supabase";

export const metadata: Metadata = {
  title: "A little about you — Homie",
  description: "Everything here is optional, and nothing is a score.",
};

export const dynamic = "force-dynamic";

/** Where the Clerk portal's after-sign-up redirect lands. All skippable. */
export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const lookup = await getPatientForSession();
  const phone = lookup.ok ? lookup.patient.phone : null;
  const { data: saved } = lookup.ok
    ? await supabaseAdmin()
        .from("users")
        .select(
          "name, consent_at, call_consent_at, transcript_consent_at, onboarding_profile",
        )
        .eq("id", lookup.patient.id)
        .maybeSingle()
    : { data: null };
  const profile =
    typeof saved?.onboarding_profile === "object" &&
    saved.onboarding_profile !== null &&
    !Array.isArray(saved.onboarding_profile)
      ? (saved.onboarding_profile as { call_phone?: string })
      : {};

  return (
    <>
      <SiteHeader />

      <main className="auth-wrap" style={{ maxWidth: 760 }}>
        {/* First, because it is the one that changes what the rest of the app
            can show: until the number is verified the texts and calls live on
            a row this session cannot reach. */}
        <div style={{ marginBottom: 24 }}>
          <PhoneLink currentPhone={phone} initialPhone={profile.call_phone} />
        </div>
        <OnboardingForm initial={saved ?? undefined} />
        <p className="auth-note" style={{ textAlign: "center", marginTop: 24 }}>
          Every field is optional. Homie works fine knowing nothing.
        </p>
      </main>
    </>
  );
}
