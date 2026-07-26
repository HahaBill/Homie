"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Bed, MessageCircle, Moon, PhoneCall } from "lucide-react";
import WeatherPanel, { FlareArc } from "./WeatherPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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

type FlareRisk = {
  percent: number;
  band: "low" | "moderate" | "elevated" | "high";
  sampleSize: number;
  basis: string;
  usedDefault: boolean;
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

type WhoopSleep = {
  source: "live" | "sample";
  windowDays: 7;
  days: Array<{
    date: string;
    start: string;
    end: string;
    scoreState: "SCORED";
    sleepPerformancePercentage: number;
    sleepConsistencyPercentage: number;
    sleepEfficiencyPercentage: number;
    respiratoryRate: number;
    totalInBedHours: number;
    totalSleepHours: number;
    disturbanceCount: number;
  }>;
  averages: {
    sleepPerformancePercentage: number;
    sleepConsistencyPercentage: number;
    sleepEfficiencyPercentage: number;
    respiratoryRate: number;
    totalSleepHours: number;
  };
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

function timeLabel(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function excerpt(text: string, max = 180): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
}

function shortDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

export default function RecordsView() {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [correlation, setCorrelation] = useState<Correlation | null>(null);
  const [flare, setFlare] = useState<FlareRisk | null>(null);
  const [weather, setWeather] = useState<Weather>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [whoopSleep, setWhoopSleep] = useState<WhoopSleep | null>(null);
  const [state, setState] = useState<"loading" | "live" | "error">("loading");
  const [openCall, setOpenCall] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Weather and profile are not part of the stream — one fetch is enough.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/records")
      .then((r) => r.json())
      .then((d: { weather?: Weather; profile?: Profile; whoopSleep?: WhoopSleep }) => {
        if (cancelled) return;
        setWeather(d.weather ?? null);
        setProfile(d.profile ?? null);
        setWhoopSleep(d.whoopSleep ?? null);
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
        flareRisk: FlareRisk | null;
        whoopSleep?: WhoopSleep;
      };
      setItems(d.timeline);
      setCorrelation(d.correlation);
      setFlare(d.flareRisk ?? null);
      if (d.whoopSleep) setWhoopSleep(d.whoopSleep);
      setState("live");
    });
    es.addEventListener("flare", (e) => {
      setFlare(JSON.parse((e as MessageEvent).data) as FlareRisk);
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
  const whoopCard = whoopSleep ? (
    <div className="side-card whoop-card">
      <div className="whoop-card-head">
        <span className="mono">
          {whoopSleep.source === "live" ? "LIVE WHOOP" : "WHOOP SAMPLE"} · 7 DAYS
        </span>
        <Badge variant="outline">Sleep</Badge>
      </div>
      <div className="whoop-hero">
        <div>
          <Moon size={22} />
          <strong>{whoopSleep.averages.sleepPerformancePercentage}%</strong>
          <span>sleep performance</span>
        </div>
        <div>
          <Bed size={22} />
          <strong>{whoopSleep.averages.totalSleepHours}h</strong>
          <span>average sleep</span>
        </div>
      </div>
      <div className="whoop-metrics">
        <span>
          <Activity size={16} />
          {whoopSleep.averages.respiratoryRate}/min respiratory
        </span>
        <span>{whoopSleep.averages.sleepConsistencyPercentage}% consistency</span>
        <span>{whoopSleep.averages.sleepEfficiencyPercentage}% efficiency</span>
      </div>
      <div
        className="whoop-days"
        aria-label={`${whoopSleep.source === "live" ? "Live" : "Sample"} WHOOP sleep performance over the last 7 days`}
      >
        {whoopSleep.days.map((day) => (
          <div key={day.date} className="whoop-day">
            <i style={{ height: `${Math.max(22, day.sleepPerformancePercentage)}%` }} />
            <span>{shortDay(day.date)}</span>
            <b>{day.sleepPerformancePercentage}</b>
          </div>
        ))}
      </div>
      <p className="whoop-note">
        {whoopSleep.source === "live"
          ? "Live WHOOP sleep fields: score state, stage summary, respiratory rate, performance, consistency and efficiency."
          : "Sample WHOOP-style sleep fields shown until a live WHOOP access token is connected."}
      </p>
    </div>
  ) : null;

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

        {whoopCard}

        <div className="record-list" style={{ maxHeight: "68vh", overflowY: "auto" }}>
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

                <Card className="record-card">
                  <CardContent className="record-card-content">
                    {item.kind === "message" ? (
                      <>
                        <div className="record-icon record-message">
                          <MessageCircle size={18} />
                        </div>
                        <div className="record-body">
                          <div className="record-head">
                            <div>
                              <h3>{item.who === "homie" ? "Homie message" : "Your message"}</h3>
                              <p>{timeLabel(item.at)}</p>
                            </div>
                            <Badge variant="outline">Message</Badge>
                          </div>
                          <p className="record-copy">{excerpt(item.text)}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="record-icon record-call">
                          <PhoneCall size={18} />
                        </div>
                        <div className="record-body">
                          <div className="record-head">
                            <div>
                              <h3>Call with Homie</h3>
                              <p>
                                {timeLabel(item.at)}
                                {item.durationSeconds ? ` · ${mmss(item.durationSeconds)}` : ""}
                              </p>
                            </div>
                            <div className="record-badges">
                              <Badge>Call</Badge>
                              {item.summary ? <Badge variant="secondary">Summary</Badge> : null}
                            </div>
                          </div>
                          {item.summary ? (
                            <p className="record-copy">{item.summary}</p>
                          ) : (
                            <p className="record-copy muted">Transcript will appear after Vapi sends the end-of-call report.</p>
                          )}

                          {item.transcript || item.recordingUrl ? (
                            <div className="record-actions">
                              {item.transcript ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setOpenCall(openCall === item.callId ? null : item.callId)}
                                >
                                  {openCall === item.callId ? "Hide transcript" : "View transcript"}
                                </Button>
                              ) : null}
                              {item.recordingUrl ? (
                                <Button asChild variant="ghost" size="sm">
                                  <a href={item.recordingUrl} target="_blank" rel="noreferrer">
                                    Recording
                                  </a>
                                </Button>
                              ) : null}
                            </div>
                          ) : null}

                          {openCall === item.callId && item.transcript ? (
                            <>
                              <Separator className="record-separator" />
                              <pre className="call-transcript">{item.transcript}</pre>
                            </>
                          ) : null}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>

      <div className="side-cards">
        {flare ? (
          <div className={`flare-card flare-${flare.band}`}>
            <span className="mono">FLARE LIKELIHOOD TODAY</span>
            <FlareArc percent={flare.percent} band={flare.band} />
            <p className="flare-basis">{flare.basis}</p>
            <p className="flare-foot">
              {flare.usedDefault
                ? "Based on a neutral starting point — Homie has not seen enough of your own pressure days yet."
                : `Based on ${flare.sampleSize} of your own pressure days.`}
            </p>
          </div>
        ) : null}

        <WeatherPanel weather={weather} />

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
