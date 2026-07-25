"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The onboarding card. Deliberately small: a name to greet you by, one
 * medication if you want it referenced, and the one decision that matters —
 * whether Homie texts a morning briefing. That checkbox is the explicit,
 * timestamped consent PRD §7.4 requires; nothing sends without it.
 */
export default function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medSchedule, setMedSchedule] = useState("");
  const [briefing, setBriefing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          medication_name: medName || undefined,
          medication_dose: medDose || undefined,
          medication_schedule: medSchedule || undefined,
          morning_briefing: briefing,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setNotice(d.error ?? "That did not save. Give it a moment and try again.");
        return;
      }
      router.push("/dashboard");
    } catch {
      setNotice("That did not save. Give it a moment and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card">
      <h1>A little about you</h1>
      <p className="lede" style={{ fontSize: 18 }}>
        So the mornings read like they are written for you — because they will
        be.
      </p>

      <form onSubmit={submit}>
        <label className="field" htmlFor="ob-name">
          <span>What should Homie call you</span>
          <input
            id="ob-name"
            type="text"
            autoComplete="given-name"
            placeholder="first name is plenty"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </label>

        <label className="field" htmlFor="ob-med">
          <span>A medication to keep in mind, if you like</span>
          <input
            id="ob-med"
            type="text"
            placeholder="e.g. naproxen"
            value={medName}
            onChange={(e) => setMedName(e.target.value)}
            disabled={busy}
          />
        </label>

        {medName.trim() ? (
          <>
            <label className="field" htmlFor="ob-dose">
              <span>Dose, as written on the box</span>
              <input
                id="ob-dose"
                type="text"
                placeholder="e.g. 250mg"
                value={medDose}
                onChange={(e) => setMedDose(e.target.value)}
                disabled={busy}
              />
            </label>
            <label className="field" htmlFor="ob-sched">
              <span>When you usually take it</span>
              <input
                id="ob-sched"
                type="text"
                placeholder="e.g. with breakfast"
                value={medSchedule}
                onChange={(e) => setMedSchedule(e.target.value)}
                disabled={busy}
              />
            </label>
          </>
        ) : null}

        <label
          className="field"
          htmlFor="ob-briefing"
          style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}
        >
          <input
            id="ob-briefing"
            type="checkbox"
            checked={briefing}
            onChange={(e) => setBriefing(e.target.checked)}
            disabled={busy}
            style={{ width: 22, height: 22, marginTop: 4, accentColor: "var(--apricot)" }}
          />
          <span style={{ fontWeight: 600, fontSize: 18, lineHeight: 1.5 }}>
            Text me a morning briefing — pressure, heat and sun for the day,
            read against what is normal for me. One a morning at most, and
            replying STOP always works.
          </span>
        </label>

        <p className="auth-note">
          Homie notices patterns and asks questions. It never diagnoses,
          never predicts a flare, and never changes a dose — what to do about
          a pattern is a conversation for you and your own clinician.
        </p>

        {notice ? (
          <p className="auth-note" role="status">
            {notice}
          </p>
        ) : null}

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "That's me"}
          </button>
          <a className="btn btn-quiet" href="/dashboard">
            skip for now
          </a>
        </div>
      </form>
    </div>
  );
}
