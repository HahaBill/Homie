import type { ReportData } from "./supabase";

/**
 * The page (docs/ARCHITECTURE.md): a pre-rendered document in the Homie
 * Design System v2 core colorway. Server-generated inline SVG, no charting
 * library, no client JS — it renders with JavaScript disabled and prints at
 * vector quality, because its whole purpose is to be handed to a
 * rheumatologist. Every piece of user text is escaped before it touches HTML.
 */

// Design-system tokens, transcribed from the same bundle as app/globals.css.
const T = {
  cream: "#FFF4EC",
  clay: "#D47A5A",
  clayDeep: "#B85F3F",
  peach: "#F6DCCB",
  charcoal: "#2B2B2B",
  beige: "#E8DCC9",
  surface: "#FFFCF8",
  muted: "#6B5C50",
  muted2: "#A2907F",
  okayBg: "#E7EFE3",
  okayInk: "#4F6247",
  missBg: "#F2E4E0",
  missInk: "#8A5140",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * users.timezone is free text as far as Postgres is concerned; a junk value
 * would make every Intl call below throw and 500 the whole page. Validate
 * once, fall back to the schema default.
 */
export function safeTimezone(tz: string | null | undefined): string {
  const candidate = tz || "Europe/London";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate });
    return candidate;
  } catch {
    return "Europe/London";
  }
}

function fmtDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, day: "numeric", month: "short" }).format(
    new Date(iso)
  );
}

function localDateKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, dateStyle: "short" }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Chart: pain (1–5) over time, barometric pressure delta overlaid when known
// ---------------------------------------------------------------------------

