"use client";

import { useState } from "react";

/**
 * The daily summary quick action.
 *
 * Costs a model call, so it is never fired on page load — the person asks
 * for it. Reads across texts, web chat and voice-call transcripts, which is
 * the whole point: no single surface can say "you mentioned this on the
 * phone and again by text".
 */

type Summary = {
  focus: string;
  notable: string[];
  suggestion: string;
  generatedAt: string;
  sources: { messages: number; calls: number; days: number };
};

export default function DailySummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/summary", { method: "POST" });
      const d = (await res.json()) as Partial<Summary> & { error?: string; empty?: boolean };
      if (d.empty) {
        setNotice("Not enough here yet. Say something to Homie and check back.");
        return;
      }
      if (!res.ok || !d.focus) {
        setNotice(d.error ?? "Homie could not put that together just now.");
        return;
      }
      setSummary(d as Summary);
    } catch {
      setNotice("Homie could not put that together just now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="side-card summary-card">
      <span className="mono">DAILY SUMMARY</span>

      {!summary ? (
        <>
          <p className="summary-lede">
            What Homie has noticed lately, across your texts, this thread and
            any calls.
          </p>
          <button className="btn btn-primary btn-sm" onClick={generate} disabled={busy}>
            {busy ? "reading it back…" : "catch me up"}
          </button>
        </>
      ) : (
        <>
          <p className="summary-focus">{summary.focus}</p>

          {summary.notable.length > 0 ? (
            <ul className="summary-notable">
              {summary.notable.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}

          <div className="summary-suggestion">
            <span className="mono">ONE THING</span>
            <p>{summary.suggestion}</p>
          </div>

          <p className="summary-foot">
            From {summary.sources.messages} message
            {summary.sources.messages === 1 ? "" : "s"}
            {summary.sources.calls > 0
              ? ` and ${summary.sources.calls} call${summary.sources.calls === 1 ? "" : "s"}`
              : ""}{" "}
            over {summary.sources.days} days.{" "}
            <button className="summary-again" onClick={generate} disabled={busy}>
              {busy ? "…" : "again"}
            </button>
          </p>
        </>
      )}

      {notice ? (
        <p className="summary-foot" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
