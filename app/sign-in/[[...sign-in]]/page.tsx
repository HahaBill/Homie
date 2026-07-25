import type { Metadata } from "next";
import SignInCard from "./SignInCard";
import WatchingHomie from "./WatchingHomie";

export const metadata: Metadata = {
  title: "Sign in — Homie",
  description:
    "Homie emails you a code. There is no password to remember and nothing to install.",
};

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
          <SignInCard />
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
