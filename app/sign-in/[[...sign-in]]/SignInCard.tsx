"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn, useSignUp } from "@clerk/nextjs";

/**
 * The Homie sign-in card, made real with Clerk's phone_code strategy.
 *
 * One card handles both sign-in and first visit: an unknown number falls
 * through to sign-up transparently, because PRD §3 forbids a separate
 * onboarding flow. No password exists anywhere. The texted code is the
 * whole ceremony.
 *
 * Design rules in force (PRD §13): one apricot element per screen state,
 * 18px floor, 52px targets, no exclamation marks anywhere in copy.
 */

type Stage = "number" | "code";

/** UK-friendly E.164 normalisation: "07466 503629" → "+447466503629". */
function toE164(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("07")) return `+44${digits.slice(1)}`;
  if (digits.startsWith("44")) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

export default function SignInCard() {
  const router = useRouter();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const { isLoaded: signUpLoaded, signUp, setActive: setActiveFromSignUp } =
    useSignUp();

  const [stage, setStage] = useState<Stage>("number");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Which object owns the in-flight verification.
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  const ready = signInLoaded && signUpLoaded;

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    const number = toE164(phone);
    if (number.length < 10) {
      setNotice("That number does not look complete — have another look.");
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      // Known number → sign in.
      const attempt = await signIn.create({ identifier: number });
      const factor = attempt.supportedFirstFactors?.find(
        (f) => f.strategy === "phone_code",
      );
      if (!factor || !("phoneNumberId" in factor)) {
        setNotice(
          "This account cannot sign in with a texted code. Contact us and we will sort it.",
        );
        return;
      }
      await signIn.prepareFirstFactor({
        strategy: "phone_code",
        phoneNumberId: factor.phoneNumberId,
      });
      setMode("signIn");
      setStage("code");
    } catch (err: unknown) {
      if (isClerkError(err, "form_identifier_not_found")) {
        // First visit → create the account from the same card, quietly.
        try {
          await signUp.create({ phoneNumber: number });
          await signUp.preparePhoneNumberVerification({
            strategy: "phone_code",
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
          strategy: "phone_code",
          code: code.trim(),
        });
        if (result.status === "complete") {
          await setActive({ session: result.createdSessionId });
          router.push("/");
          return;
        }
      } else {
        const result = await signUp.attemptPhoneNumberVerification({
          code: code.trim(),
        });
        if (result.status === "complete") {
          await setActiveFromSignUp({ session: result.createdSessionId });
          router.push("/");
          return;
        }
      }
      setNotice("That code did not match. Check the text and try again.");
    } catch (err: unknown) {
      setNotice(clerkMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      {stage === "number" ? (
        <>
          <h1>Get to your page</h1>
          <p className="lede" style={{ fontSize: 18 }}>
            Homie texts you a code. There is no password to remember and
            nothing to install.
          </p>

          <form onSubmit={requestCode}>
            <label className="field" htmlFor="phone">
              <span>Your mobile number</span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="07700 900000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                aria-describedby="phone-help"
                disabled={busy}
              />
            </label>

            <p id="phone-help" className="auth-note">
              We use your number to find your record and to send the code. It
              is never shared, and texting <strong>STOP</strong>,{" "}
              <strong>DELETE</strong> or <strong>MY DATA</strong> works at any
              time.
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
                {busy ? "Sending…" : "Text me a code"}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <h1>Check your texts</h1>
          <p className="lede" style={{ fontSize: 18 }}>
            A code is on its way to {toE164(phone)}. No rush.
          </p>

          <form onSubmit={submitCode}>
            <label className="field" htmlFor="code">
              <span>The code from the text</span>
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
                  setStage("number");
                  setCode("");
                  setNotice(null);
                }}
              >
                Use a different number
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
