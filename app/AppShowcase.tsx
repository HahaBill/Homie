"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";

/**
 * The five-screen app section from "Homie Web App.dc.html" — thread, today,
 * the week, the call, glasses — one idea per screen.
 *
 * "The thread" is real when a signed-in visitor has a Homie record: their
 * own messages load from /api/thread, and the composer round-trips through
 * the Cloudflare worker's agent pipeline (same safety gates as a text).
 *
 * Signed out, the demo week from the design plays as a gentle animation:
 * a typing indicator ahead of Homie's bubbles, and her replies typed
 * character by character into the composer before they send. Reduced-motion
 * visitors get the whole conversation statically, no playback.
 *
 * "Today" is clickable: the two options each draw a different response in
 * Homie's voice, and switching between them is allowed — changing your
 * mind costs nothing here either.
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

/* The demo week, verbatim from the design file, as a playable script. */
type DemoStep =
  | { kind: "stamp"; text: string }
  | { kind: "quiet"; text: string }
  | { kind: "homie"; text: string }
  | { kind: "her"; text: string };

const DEMO_SCRIPT: DemoStep[] = [
  { kind: "stamp", text: "MONDAY 7:12" },
  {
    kind: "homie",
    text: "morning.\n\nyour hrv sat at 41 overnight — about seventeen under your own average.\n\nlast two times it did that, your hands were bad the next day.\n\nnaproxen with breakfast rather than waiting?",
  },
  { kind: "her", text: "already stiff this morning. i'll take it now." },
  { kind: "homie", text: "good. i'll leave you be today." },
  { kind: "quiet", text: "TUESDAY · NOTHING TO SAY" },
  { kind: "quiet", text: "WEDNESDAY · NOTHING TO SAY" },
  { kind: "stamp", text: "THURSDAY 9:40" },
  { kind: "homie", text: "you didn't reply yesterday. all okay?" },
  { kind: "her", text: "just tired. nothing new." },
  { kind: "homie", text: "ok. i'm here 🙂" },
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

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [thread, scrollToEnd]);

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
                <AnimatedDemoThread onGrow={scrollToEnd} />
              )}
            </div>

            <div className="side-cards">
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

        {screen === "today" && <TodayCard />}

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
            <CallPhone onTextInstead={() => setScreen("thread")} />
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
              <GlassesHud />
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

/* --------------------------------------------------------------------------
   Today — the two options are clickable and switchable, each with its own
   response in Homie's voice. Nothing is locked in; changing your mind is
   part of the design.
   -------------------------------------------------------------------------- */
