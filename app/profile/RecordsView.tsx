"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The unified record, live.
 *
 * Subscribes to /api/records/stream: the first frame carries the whole
 * timeline, then new items (most usefully a call transcript, which lands
 * seconds after the call drops) arrive without a refresh. EventSource
 * reconnects on its own when the server closes the stream at its lifetime,
 * so there is no reconnect logic here.
 */

type TimelineItem =
  | { kind: "message"; at: string; who: "homie" | "her"; text: string }
  | {
      kind: "call";
      at: string;
      callId: string;
      durationSeconds: number | null;
      endedReason: string | null;
      summary: string | null;
      transcript: string | null;
      recordingUrl: string | null;
    };

type Correlation = {
  windowDays: number;
  pressureDrops: number;
  worseAfterDrop: number;
  statement: string | null;
};

type Weather = {
  pressureHpa: number;
  pressureDelta24h: number;
  tempC: number;
  humidity: number;
  uvIndexMax: number | null;
  tempMaxC: number | null;
} | null;

type Profile = {
  name: string | null;
  phone: string | null;
  email: string | null;
  phoneLinked: boolean;
};

function dayLabel(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();
}

function mmss(seconds: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RecordsView() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [correlation, setCorrelation] = useState<Correlation | null>(null);
  const [weather, setWeather] = useState<Weather>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [state, setState] = useState<"loading" | "live" | "error">("loading");
  const [openCall, setOpenCall] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Weather and profile are not part of the stream — one fetch is enough.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then((r) => r.json())
      .then((d: { weather?: Weather; profile?: Profile }) => {
        if (cancelled) return;
        setWeather(d.weather ?? null);
        setProfile(d.profile ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/records/stream");
    esRef.current = es;

    es.addEventListener("snapshot", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as {
        timeline: TimelineItem[];
        correlation: Correlation;
      };
      setItems(d.timeline);
      setCorrelation(d.correlation);
      setState("live");
    });
    es.addEventListener("item", (e) => {
      const item = JSON.parse((e as MessageEvent).data) as TimelineItem;
      setItems((prev) => [...prev, item]);
    });
    es.addEventListener("correlation", (e) => {
      setCorrelation(JSON.parse((e as MessageEvent).data) as Correlation);
    });
    es.onerror = () => setState((s) => (s === "live" ? "live" : "error"));

    return () => es.close();
  }, []);

  const calls = items.filter((i): i is Extract<TimelineItem, { kind: "call" }> => i.kind === "call");

  let lastDay = "";

  return (
    <div className="thread-grid">
      <div>
        <div className="app-head">
          <span className="mono">YOUR RECORD</span>
          <span className="note">
            {state === "live"
              ? "live — texts, web chat and calls in one place"
              : state === "loading"
                ? "opening…"
                : "reconnecting…"}
          </span>
        </div>

        <div className="thread" style={{ maxHeight: "68vh", overflowY: "auto" }}>
          {items.length === 0 ? (
            <div className="day-stamp">NOTHING HERE YET</div>
          ) : null}

          {items.map((item, i) => {
            const label = dayLabel(item.at);
            const stamp = label && label !== lastDay ? label : null;
            if (stamp) lastDay = label;

            return (
              <div key={i} style={{ display: "contents" }}>
                {stamp ? <div className="day-stamp">{stamp}</div> : null}

                {item.kind === "message" ? (
                  <div className={`bubble ${item.who}`}>{item.text}</div>
                ) : (
                  <div className="call-entry">
                    <div className="call-entry-head">
                      <span className="mono">
                        VOICE CALL{item.durationSeconds ? ` · ${mmss(item.durationSeconds)}` : ""}
                      </span>
                      {item.transcript ? (
                        <button
                          className="call-entry-toggle"
                          onClick={() =>
                            setOpenCall(openCall === item.callId ? null : item.callId)
                          }
                        >
                          {openCall === item.callId ? "hide transcript" : "read transcript"}
                        </button>
                      ) : null}
                    </div>
                    {item.summary ? <p className="call-entry-summary">{item.summary}</p> : null}
                    {openCall === item.callId && item.transcript ? (
                      <pre className="call-transcript">{item.transcript}</pre>
                    ) : null}
                    {item.recordingUrl ? (
                      <a
                        className="call-entry-toggle"
                        href={item.recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        listen to the recording
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="side-cards">
        <div className="side-card">
          <span className="mono">TODAY</span>
          {weather ? (
            <ul>
              <li>
                <strong>
                  {Math.round(weather.pressureHpa)} hPa
                </strong>{" "}
                pressure, {weather.pressureDelta24h <= -3
                  ? "falling"
                  : weather.pressureDelta24h >= 3
                    ? "rising"
                    : "steady"}{" "}
                ({weather.pressureDelta24h >= 0 ? "+" : ""}
                {weather.pressureDelta24h} over 24h)
              </li>
              {weather.tempMaxC != null ? (
                <li>
                  Up to <strong>{Math.round(weather.tempMaxC)}°C</strong>
                  {weather.tempMaxC >= 27 ? " — pace the day and keep water close" : ""}
                </li>
              ) : null}
              {weather.uvIndexMax != null ? (
                <li>
                  UV peaks at <strong>{weather.uvIndexMax}</strong>
                  {weather.uvIndexMax >= 6
                    ? " — sleeves, a hat, or shade if you are out for long"
                    : weather.uvIndexMax >= 3
                      ? " — worth the sunscreen"
                      : ""}
                </li>
              ) : null}
            </ul>
          ) : (
            <ul>
              <li className="dim">Weather is not available right now.</li>
            </ul>
          )}
        </div>

        <div className="side-card">
          <span className="mono">WHAT HOMIE HAS NOTICED</span>
          {correlation?.statement ? (
            <>
              <p style={{ fontSize: 17, lineHeight: 1.55, color: "var(--ink)" }}>
                {correlation.statement}
              </p>
              <p style={{ fontSize: 15, lineHeight: 1.55, color: "var(--faint)", marginTop: 12 }}>
                This is what already happened, not a forecast. Homie does not
                predict flares — what to do about a pattern is a conversation
                for you and your clinician.
              </p>
            </>
          ) : (
            <ul>
              <li className="dim">
                Not enough days yet. Homie needs a few pressure swings before it
                can say anything honest.
              </li>
            </ul>
          )}
        </div>

        <div className="side-card">
          <span className="mono">SURFACES</span>
          <ul>
            <li>
              {items.filter((i) => i.kind === "message").length} messages ·{" "}
              {calls.length} calls
            </li>
            {profile ? (
              <li className={profile.phoneLinked ? undefined : "dim"}>
                {profile.phoneLinked
                  ? `Texting linked to ${profile.phone}`
                  : "No phone linked yet — calls and texts will appear here once one is."}
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
