import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import WatchingHomie from "./WatchingHomie";

export const metadata: Metadata = {
  title: "Sign in — Homie",
  description:
    "Homie emails you a code. There is no password to remember and nothing to install.",
};

/**
 * Sign-in runs on Clerk's own component, themed to Homie's tokens through
 * lib/clerk-appearance.ts (applied once at the ClerkProvider in app/layout).
 *
 * It replaced a hand-rolled card that reimplemented the verification state
 * machine and mishandled its failure states: anything other than `complete`
 * — including `missing_requirements`, which a *correct* code returns when
 * the Clerk instance still wants a field the card never collected — was
 * reported as "That code did not match", so the person retyped a code that
 * was never wrong and could never get in. Rate limiting surfaced the same
 * way. Clerk owns those states now, along with resend, expiry and
 * paste-to-fill.
 *
 * Redirect after success is Clerk's own, so the page opens by itself:
 * fallbackRedirectUrl is where that lands when there is no deep link to
 * honour, and a redirect_url on the query string still wins.
 */
export default function SignInPage() {
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
          <SignIn
            routing="path"
            path="/sign-in"
            signUpUrl="/sign-up"
            fallbackRedirectUrl="/dashboard"
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
