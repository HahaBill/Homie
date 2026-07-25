"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn, useSignUp } from "@clerk/nextjs";

/**
 * The Homie sign-in card, on Clerk's email_code strategy.
 *
 * One card handles both sign-in and first visit: an unknown email falls
 * through to sign-up transparently, because PRD §3 forbids a separate
 * onboarding flow. No password exists anywhere — the emailed code is the
 * whole ceremony.
 *
 * Phone-code sign-in is parked, deliberately: email is what the Clerk
 * instance has enabled today, and the thread itself still runs on the
 * phone number. When phone auth returns, this card grows a second path
 * rather than a second page. Note the join consequence meanwhile: the
 * live thread keys on users.phone, so an email-only session browses the
 * demo week until a phone number lands on the account.
 */

type Stage = "email" | "code";

export default function SignInCard() {
  const router = useRouter();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveFromSignUp } =
    useSignUp();

  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Which object owns the in-flight verification.
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  const ready = signInLoaded && signUpLoaded;

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setNotice("That address does not look complete — have another look.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // Known address → sign in.
      const attempt = await signIn.create({ identifier: address });
      const factor = attempt.supportedFirstFactors?.find(
        (f) => f.strategy === "email_code",
      );
      if (!factor || !("emailAddressId" in factor)) {
        setNotice(
          "This account cannot sign in with an emailed code. Contact us and we will sort it.",
        );
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "email_code",
        emailAddressId: factor.emailAddressId,
      });
      setMode("signIn");
      setStage("code");
    } catch (err: unknown) {
      if (isClerkError(err, "form_identifier_not_found")) {
        // First visit → create the account from the same card, quietly.
        try {
          await signUp.create({ emailAddress: address });
          await signUp.prepareEmailAddressVerification({
            strategy: "email_code",
          });
          setMode("signUp");
          setStage("code");
        } catch (suErr: unknown) {
          setNotice(clerkMessage(suErr));
        }
      } else {
        setNotice(clerkMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy || code.trim().length < 4) return;
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "signIn") {
        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: code.trim(),
        });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          router.push("/");
          return;
        }
      } else {
        const result = await signUp.attemptEmailAddressVerification({
          code: code.trim(),
        });
        if (result.status === "complete") {
          await setActiveFromSignUp({ session: result.createdSessionId });
          router.push("/");
          return;
        }
      }
      setNotice("That code did not match. Check the email and try again.");
    } catch (err: unknown) {
      setNotice(clerkMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      {stage === "email" ? (
        <>
          <h1>Get to your page</h1>
          <p className="lede" style={{ fontSize: 18 }}>
            Homie emails you a code. There is no password to remember and
            nothing to install.
          </p>

          <form onSubmit={requestCode}>
            <label className="field" htmlFor="email">
              <span>Your email</span>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby="email-help"
                disabled={busy}
              />
            </label>

            <p id="email-help" className="auth-note">
              We use your email to sign you in — nothing else. The thread
              itself still runs on your phone, where texting{" "}
              <strong>STOP</strong>, <strong>DELETE</strong> or{" "}
              <strong>MY DATA</strong> works at any time.
            </p>

            {/* Clerk bot-protection mounts here during sign-up. */}
            <div id="clerk-captcha" />

            {notice ? (
              <p className="auth-note" role="status">
                {notice}
              </p>
            ) : null}

            <div style={{ marginTop: 24 }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!ready || busy}
              >
                {busy ? "Sending…" : "Email me a code"}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <h1>Check your inbox</h1>
          <p className="lede" style={{ fontSize: 18 }}>
            A code is on its way to {email.trim().toLowerCase()}. No rush.
          </p>

          <form onSubmit={submitCode}>
            <label className="field" htmlFor="code">
              <span>The code from the email</span>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
              />
            </label>

            {notice ? (
              <p className="auth-note" role="status">
                {notice}
              </p>
            ) : null}

            <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!ready || busy}
              >
                {busy ? "Checking…" : "Open my page"}
              </button>
              <button
                className="btn btn-quiet"
                type="button"
                disabled={busy}
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setNotice(null);
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

function isClerkError(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: Array<{ code?: string }> }).errors) &&
    (err as { errors: Array<{ code?: string }> }).errors.some(
      (e) => e.code === code,
    )
  );
}

function clerkMessage(err: unknown): string {
  if (
    typeof err === "object" &&
    err !== null &&
    "errors" in err &&
    Array.isArray((err as { errors: Array<{ longMessage?: string; message?: string }> }).errors)
  ) {
    const first = (err as { errors: Array<{ longMessage?: string; message?: string }> })
      .errors[0];
    const msg = first?.longMessage ?? first?.message;
    if (msg) return msg.replace(/!+/g, ".");
  }
  return "Something went wrong on our side. Give it a moment and try again.";
}