function TodayCard() {
  const [choice, setChoice] = useState<null | "taken" | "skipped">(null);

  return (
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
          for your hands. same shape as the two mornings before your last flare.
        </div>

        <div className="today-actions">
          <button
            className={`btn btn-primary${choice === "skipped" ? " dimmed" : ""}`}
            aria-pressed={choice === "taken"}
            onClick={() => setChoice(choice === "taken" ? null : "taken")}
          >
            {choice === "taken" ? "taken with breakfast" : "take the naproxen with breakfast"}
          </button>
          <button
            className={`skip${choice === "skipped" ? " chosen" : ""}`}
            aria-pressed={choice === "skipped"}
            onClick={() => setChoice(choice === "skipped" ? null : "skipped")}
          >
            not today
          </button>
        </div>

        {choice === "taken" ? (
          <div className="choice-reply anim-in" role="status">
            noted. i&apos;ll ask how the hands went this evening — no reply
            needed if it turns out fine.
          </div>
        ) : null}
        {choice === "skipped" ? (
          <div className="choice-reply anim-in" role="status">
            ok, not today. if the hands get loud later, say so — nothing is
            locked in.
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The animated demo week. Homie's bubbles arrive behind a typing indicator;
   her replies are typed into the composer and sent. Statically rendered for
   reduced-motion visitors.
   -------------------------------------------------------------------------- */
function AnimatedDemoThread({ onGrow }: { onGrow: () => void }) {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(0);
  const [homieTyping, setHomieTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [done, setDone] = useState(false);
  const timers = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reduced !== false) return; // wait for the check; skip entirely if reduced
    const local = timers.current;

    const play = (index: number) => {
      if (index >= DEMO_SCRIPT.length) {
        setDone(true);
        // hold the finished week, then play it again
        later(() => {
          setVisible(0);
          setDone(false);
          play(0);
        }, 9000);
        return;
      }
      const step = DEMO_SCRIPT[index];

      if (step.kind === "stamp" || step.kind === "quiet") {
        setVisible(index + 1);
        later(() => play(index + 1), 700);
        return;
      }

      if (step.kind === "homie") {
        setHomieTyping(true);
        later(() => {
          setHomieTyping(false);
          setVisible(index + 1);
          later(() => play(index + 1), 900);
        }, Math.min(600 + step.text.length * 6, 2000));
        return;
      }

      // her: type into the composer, then send
      const total = step.text.length;
      const typeNext = (n: number) => {
        setTyped(step.text.slice(0, n));
        if (n < total) {
          later(() => typeNext(n + 1), 38);
        } else {
          later(() => {
            setTyped("");
            setVisible(index + 1);
            later(() => play(index + 1), 600);
          }, 450);
        }
      };
      later(() => typeNext(1), 500);
    };

    play(0);
    return () => {
      local.forEach(clearTimeout);
      timers.current = [];
    };
  }, [reduced, later]);

  useEffect(() => {
    onGrow();
  }, [visible, homieTyping, typed, onGrow]);

  // Static rendering: before the media query resolves, and for reduced motion.
  const showAll = reduced !== false;
  const shown = showAll ? DEMO_SCRIPT.length : visible;

  return (
    <>
      {DEMO_SCRIPT.slice(0, shown).map((step, i) => {
        const anim = showAll ? "" : " anim-in";
        if (step.kind === "stamp")
          return (
            <div key={i} className={`day-stamp${anim}`}>
              {step.text}
            </div>
          );
        if (step.kind === "quiet")
          return (
            <div key={i} className={`quiet-day${anim}`}>
              <div className="line" />
              <div className="label">{step.text}</div>
              <div className="line" />
            </div>
          );
        return (
          <div key={i} className={`bubble ${step.kind}${anim}`}>
            {step.text}
          </div>
        );
      })}

      {homieTyping ? (
        <div className="typing-bubble anim-in" aria-label="Homie is typing">
          <i />
          <i />
          <i />
        </div>
      ) : null}

      {done && !showAll ? (
        <div className="day-stamp anim-in">THE WEEK, AGAIN IN A MOMENT</div>
      ) : null}

      <div className="composer">
        <input
          value={typed}
          placeholder="say anything — sign in to talk to Homie"
          readOnly
          aria-label="Sign in to message Homie"
        />
        <button className={typed ? "live" : undefined} disabled aria-label="Send">
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

/* --------------------------------------------------------------------------
   The call — living waveform, working controls, a running clock. The audio
   itself is the seam for an ElevenLabs agent demo later: wire real playback
   where `live` flips, and the waveform is already listening to that state.
   -------------------------------------------------------------------------- */
type CallState = "live" | "muted" | "ended";

function CallPhone({ onTextInstead }: { onTextInstead: () => void }) {
  const [state, setState] = useState<CallState>("live");
  const [seconds, setSeconds] = useState(14);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (state === "ended") return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  const waveClass =
    state === "live" ? "waveform live" : state === "muted" ? "waveform live muted" : "waveform ended";

  const h = [12, 26, 40, 22, 34, 14, 30, 18, 8, 24, 36, 16];

  return (
    <div className="call-phone">
      <span className="mono">{state === "ended" ? "CALL ENDED" : "HOMIE IS CALLING"}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="call-avatar" src={LOGO} alt="" />
      <div className="call-name">Homie</div>
      <span className="mono" style={{ margin: "12px 0 26px" }}>
        {state === "ended" ? `ENDED · ${clock}` : state === "muted" ? `MUTED · ${clock}` : `LIVE · ${clock}`}
      </span>
      <div className="call-reason">
        {state === "ended"
          ? "ok. hanging up costs nothing — i'll text tomorrow morning as usual."
          : "i'm calling because your hrv has been under your usual for three mornings, and you've not mentioned it. how are you doing?"}
      </div>

      <div className={waveClass} aria-hidden>
        {h.map((v, i) => (
          <span
            key={i}
            style={{
              height: v,
              background: v > 28 ? "#D47A5A" : "#E8A98D",
              animationDelay: `${(i % 6) * 0.14}s`,
            }}
          />
        ))}
      </div>

      {state === "ended" ? (
        <button className="call-stop" onClick={() => { setState("live"); setSeconds(0); setStatus(null); }}>
          play the call again
        </button>
      ) : (
        <button className="call-stop" onClick={() => { setState("ended"); setStatus(null); }}>
          stop
        </button>
      )}

      <div className="call-links">
        <span
          className={state === "muted" ? "on" : undefined}
          role="button"
          tabIndex={0}
          onClick={() => state !== "ended" && setState(state === "muted" ? "live" : "muted")}
          onKeyDown={(e) => e.key === "Enter" && state !== "ended" && setState(state === "muted" ? "live" : "muted")}
        >
          {state === "muted" ? "unmute" : "mute"}
        </span>
        <span role="button" tabIndex={0} onClick={onTextInstead} onKeyDown={(e) => e.key === "Enter" && onTextInstead()}>
          text instead
        </span>
        <span
          className="human"
          role="button"
          tabIndex={0}
          onClick={() => setStatus("CONNECTING YOUR RHEUMATOLOGY NURSE · DEMO")}
          onKeyDown={(e) => e.key === "Enter" && setStatus("CONNECTING YOUR RHEUMATOLOGY NURSE · DEMO")}
        >
          get a person
        </span>
      </div>
      <div className="call-status-line" role="status">
        {status ?? ""}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Glasses HUD — one line at a time: appear, dwell six seconds, fade, next.
   Exactly what the strip's own meta line promises. Reduced motion shows
   both lines statically.
   -------------------------------------------------------------------------- */
const HUD_LINES = [
  "hrv is low — two minutes of breathing?",
  "naproxen — with food",
];

function GlassesHud() {
  const [reduced, setReduced] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reduced !== false) return;
    let cancelled = false;
    const timers: number[] = [];
    const cycle = () => {
      if (cancelled) return;
      setShown(true);
      timers.push(
        window.setTimeout(() => {
          if (cancelled) return;
          setShown(false); // fade out after the 6s dwell
          timers.push(
            window.setTimeout(() => {
              if (cancelled) return;
              setIndex((i) => (i + 1) % HUD_LINES.length);
              cycle();
            }, 700),
          );
        }, 6000),
      );
    };
    cycle();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [reduced]);

  if (reduced !== false) {
    return (
      <>
        {HUD_LINES.map((line) => (
          <div key={line} className="hud-line static">
            <span className="dot" aria-hidden />
            <span className="text">{line}</span>
          </div>
        ))}
      </>
    );
  }

  return (
    <div className={`hud-line${shown ? " visible" : ""}`} aria-live="polite">
      <span className="dot" aria-hidden />
      <span className="text">{HUD_LINES[index]}</span>
    </div>
  );
}
