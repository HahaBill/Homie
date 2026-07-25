"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * The five-screen app section from "Homie Web App.dc.html" — thread, today,
 * the week, the call, glasses — one idea per screen.
 *
 * "The thread" is real when a signed-in visitor has a Homie record: their
 * own messages load from /api/thread, and the composer round-trips through
 * the Cloudflare worker's agent pipeline (same safety gates as a text).
 * Everyone else sees the demo week from the design, verbatim.
 */

type Screen = "thread" | "today" | "week" | "call" | "glasses";

type ThreadMessage = { who: "homie" | "her"; text: string; at: string | null };

type ThreadState =
  | { kind: "demo" }
  | { kind: "loading" }
  | { kind: "live"; messages: ThreadMessage[] };

const LOGO = "/homie-logo.jpg";

const SCREENS: Array<{ id: Screen; label: string }> = [
  { id: "thread", label: "the thread" },
  { id: "today", label: "today" },
  { id: "week", label: "the week" },
  { id: "call", label: "the call" },
  { id: "glasses", label: "glasses" },
];

export default function AppShowcase() {
  const { isSignedIn } = useUser();
  const [screen, setScreen] = useState<Screen>("thread");
  const [thread, setThread] = useState<ThreadState>({ kind: "demo" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setThread({ kind: "demo" });
      return;
    }
    let cancelled = false;
    setThread({ kind: "loading" });
    fetch("/api/thread")
      .then((r) => r.json())
      .then((d: { linked?: boolean; messages?: ThreadMessage[] }) => {
        if (cancelled) return;
        if (d.linked) setThread({ kind: "live", messages: d.messages ?? [] });
        else setThread({ kind: "demo" });
      })
      .catch(() => !cancelled && setThread({ kind: "demo" }));
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || thread.kind !== "live") return;
    setSending(true);
    setNotice(null);
    setThread({
      kind: "live",
      messages: [...thread.messages, { who: "her", text, at: new Date().toISOString() }],
    });
    setDraft("");
    try {
      const res = await fetch("/api/thread", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !d.reply) {
        setNotice(d.error ?? "Homie could not answer just now.");
      } else {
        setThread((prev) =>
          prev.kind === "live"
            ? {
                kind: "live",
                messages: [
                  ...prev.messages,
                  { who: "homie", text: d.reply as string, at: new Date().toISOString() },
                ],
              }
            : prev,
        );
      }
    } catch {
      setNotice("Homie could not answer just now.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="app-grid">
      <nav className="app-nav" aria-label="App screens">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScreen(s.id)}
            aria-current={screen === s.id ? "true" : undefined}
          >
            {screen === s.id ? <span className="dot" aria-hidden /> : null}
            <span>{s.label}</span>
          </button>
        ))}
        <div className="meta">
          reading: <strong>Whoop</strong> + Apple Watch, since March
        </div>
      </nav>

      <div style={{ minWidth: 0 }}>
        {screen === "thread" && (
          <div className="thread-grid">
            <div className="thread" ref={scrollRef} style={{ maxHeight: 640, overflowY: "auto" }}>
              {thread.kind === "live" ? (
                <>
                  {thread.messages.length === 0 ? (
                    <div className="day-stamp">NOTHING HERE YET — HOMIE TEXTS FIRST</div>
                  ) : (
                    thread.messages.map((m, i) => (
                      <div key={i} className={`bubble ${m.who}`}>
                        {m.text}
                      </div>
                    ))
                  )}
                  <form className="composer" onSubmit={send}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="say anything"
                      aria-label="Message Homie"
                      disabled={sending}
                    />
                    <button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
                      ↑
                    </button>
                  </form>
                  {notice ? (
                    <div className="day-stamp" role="status">
                      {notice}
                    </div>
                  ) : null}
                </>
              ) : thread.kind === "loading" ? (
                <div className="day-stamp">OPENING YOUR THREAD…</div>
              ) : (
                <DemoThread />
              )}
            </div>

            <div className="side-cards">
              <div className="side-card">
                <span className="mono">HOW THE MESSAGE IS BUILT</span>
                <ul>
                  <li>
                    <strong>Line one</strong> — a greeting, nothing else.
                  </li>
                  <li>
                    <strong>Line two</strong> — what the watch saw, in her numbers
                    against her own average.
                  </li>
                  <li>
                    <strong>Line three</strong> — what it&apos;s seen before. This is
                    the whole product.
                  </li>
                  <li>
                    <strong>Line four</strong> — one question, ending the message.
                  </li>
                  <li className="dim">
                    Blank lines between. Nothing bold, nothing numbered, no score.
                  </li>
                </ul>
              </div>
              <div className="side-card">
                <span className="mono">WHEN HOMIE SAYS NOTHING</span>
                <ul>
                  <li>Four of the last seven days: silence. Steady numbers are not news.</li>
                  <li>No reply is an answer — one gentle follow-up the next day, then quiet.</li>
                  <li>Never twice in a day. Never before 7am.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {screen === "today" && (
          <div className="today-wrap">
            <div className="today-card">
              <span className="mono">MONDAY 14 OCTOBER</span>
              <div className="today-title">you slept 6h 12m, woke three times.</div>

              <div className="hrv-row">
                <div className="hrv-big">41</div>
                <div className="hrv-unit">ms hrv overnight</div>
              </div>
              <div className="range-bar">
                <div className="fill" />
                <div className="baseline" />
              </div>
              <div className="range-labels">
                <span>YOUR RANGE 34–72</span>
                <span>YOUR BASELINE 58</span>
              </div>

              <div className="today-note">
                pressure&apos;s dropping hard today — that&apos;s usually a rough one
                for your hands. same shape as the two mornings before your last
                flare.
              </div>

              <div className="today-actions">
                <button className="btn btn-primary">take the naproxen with breakfast</button>
                <button className="skip">not today</button>
              </div>
            </div>
          </div>
        )}

        {screen === "week" && (
          <div className="week-card">
            <div className="week-head">
              <h3>the week</h3>
              <span className="mono" style={{ color: "var(--label)" }}>
                HRV · SYMPTOMS · MEDICATION
              </span>
            </div>
            <WeekChart />
            <div className="week-key">
              <span>
                <i style={{ width: 22, height: 3, background: "var(--apricot)", borderRadius: 2, display: "inline-block" }} />
                HRV
              </span>
              <span>
                <i style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--symptom)", display: "inline-block" }} />
                SYMPTOM REPORTED · SIZE = SEVERITY
              </span>
              <span>
                <i style={{ width: 5, height: 14, background: "var(--ink)", borderRadius: 2, display: "inline-block" }} />
                MEDICATION TAKEN
              </span>
              <span>
                <i style={{ width: 5, height: 14, background: "#E0D2C2", borderRadius: 2, display: "inline-block" }} />
                MISSED
              </span>
              <span>
                <i style={{ width: 22, borderTop: "2px dashed var(--label)", display: "inline-block" }} />
                YOUR BASELINE
              </span>
            </div>
          </div>
        )}

        {screen === "call" && (
          <div className="call-grid">
            <div className="call-phone">
              <span className="mono">HOMIE IS CALLING</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="call-avatar" src={LOGO} alt="" />
              <div className="call-name">Homie</div>
              <span className="mono" style={{ margin: "12px 0 26px" }}>
                LIVE · 00:14
              </span>
              <div className="call-reason">
                i&apos;m calling because your hrv has been under your usual for
                three mornings, and you&apos;ve not mentioned it. how are you
                doing?
              </div>
              <Waveform />
              <button className="call-stop">stop</button>
              <div className="call-links">
                <span>mute</span>
                <span>text instead</span>
                <span className="human">get a person</span>
              </div>
            </div>
            <div className="side-cards">
              <div className="side-card" style={{ background: "var(--milk)", padding: 32 }}>
                <span className="mono">WHEN HOMIE RINGS INSTEAD OF TEXTING</span>
                <ul style={{ fontSize: 17 }}>
                  <li>
                    <strong>Three mornings of drift</strong> with no reply on the
                    thread. Not one bad night.
                  </li>
                  <li>
                    <strong>The reason is on screen before she answers</strong> —
                    she should never have to ask why it called.
                  </li>
                  <li>
                    <strong>Stop is the biggest thing on the screen</strong>, and
                    hanging up costs nothing.
                  </li>
                  <li>
                    <strong>Never rings twice in a week</strong> unless she asks it
                    to.
                  </li>
                </ul>
              </div>
              <div className="side-card" style={{ background: "var(--panel)", padding: 32 }}>
                <span className="mono" style={{ color: "var(--clay)" }}>
                  THE LINE IT DOESN&apos;T CROSS
                </span>
                <p style={{ fontSize: 18, lineHeight: 1.6, color: "var(--ink-soft)" }}>
                  Homie reports what it saw, connects it to what it&apos;s seen
                  before, and asks. It does not diagnose, does not predict a flare,
                  and never changes a dose. When something looks wrong it says so
                  plainly and hands her to a human — &ldquo;this is past what i
                  should be reading. can i get your rheumatology nurse on the
                  line?&rdquo;
                </p>
              </div>
            </div>
          </div>
        )}

        {screen === "glasses" && (
          <div>
            <div className="glasses-frame">
              <span className="mono">HEADS-UP STRIP · 1 LINE · READ IN UNDER 2 SECONDS</span>
              <div className="hud-line">
                <span className="dot" aria-hidden />
                <span className="text">hrv is low — two minutes of breathing?</span>
              </div>
              <div className="hud-line">
                <span className="dot" aria-hidden />
                <span className="text">naproxen — with food</span>
              </div>
              <div className="hud-meta">
                <span>YES / DISMISS BY VOICE OR TEMPLE TAP</span>
                <span>·</span>
                <span>DWELL 6S THEN FADES</span>
                <span>·</span>
                <span>NEVER TWICE IN AN HOUR</span>
              </div>
            </div>
            <div className="glass-notes">
              <div className="glass-note">
                <h4>one line, 42 characters</h4>
                <p>
                  No wrapping, no second sentence, no numbers she has to interpret.
                  If it doesn&apos;t fit, it&apos;s a text instead.
                </p>
              </div>
              <div className="glass-note">
                <h4>white on black only</h4>
                <p>
                  Cream and clay don&apos;t survive daylight on a waveguide. The
                  peach dot is presence, never meaning — the words carry it.
                </p>
              </div>
              <div className="glass-note">
                <h4>peripheral-safe</h4>
                <p>
                  Static, no motion, no sound. Nothing appears while she&apos;s
                  walking, driving, or on a call.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* The demo week, verbatim from the design file. */
function DemoThread() {
  return (
    <>
      <div className="day-stamp">MONDAY 7:12</div>
      <div className="bubble homie">
        {"morning.\n\nyour hrv sat at 41 overnight — about seventeen under your own average.\n\nlast two times it did that, your hands were bad the next day.\n\nnaproxen with breakfast rather than waiting?"}
      </div>
      <div className="bubble her">already stiff this morning. i&apos;ll take it now.</div>
      <div className="bubble homie">good. i&apos;ll leave you be today.</div>

      <div className="quiet-day">
        <div className="line" />
        <div className="label">TUESDAY · NOTHING TO SAY</div>
        <div className="line" />
      </div>
      <div className="quiet-day">
        <div className="line" />
        <div className="label">WEDNESDAY · NOTHING TO SAY</div>
        <div className="line" />
      </div>

      <div className="day-stamp">THURSDAY 9:40</div>
      <div className="bubble homie">you didn&apos;t reply yesterday. all okay?</div>
      <div className="bubble her">just tired. nothing new.</div>
      <div className="bubble homie">ok. i&apos;m here 🙂</div>

      <div className="composer">
        <input placeholder="say anything — sign in to talk to Homie" disabled aria-label="Sign in to message Homie" />
        <button disabled aria-label="Send">
          ↑
        </button>
      </div>
    </>
  );
}

/* Week chart, ported from the design file's chart() — inline SVG, no library. */
function WeekChart() {
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const hrv = [58, 54, 49, 41, 44, 47, 52];
  const symptom = [0, 3, 5, 8, 6, 4, 0];
  const meds = [1, 1, 0, 1, 1, 1, 1];
  const x = (i: number) => 50 + i * 106;
  const y = (v: number) => 200 - (v - 30) * 4.25;
  const pts = hrv.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg
      viewBox="0 0 740 290"
      style={{ width: "100%", height: "auto", display: "block" }}
      role="img"
      aria-label="A week of HRV against your own baseline, with symptom reports and medication marks on the same days."
    >
      <line x1={40} x2={700} y1={y(58)} y2={y(58)} stroke="#A2907F" strokeWidth={2} strokeDasharray="6 6" />
      <text x={700} y={y(58) - 10} textAnchor="end" fill="#A2907F" fontFamily="JetBrains Mono, monospace" fontSize={12}>
        YOUR BASELINE 58
      </text>
      <polyline points={pts} fill="none" stroke="#D47A5A" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
      {hrv.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={6} fill="#FFF9F3" stroke="#D47A5A" strokeWidth={3} />
          <text x={x(i)} y={y(v) + 30} textAnchor="middle" fill="#8A7869" fontFamily="JetBrains Mono, monospace" fontSize={12}>
            {v}
          </text>
          {symptom[i] ? <circle cx={x(i)} cy={48} r={symptom[i] + 3} fill="#7E6A8F" opacity={0.85} /> : null}
          <rect x={x(i) - 2.5} y={236} width={5} height={16} rx={2.5} fill={meds[i] ? "#2B2B2B" : "#E0D2C2"} />
          <text x={x(i)} y={274} textAnchor="middle" fill="#8A7869" fontFamily="JetBrains Mono, monospace" fontSize={12} letterSpacing="0.12em">
            {days[i]}
          </text>
        </g>
      ))}
      <text x={40} y={24} fill="#A2907F" fontFamily="JetBrains Mono, monospace" fontSize={11} letterSpacing="0.14em">
        SYMPTOMS REPORTED
      </text>
      <text x={40} y={230} fill="#A2907F" fontFamily="JetBrains Mono, monospace" fontSize={11} letterSpacing="0.14em">
        MEDICATION
      </text>
    </svg>
  );
}

/* Static waveform from the design's wave(). */
function Waveform() {
  const h = [12, 26, 40, 22, 34, 14, 30, 18, 8, 24, 36, 16];
  return (
    <div className="waveform" aria-hidden>
      {h.map((v, i) => (
        <span key={i} style={{ height: v, background: v > 28 ? "#D47A5A" : "#E8A98D" }} />
      ))}
    </div>
  );
}
