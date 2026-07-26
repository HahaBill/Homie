"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Saving the number the thread and calls should use.
 *
 * This is intentionally a one-step onboarding save. The record page also joins
 * by onboarding_profile.call_phone, so old text/call rows can appear even when
 * another historical user row already owns users.phone.
 */
export default function PhoneLink({
  currentPhone,
  initialPhone,
  onLinked,
}: {
  currentPhone?: string | null;
  initialPhone?: string | null;
  onLinked?: () => void;
}) {
  const [saved, setSaved] = useState(Boolean(currentPhone));
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
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
        setNotice(data.error ?? "could not save that number just now.");
        return;
      }
      setPhone(data.phone ?? phone);
      setSaved(true);
      setNotice("saved. Homie will use this for calls, texts and your record.");
      onLinked?.();
    } catch {
      setNotice("could not reach Homie just now — check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Card className="border-border bg-card font-sans">
        <CardHeader>
          <CardTitle className="font-display text-2xl text-foreground">
            your number is saved
          </CardTitle>
          <CardDescription className="text-base text-muted-foreground">
            {phone ? `Homie will use ${phone} for texts, calls and your record.` : "Homie will use this for texts, calls and your record."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="ghost"
            className="rounded-full px-0 text-base font-bold text-primary hover:bg-transparent hover:text-primary"
            onClick={() => {
              setSaved(false);
              setNotice(null);
            }}
          >
            change number
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card font-sans">
      <CardHeader>
        <CardTitle className="font-display text-2xl text-foreground">
          your mobile number
        </CardTitle>
        <CardDescription className="text-base leading-relaxed text-muted-foreground">
          the thread runs on your phone. saving it here puts your texts, calls and this page in one place.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-3">
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
              onChange={(e) => {
                setPhone(e.target.value);
                window.sessionStorage.setItem("homie:onboarding-phone", e.target.value);
              }}
              disabled={busy}
            />
          </label>
          {notice ? <p className="auth-note">{notice}</p> : null}
          <Button
            type="submit"
            disabled={busy || phone.trim().length < 7}
            className="mt-2 self-start rounded-full bg-primary px-8 py-6 text-lg font-extrabold text-primary-foreground hover:bg-destructive"
          >
            {busy ? "saving…" : "save my number"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