function painChartSvg(data: ReportData, timezone: string): string {
  const pain = data.observations.filter(
    (o): o is typeof o & { pain_level: number } => o.pain_level !== null
  );
  if (pain.length === 0) return "";

  const W = 720;
  const H = 240;
  const padL = 34;
  const padR = 14;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const times = pain.map((o) => new Date(o.at).getTime());
  const weather = data.weather.filter(
    (w): w is typeof w & { pressure_delta_24h: number } => w.pressure_delta_24h !== null
  );
  for (const w of weather) times.push(new Date(w.date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const span = Math.max(tMax - tMin, 1);

  const x = (t: number) => padL + ((t - tMin) / span) * plotW;
  const yPain = (p: number) => padT + ((5 - p) / 4) * plotH;

  let grid = "";
  for (let p = 1; p <= 5; p++) {
    const y = yPain(p);
    grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${T.beige}" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${y + 3.5}" text-anchor="end" class="tick">${p}</text>`;
  }

  let pressure = "";
  if (weather.length >= 2) {
    const vals = weather.map((w) => w.pressure_delta_24h);
    const vMin = Math.min(...vals);
    const vMax = Math.max(...vals);
    const vSpan = Math.max(vMax - vMin, 0.1);
    const pts = weather
      .map((w) => `${x(new Date(w.date).getTime()).toFixed(1)},${(padT + ((vMax - w.pressure_delta_24h) / vSpan) * plotH).toFixed(1)}`)
      .join(" ");
    pressure = `<polyline points="${pts}" fill="none" stroke="${T.muted2}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  }

  const painPts = pain.map((o) => ({ px: x(new Date(o.at).getTime()), py: yPain(o.pain_level) }));
  const painLine =
    painPts.length >= 2
      ? `<polyline points="${painPts.map((p) => `${p.px.toFixed(1)},${p.py.toFixed(1)}`).join(" ")}" fill="none" stroke="${T.clay}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      : "";
  const painDots = painPts
    .map((p) => `<circle cx="${p.px.toFixed(1)}" cy="${p.py.toFixed(1)}" r="4" fill="${T.clay}"/>`)
    .join("");

  const firstLabel = fmtDay(new Date(tMin).toISOString(), timezone);
  const lastLabel = fmtDay(new Date(tMax).toISOString(), timezone);
  const xLabels =
    `<text x="${padL}" y="${H - 8}" class="tick">${firstLabel}</text>` +
    (tMax > tMin
      ? `<text x="${W - padR}" y="${H - 8}" text-anchor="end" class="tick">${lastLabel}</text>`
      : "");

  const legend =
    `<div class="legend">` +
    `<span><i style="background:${T.clay}"></i>pain, 1 to 5</span>` +
    (pressure ? `<span><i class="dash" style="border-color:${T.muted2}"></i>pressure change</span>` : "") +
    `</div>`;

  return (
    legend +
    `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Pain over time${pressure ? " with barometric pressure" : ""}">` +
    `<style>.tick{font:10px 'JetBrains Mono',ui-monospace,monospace;fill:${T.muted2}}</style>` +
    grid +
    pressure +
    painLine +
    painDots +
    xLabels +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Medication strip: one dot per day, last 14 days she was heard from
// ---------------------------------------------------------------------------

function medsStrip(data: ReportData, timezone: string): string {
  const byDay = new Map<string, boolean | null>();
  for (const o of data.observations) {
    const key = localDateKey(o.at, timezone);
    // Latest observation of the day wins; an explicit answer beats silence.
    if (o.meds_taken !== null || !byDay.has(key)) byDay.set(key, o.meds_taken);
  }
  const days = [...byDay.entries()].slice(-14);
  if (days.length === 0) return "";

  const mentioned = days.filter(([, v]) => v !== null);
  const taken = mentioned.filter(([, v]) => v === true);

  const dots = days
    .map(([key, v]) => {
      const dayNum = key.slice(-2).replace(/^0/, "");
      const style =
        v === true
          ? `background:${T.okayBg};border:1.5px solid ${T.okayInk}`
          : v === false
            ? `background:${T.missBg};border:1.5px solid ${T.missInk}`
            : `background:transparent;border:1.5px dashed ${T.beige}`;
      const mark = v === true ? "✓" : v === false ? "✕" : "";
      const ink = v === true ? T.okayInk : T.missInk;
      return `<div class="day"><span class="dot" style="${style};color:${ink}">${mark}</span><span class="dnum">${dayNum}</span></div>`;
    })
    .join("");

  const summary =
    mentioned.length > 0
      ? `<p class="meds-note">Taken on ${taken.length} of the ${mentioned.length} day${mentioned.length === 1 ? "" : "s"} it came up. Blank days are days it wasn't mentioned — not missed doses.</p>`
      : `<p class="meds-note">Medication hasn't come up in the messages yet.</p>`;

  return `<div class="meds-row">${dots}</div>${summary}`;
}

// ---------------------------------------------------------------------------
// Assembled page
// ---------------------------------------------------------------------------

export function reportHtml(data: ReportData, expUnixSeconds: number): string {
  const tz = safeTimezone(data.user.timezone);
  const name = data.user.name ? escapeHtml(data.user.name) : null;

  const first = data.observations[0] ?? null;
  const introLine =
    data.observations.length > 0 && first
      ? `${data.observations.length} check-in${data.observations.length === 1 ? "" : "s"} since ${fmtDay(first.at, tz)}`
      : "The first check-ins will appear here as they happen";

  // Plain observed facts only — no scores, no trends language, no advice.
  const recentPain = data.observations.filter((o) => o.pain_level !== null).slice(-7);
  const painLine =
    recentPain.length >= 3
      ? `<p class="lede">Across the last ${recentPain.length} check-ins that mentioned pain, she put it between ${Math.min(
          ...recentPain.map((o) => o.pain_level as number)
        )} and ${Math.max(...recentPain.map((o) => o.pain_level as number))} out of 5.</p>`
      : "";

  const chart = painChartSvg(data, tz);
  const chartBlock = chart
    ? `<div class="card">${chart}</div>`
    : `<div class="panel-peach empty">Not enough check-ins to draw yet. It fills in as the texting carries on.</div>`;

  const meds = medsStrip(data, tz);

  const areaCounts = new Map<string, number>();
  for (const o of data.observations) {
    for (const a of o.areas) {
      const key = a.trim().toLowerCase();
      if (key) areaCounts.set(key, (areaCounts.get(key) ?? 0) + 1);
    }
  }
  const chips = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([area, n]) => `<span class="chip">${escapeHtml(area)}<i>${n}</i></span>`)
    .join("");

  const quotes = data.observations
    .filter((o) => o.note && o.note.trim())
    .slice(-6)
    .reverse()
    .map(
      (o) =>
        `<div class="quote"><p>“${escapeHtml(o.note as string)}”</p><span class="qdate">${fmtDay(o.at, tz)}</span></div>`
    )
    .join("");

  let thread = "";
  let lastDayKey = "";
  for (const m of data.thread.slice(-30)) {
    const dayKey = localDateKey(m.at, tz);
    if (dayKey !== lastDayKey) {
      thread += `<div class="day-sep">${fmtDay(m.at, tz)}</div>`;
      lastDayKey = dayKey;
    }
    thread += `<div class="bubble ${m.who === "homie" ? "homie" : "her"}">${escapeHtml(m.text)}</div>`;
  }

  const expires = fmtDay(new Date(expUnixSeconds * 1000).toISOString(), tz);

  let sectionNum = 0;
  const sec = (title: string, body: string) => {
    if (!body) return "";
    sectionNum += 1;
    return `<section><div class="sec-head"><span class="num">0${sectionNum}</span><h2>${title}</h2></div>${body}</section>`;
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Homie — ${name ? `${name}'s page` : "your page"}</title>
<link rel="icon" href="/homie-greeting.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin:0; background:${T.cream}; color:${T.charcoal};
         font-family:'Nunito',system-ui,sans-serif; font-weight:600;
         -webkit-font-smoothing:antialiased; }
  .wrap { max-width:780px; margin:0 auto; padding:28px 20px 64px; }
  header { display:flex; align-items:center; gap:14px; margin-bottom:8px; }
  header img { width:44px; height:44px; border-radius:12px; object-fit:cover; }
  .word { font-family:'Fredoka',system-ui,sans-serif; font-weight:600; font-size:26px; color:${T.clay}; }
  .tag { margin-left:auto; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px;
         letter-spacing:.16em; text-transform:uppercase; color:${T.muted2}; }
  h1 { font-family:'Fredoka',system-ui,sans-serif; font-weight:600; font-size:clamp(30px,6vw,42px);
       line-height:1.1; margin:18px 0 6px; }
  .sub { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; color:${T.muted2}; margin:0 0 6px; }
  .lede { font-size:17px; line-height:1.6; color:${T.muted}; margin:10px 0 0; max-width:60ch; }
  section { margin-top:44px; }
  .sec-head { display:flex; align-items:baseline; gap:12px; margin-bottom:16px; }
  .sec-head .num { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; color:${T.clay}; }
  .sec-head h2 { font-family:'Fredoka',system-ui,sans-serif; font-weight:600; font-size:26px; margin:0; }
  .card { background:${T.surface}; border:1px solid ${T.beige}; border-radius:22px; padding:24px; }
  .panel-peach { background:${T.peach}; border-radius:26px; padding:32px; }
  .empty { font-size:16px; color:${T.muted}; }
  svg { display:block; width:100%; height:auto; }
  .legend { display:flex; gap:18px; margin-bottom:12px; font-size:13px; color:${T.muted}; }
  .legend i { display:inline-block; width:18px; height:4px; border-radius:2px; margin-right:7px; vertical-align:middle; }
  .legend i.dash { height:0; border-top:2px dashed; background:none; border-radius:0; }
  .meds-row { display:flex; gap:8px; flex-wrap:wrap; }
  .day { display:flex; flex-direction:column; align-items:center; gap:4px; }
  .dot { width:34px; height:34px; border-radius:50%; display:grid; place-items:center;
         font-size:13px; font-weight:800; }
  .dnum { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px; color:${T.muted2}; }
  .meds-note { font-size:14px; line-height:1.55; color:${T.muted}; margin:14px 0 0; max-width:58ch; }
  .chips { display:flex; gap:10px; flex-wrap:wrap; }
  .chip { background:${T.peach}; border-radius:999px; padding:9px 16px; font-size:14px; font-weight:700; }
  .chip i { font-style:normal; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px;
            color:${T.clayDeep}; margin-left:8px; }
  .quote { background:${T.surface}; border:1px solid ${T.beige}; border-radius:22px;
           padding:20px 24px; margin-bottom:12px; }
  .quote p { margin:0; font-size:17px; line-height:1.55; }
  .qdate { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px; color:${T.muted2}; }
  .thread { display:flex; flex-direction:column; gap:8px; }
  .day-sep { text-align:center; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:10px;
             letter-spacing:.12em; text-transform:uppercase; color:${T.muted2}; margin:14px 0 4px; }
  .bubble { max-width:78%; border-radius:18px; padding:10px 15px; font-size:15px; line-height:1.45; }
  .bubble.homie { align-self:flex-start; background:${T.peach}; }
  .bubble.her { align-self:flex-end; background:${T.clay}; color:${T.cream}; }
  footer { margin-top:56px; border-top:1px solid ${T.beige}; padding-top:20px;
           font-size:13px; line-height:1.7; color:${T.muted2}; }
  @media print {
    body { background:#fff; }
    .bubble.her { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    footer { page-break-inside:avoid; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <img src="/homie-greeting.png" alt="">
    <span class="word">Homie</span>
    <span class="tag">Health page</span>
  </header>

  <p class="sub">${escapeHtml(introLine)}</p>
  <h1>${name ? `${name}'s page` : "Here's how it's been going"}</h1>
  ${painLine}

  ${sec("Pain, day by day", chartBlock)}
  ${sec("The tablets", meds)}
  ${sec("Where it shows up", chips ? `<div class="chips">${chips}</div>` : "")}
  ${sec("In your own words", quotes)}
  ${sec("The conversation", thread ? `<div class="card thread">${thread}</div>` : "")}

  <footer>
    This link expires ${expires} and this page is only for whoever it was sent to.
    Homie notices; it never advises — bring this to your clinician.
    Texting STOP or DELETE to Homie also switches this link off.
  </footer>
</div>
</body>
</html>`;
}

/** Friendly dead-link page, same visual language, zero data. */
export function linkProblemHtml(
  reason: "malformed" | "bad_signature" | "expired" | "revoked" | "error"
): string {
  const line =
    reason === "expired"
      ? "This link has expired. Text Homie and ask for your page again — a fresh one takes a second."
      : reason === "revoked"
        ? "This page isn't available any more."
        : reason === "error"
          ? "Homie couldn't load the page just now. Give it a minute and try the link again."
          : "This link doesn't look right. Text Homie and ask for your page again.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Homie</title>
<style>
  body { margin:0; background:${T.cream}; color:${T.charcoal};
         font-family:'Nunito',system-ui,sans-serif; font-weight:600;
         display:grid; place-items:center; min-height:100vh; padding:24px; }
  .card { background:${T.peach}; border-radius:26px; padding:40px; max-width:420px; text-align:center; }
  .word { font-family:'Fredoka',system-ui,sans-serif; font-weight:600; font-size:24px; color:${T.clay}; }
  p { font-size:17px; line-height:1.6; color:${T.muted}; }
</style>
</head>
<body><div class="card"><div class="word">Homie</div><p>${line}</p></div></body>
</html>`;
}
