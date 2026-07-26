"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Claiming the number the thread already runs on.
 *
 * The texts and the Vapi calls key on users.phone; the web session signs in
 * with a Clerk email. Until the two meet, signing in shows a real but partial
 * record — on live data the call transcripts sat on rows a web session could
 * not reach. Clerk gates phone sign-in behind its paid tier, so Homie proves
 * the number over the channel it already owns: it texts a code and asks for
 * it back.
 *
 * A number typed into a box proves nothing. That matters more here than in
 * most products — an unverified claim would hand someone else's pain scores
 * and medication history to whoever typed the digits.
 */
export default function PhoneLink({
  currentPhone,
  onLinked,
}: {
  currentPhone?: string | null;
  onLinked?: () => void;
}) {
  const [stage, setStage] = useState<"idle" | "code" | "done">(
    currentPhone ? "done" : "idle",
  );
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/phone/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? "could not send the code just now.");
        return;
      }
      if (data.status === "already_linked") {
        setStage("done");
        return;
      }
      setStage("code");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/phone/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? "that did not work.");
        return;
      }
      setMerged(Boolean(data.merged));
      setStage("done");
      onLinked?.();
    } finally {
      setBusy(false);
    }
  }

  if (stage === "done") {
    return (
      <Card className="border-border bg-card font-sans">
        <CardHeader>
          <CardTitle className="font-display text-2xl text-foreground">
            your number is linked
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            {merged
              ? "your texts and calls have joined this page — it is all one record now."
              : currentPhone
                ? `texting ${currentPhone}.`
                : "the thread and this page are the same conversation now."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card font-sans">
      <CardHeader>
        <CardTitle className="font-display text-2xl text-foreground">
          {stage === "idle" ? "your mobile number" : "check your phone"}
        </CardTitle>
        <CardDescription className="text-base leading-relaxed text-muted-foreground">
          {stage === "idle"
            ? "the thread runs on your phone. adding it here puts your texts, calls and this page in one place."
            : "homie just texted you a code. no rush."}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {stage === "idle" ? (
          <form onSubmit={send} className="flex flex-col gap-3">
            <label className="field" htmlFor="phone">
              <span>mobile number</span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="07700 900123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
            </label>
            {notice ? <p className="auth-note">{notice}</p> : null}
            <Button
              type="submit"
              disabled={busy || phone.trim().length < 7}
              className="mt-2 self-start rounded-full bg-primary px-8 py-6 text-lg font-extrabold text-primary-foreground hover:bg-destructive"
            >
              {busy ? "sending…" : "text me a code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-3">
            <label className="field" htmlFor="phone-code">
              <span>the code homie texted</span>
              <input
                id="phone-code"
                name="phone-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={busy}
              />
            </label>
            {notice ? <p className="auth-note">{notice}</p> : null}
            <div className="mt-2 flex flex-wrap gap-3">
              <Button
                type="submit"
                disabled={busy || code.replace(/\D/g, "").length !== 6}
                className="rounded-full bg-primary px-8 py-6 text-lg font-extrabold text-primary-foreground hover:bg-destructive"
              >
                {busy ? "checking…" : "link my number"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setStage("idle");
                  setCode("");
                  setNotice(null);
                }}
                className="rounded-full px-6 py-6 text-base font-bold text-foreground"
              >
                use a different number
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
