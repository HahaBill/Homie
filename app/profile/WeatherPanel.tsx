"use client";

import { useEffect, useState } from "react";

/**
 * Today's conditions as three live dials, plus the recommendations that fall
 * out of them.
 *
 * Every icon is data-driven inline SVG: the barometer needle sits where the
 * pressure actually is, the sun's rays grow with the UV index, the
 * thermometer fills to the real temperature. Nothing is decorative — if a
 * shape moves, it moved because a number did.
 *
 * Each tile is a button: tap or keyboard-select to open the reading behind
 * the picture. Motion is gated on prefers-reduced-motion.
 */

export type Weather = {
  pressureHpa: number;
  pressureDelta24h: number;
  tempC: number;
  humidity: number;
  uvIndexMax: number | null;
  tempMaxC: number | null;
};

export type FlareRisk = {
  percent: number;
  band: "low" | "moderate" | "elevated" | "high";
  sampleSize: number;
  basis: string;
  usedDefault: boolean;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/* -------------------------------------------------------------------------
   Barometer. The needle spans ±80° across a ±12 hPa swing — the range that
   actually matters here, rather than the full scale of the instrument.
   ------------------------------------------------------------------------- */
function PressureDial({ delta, animate }: { delta: number; animate: boolean }) {
  const angle = clamp((delta / 12) * 80, -80, 80);
  const falling = delta <= -3;
  const rising = delta >= 3;
  const stroke = falling ? "var(--clay)" : rising ? "#6fa07a" : "var(--label)";

  return (
    <svg viewBox="0 0 100 68" className="wx-icon" role="img" aria-label="Barometric pressure dial">
      <path
        d="M12 58 A38 38 0 0 1 88 58"
        fill="none"
        stroke="var(--edge)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* the arc the needle is actually in */}
      <path
        d="M12 58 A38 38 0 0 1 88 58"
        fill="none"
        stroke={stroke}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="120"
        strokeDashoffset={animate ? 120 - (clamp((angle + 80) / 160, 0, 1) * 120) : 0}
        style={{ transition: animate ? "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" : "none" }}
      />
      <g
        style={{
          transform: `rotate(${angle}deg)`,
          transformOrigin: "50px 58px",
          transition: animate ? "transform 900ms cubic-bezier(.2,.8,.2,1)" : "none",
        }}
      >
        <line x1="50" y1="58" x2="50" y2="26" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="50" cy="58" r="5" fill="var(--ink)" />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   Sun. Ray length tracks the UV index; colour ramps moss → apricot → clay.
   ------------------------------------------------------------------------- */
function UvSun({ index, animate }: { index: number; animate: boolean }) {
  const t = clamp(index / 11, 0, 1);
  const rayLen = 8 + t * 13;
  const fill = index >= 6 ? "var(--clay)" : index >= 3 ? "var(--apricot)" : "#6fa07a";

  return (
    <svg viewBox="0 0 100 68" className="wx-icon" role="img" aria-label={`UV index ${index}`}>
      <g className={animate ? "wx-spin" : undefined} style={{ transformOrigin: "50px 34px" }}>
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i * Math.PI * 2) / 8;
          const x1 = 50 + Math.cos(a) * 15;
          const y1 = 34 + Math.sin(a) * 15;
          const x2 = 50 + Math.cos(a) * (15 + rayLen);
          const y2 = 34 + Math.sin(a) * (15 + rayLen);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={fill}
              strokeWidth="3.5"
              strokeLinecap="round"
              opacity={0.5 + t * 0.5}
            />
          );
        })}
      </g>
      <circle cx="50" cy="34" r="12" fill={fill} />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   Thermometer, filling to the real temperature across a 0–40°C tube.
   ------------------------------------------------------------------------- */
function HeatGauge({ tempC, animate }: { tempC: number; animate: boolean }) {
  const t = clamp(tempC / 40, 0, 1);
  const tubeTop = 12;
  const tubeBottom = 44;
  const fillTop = tubeBottom - (tubeBottom - tubeTop) * t;
  const fill = tempC >= 27 ? "var(--clay)" : tempC >= 18 ? "var(--apricot)" : "#6e93bf";

  return (
    <svg viewBox="0 0 100 68" className="wx-icon" role="img" aria-label={`Temperature ${Math.round(tempC)} degrees`}>
      <rect x="44" y={tubeTop} width="12" height={tubeBottom - tubeTop + 6} rx="6" fill="var(--edge)" />
      <rect
        x="44"
        y={animate ? tubeBottom : fillTop}
        width="12"
        height={animate ? 0 : tubeBottom - fillTop + 6}
        rx="6"
        fill={fill}
        style={{
          transition: animate ? "y 900ms cubic-bezier(.2,.8,.2,1), height 900ms cubic-bezier(.2,.8,.2,1)" : "none",
        }}
        ref={(el) => {
          if (el && animate) {
            requestAnimationFrame(() => {
              el.setAttribute("y", String(fillTop));
              el.setAttribute("height", String(tubeBottom - fillTop + 6));
            });
          }
        }}
      />
      <circle cx="50" cy="54" r="11" fill={fill} />
    </svg>
  );
}

/* -------------------------------------------------------------------------
   Flare arc — a 240° gauge. Reads faster than a bar and gives the figure a
   place to live in the middle.
   ------------------------------------------------------------------------- */
