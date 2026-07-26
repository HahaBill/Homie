import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import WatchingHomie from "../../sign-in/[[...sign-in]]/WatchingHomie";

export const metadata: Metadata = {
  title: "Get your page — Homie",
  description:
    "Homie emails you a code. There is no password to remember and nothing to install.",
};

/**
 * First visit through the web door.
 *
 * PRD §3 forbids an onboarding flow and this is not one: on email_code the
 * ceremony is identical to signing in — an address, then the code that lands
 * in the inbox. It exists as its own route only because Clerk's <SignIn />
 * links here for an address it does not recognise, and the redirect back to
 * /sign-in this file used to be would have made that a loop.
 *
 * New accounts land on /onboarding, where consent is actually captured
 * (PRD §7.4); returning ones go straight to the thread.
 */
export default function SignUpPage() {
  return (
    <>
      <header className="site-header">
        <div className="inner">
          <a href="/" className="wordmark" aria-label="Homie, home">
            Homie
          </a>
          <div className="header-actions" style={{ marginLeft: "auto" }}>
            <a className="btn btn-quiet btn-sm" href="/">
              Back
            </a>
          </div>
        </div>
      </header>

      <main className="auth-layout">
        <div>
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            fallbackRedirectUrl="/onboarding"
          />
          <p className="auth-note" style={{ textAlign: "center", marginTop: 32 }}>
            You do not need an account to use Homie. The thread works on its
            own — signing in is only for seeing your page.
          </p>
        </div>
        <WatchingHomie />
      </main>
    </>
  );
}