export function FlareArc({ percent, band }: { percent: number; band: FlareRisk["band"] }) {
  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const SPAN = 0.667; // 240° of the circle
  const colour =
    band === "high" || band === "elevated"
      ? "var(--clay)"
      : band === "moderate"
        ? "var(--apricot)"
        : "#6fa07a";

  return (
    <svg viewBox="0 0 140 128" className="flare-arc" role="img" aria-label={`Flare likelihood ${percent} percent`}>
      <g transform="rotate(150 70 70)">
        <circle
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke="var(--well)"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${CIRC * SPAN} ${CIRC}`}
        />
        <circle
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke={colour}
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${CIRC * SPAN * (percent / 100)} ${CIRC}`}
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </g>
      <text x="70" y="72" textAnchor="middle" className="flare-arc-num" fill={colour}>
        {percent}
        <tspan className="flare-arc-pct">%</tspan>
      </text>
      <text x="70" y="96" textAnchor="middle" className="flare-arc-band">
        {band}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------------- */

type Tile = {
  id: string;
  label: string;
  value: string;
  caption: string;
  detail: string;
  icon: React.ReactNode;
};

export default function WeatherPanel({ weather }: { weather: Weather | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setAnimate(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (!weather) {
    return (
      <div className="side-card">
        <span className="mono">TODAY</span>
        <ul>
          <li className="dim">Weather is not available right now.</li>
        </ul>
      </div>
    );
  }

  const delta = weather.pressureDelta24h;
  const uv = weather.uvIndexMax;
  const hi = weather.tempMaxC ?? weather.tempC;

  const tiles: Tile[] = [
    {
      id: "pressure",
      label: "PRESSURE",
      value: `${delta >= 0 ? "+" : ""}${delta}`,
      caption: delta <= -3 ? "falling" : delta >= 3 ? "rising" : "steady",
      detail:
        delta <= -5
          ? `Down ${Math.abs(delta)} hPa in 24 hours, now ${Math.round(weather.pressureHpa)}. This is the shape of day your hands have reacted to before.`
          : `${Math.round(weather.pressureHpa)} hPa, moving ${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} over 24 hours.`,
      icon: <PressureDial delta={delta} animate={animate} />,
    },
    {
      id: "uv",
      label: "SUN",
      value: uv === null ? "—" : uv.toFixed(1),
      caption: uv === null ? "no reading" : uv >= 6 ? "strong" : uv >= 3 ? "moderate" : "low",
      detail:
        uv === null
          ? "No UV reading for today."
          : uv >= 6
            ? `UV peaks at ${uv}. Strong enough that sleeves, a hat or shade are worth it if you are out for a while.`
            : uv >= 3
              ? `UV peaks at ${uv}. Worth the sunscreen if you will be outside a good stretch.`
              : `UV peaks at ${uv}. Low enough to not think about.`,
      icon: <UvSun index={uv ?? 0} animate={animate} />,
    },
    {
      id: "heat",
      label: "HEAT",
      value: `${Math.round(hi)}°`,
      caption: hi >= 27 ? "warm" : hi >= 18 ? "mild" : "cool",
      detail:
        hi >= 27
          ? `Up to ${Math.round(hi)}° today, humidity ${Math.round(weather.humidity)}%. Worth pacing the day and keeping water close.`
          : `Up to ${Math.round(hi)}° today, humidity ${Math.round(weather.humidity)}%.`,
      icon: <HeatGauge tempC={hi} animate={animate} />,
    },
  ];

  // Only the recommendations today actually calls for.
  const recs: Array<{ icon: string; text: string }> = [];
  if (uv !== null && uv >= 6) recs.push({ icon: "hat", text: "Cover up if you are out for long" });
  else if (uv !== null && uv >= 3) recs.push({ icon: "sun", text: "Sunscreen if you will be outside a while" });
  if (hi >= 27) recs.push({ icon: "drop", text: "Keep water close and pace the day" });
  if (delta <= -5) recs.push({ icon: "hand", text: "Hands may be stiffer than usual today" });
  if (recs.length === 0) recs.push({ icon: "calm", text: "Nothing about today needs working around" });

  return (
    <div className="wx-panel">
      <span className="mono wx-panel-title">TODAY</span>

      <div className="wx-tiles">
        {tiles.map((t) => (
          <button
            key={t.id}
            className={`wx-tile${open === t.id ? " is-open" : ""}`}
            onClick={() => setOpen(open === t.id ? null : t.id)}
            aria-expanded={open === t.id}
          >
            {t.icon}
            <span className="wx-value">{t.value}</span>
            <span className="wx-label">{t.label}</span>
            <span className="wx-caption">{t.caption}</span>
          </button>
        ))}
      </div>

      {open ? (
        <p className="wx-detail" role="status">
          {tiles.find((t) => t.id === open)?.detail}
        </p>
      ) : (
        <p className="wx-hint">Tap a dial for the reading behind it.</p>
      )}

      <div className="wx-recs">
        {recs.map((r) => (
          <div key={r.text} className="wx-rec">
            <RecIcon kind={r.icon} />
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecIcon({ kind }: { kind: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "hat")
    return (
      <svg {...common} aria-hidden>
        <path d="M3 15h18" />
        <path d="M6 15a6 6 0 0 1 12 0" />
      </svg>
    );
  if (kind === "drop")
    return (
      <svg {...common} aria-hidden>
        <path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z" />
      </svg>
    );
  if (kind === "hand")
    return (
      <svg {...common} aria-hidden>
        <path d="M8 12V6a1.5 1.5 0 0 1 3 0v5" />
        <path d="M11 11V5a1.5 1.5 0 0 1 3 0v6" />
        <path d="M14 11V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-3a1.5 1.5 0 0 1 3 0" />
      </svg>
    );
  if (kind === "sun")
    return (
      <svg {...common} aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
      </svg>
    );
  return (
    <svg {...common} aria-hidden>
      <path d="M4 13h4l2 5 4-12 2 7h4" />
    </svg>
  );
}
