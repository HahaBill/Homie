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

function fmtDayStamp(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  })
    .format(new Date(iso))
    .toUpperCase();
}

function fmtTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(iso)
  );
}

// Same glyphs as the app's lucide icons (MessageCircle, PhoneCall) so the
// handed-off page and the live record read as one design, not two.
function iconMsg(color: string): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;
}
function iconCall(color: string): string {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
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
  const badge =
    mentioned.length > 0
      ? `<div class="card-head"><span class="badge badge-taken">${taken.length}/${mentioned.length} taken</span></div>`
      : "";

  return `<div class="card">${badge}<div class="meds-row">${dots}</div>${summary}</div>`;
}

// ---------------------------------------------------------------------------
// Assembled page
// ---------------------------------------------------------------------------

export function reportHtml(data: ReportData, expUnixSeconds: number): string {
  const tz = safeTimezone(data.user.timezone);
  const name = data.user.name ? escapeHtml(data.user.name) : null;

  // data.checkins, not data.observations: a checkin is channel-agnostic
  // (text or call — see the 20260726040000 migration), so this count is
  // the true total across both, matching what STOP/MY DATA already report
  // via getDataSummary reading the same table.
  const firstCheckin = data.checkins[0] ?? null;
  const introLine =
    data.checkins.length > 0 && firstCheckin
      ? `${data.checkins.length} check-in${data.checkins.length === 1 ? "" : "s"} since ${fmtDay(firstCheckin.at, tz)}`
      : "The first check-ins will appear here as they happen";

  // A glanceable stat row up top — the same "count at a door" pattern as the
  // live record's SURFACES card, so a clinician skimming this page gets the
  // shape of it before reading a word.
  const callCount = data.checkins.filter((c) => c.channel === "call").length;
  const textCount = data.checkins.length - callCount;
  const statPills =
    data.checkins.length > 0
      ? `<div class="stat-row">` +
        `<span class="stat-pill">${data.checkins.length} check-in${data.checkins.length === 1 ? "" : "s"}</span>` +
        (textCount > 0 ? `<span class="stat-pill">${textCount} text${textCount === 1 ? "" : "s"}</span>` : "") +
        (callCount > 0 ? `<span class="stat-pill">${callCount} call${callCount === 1 ? "" : "s"}</span>` : "") +
        (firstCheckin ? `<span class="stat-pill stat-pill-quiet">since ${fmtDay(firstCheckin.at, tz)}</span>` : "") +
        `</div>`
      : "";

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
  const chipList = [...areaCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([area, n]) => `<span class="chip">${escapeHtml(area)}<i>${n}</i></span>`)
    .join("");
  const chips = chipList ? `<div class="card"><div class="chips">${chipList}</div></div>` : "";

  const quotes = data.observations
    .filter((o) => o.note && o.note.trim())
    .slice(-6)
    .reverse()
    .map(
      (o) =>
        `<div class="quote"><div class="quote-mark">${iconMsg(T.clay)}</div><div><p>“${escapeHtml(o.note as string)}”</p><span class="qdate">${fmtDay(o.at, tz)}</span></div></div>`
    )
    .join("");

  // One unified, reverse-chronological log across both channels — a call is
  // a check-in too, not a separate concept (see docs/PRD.md discussion:
  // renaming just this section without also unifying the data underneath
  // would have collided with the "X check-ins" count above, which already
  // reads this same table). Text entries render inline since they're
  // already short; call entries show the recap with a native <details>
  // toggle for the full transcript — no client JS, still prints fine.
  // Grouped under day-stamp dividers, same as the live record's timeline,
  // so a page of twenty entries reads as a handful of days, not a wall.
  let lastDayKey = "";
  const checkinEntries = data.checkins
    .filter((c) => c.message_text || c.reply_text)
    .slice(-20)
    .reverse()
    .map((c) => {
      const dayKey = localDateKey(c.at, tz);
      const stamp = dayKey !== lastDayKey ? `<div class="day-stamp">${fmtDayStamp(c.at, tz)}</div>` : "";
      lastDayKey = dayKey;
      const time = fmtTime(c.at, tz);

      if (c.channel === "call") {
        const mins = c.call?.duration_seconds != null ? Math.round(c.call.duration_seconds / 60) : null;
        const durationText = mins !== null ? ` &middot; ${mins} min${mins === 1 ? "" : "s"}` : "";
        const transcriptDetail = c.call?.transcript
          ? `<details class="call-transcript"><summary>See the whole call</summary><p>${escapeHtml(c.call.transcript)}</p></details>`
          : "";
        return (
          stamp +
          `<div class="entry">` +
          `<div class="entry-icon entry-icon-call">${iconCall(T.clayDeep)}</div>` +
          `<div class="entry-body">` +
          `<div class="entry-head"><span class="entry-time">${time}${durationText}</span><span class="badge badge-call">Call</span></div>` +
          `<p class="entry-copy">${escapeHtml(c.reply_text ?? "")}</p>` +
          transcriptDetail +
          `</div></div>`
        );
      }

      const prompt = c.message_text ? `<p class="entry-copy prompt">${escapeHtml(c.message_text)}</p>` : "";
      const reply = c.reply_text ? `<p class="entry-copy reply">${escapeHtml(c.reply_text)}</p>` : "";
      return (
        stamp +
        `<div class="entry">` +
        `<div class="entry-icon entry-icon-text">${iconMsg(T.clay)}</div>` +
        `<div class="entry-body">` +
        `<div class="entry-head"><span class="entry-time">${time}</span><span class="badge badge-text">Text</span></div>` +
        prompt +
        reply +
        `</div></div>`
      );
    })
    .join("");

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
  .stat-row { display:flex; gap:10px; flex-wrap:wrap; margin:16px 0 0; }
  .stat-pill { display:inline-flex; align-items:center; background:${T.peach}; border-radius:999px;
               padding:8px 16px; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px;
               letter-spacing:.04em; color:${T.clayDeep}; font-weight:700; }
  .stat-pill-quiet { background:${T.surface}; border:1px solid ${T.beige}; color:${T.muted2}; font-weight:500; }
  .sec-head { display:flex; align-items:baseline; gap:12px; margin-bottom:16px; }
  .sec-head .num { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; color:${T.clay}; }
  .sec-head h2 { font-family:'Fredoka',system-ui,sans-serif; font-weight:600; font-size:26px; margin:0; }
  .card { background:${T.surface}; border:1px solid ${T.beige}; border-radius:22px; padding:24px; }
  .card-head { display:flex; justify-content:flex-end; margin-bottom:14px; }
  .panel-peach { background:${T.peach}; border-radius:26px; padding:32px; }
  .empty { font-size:16px; color:${T.muted}; }
  svg { display:block; }
  .card svg { width:100%; height:auto; }
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
  .badge { display:inline-flex; align-items:center; font-family:'JetBrains Mono',ui-monospace,monospace;
           font-size:10px; letter-spacing:.1em; text-transform:uppercase; font-weight:700;
           border-radius:999px; padding:5px 11px; flex:0 0 auto; }
  .badge-text { background:color-mix(in srgb, ${T.clay} 16%, white); color:${T.clayDeep}; }
  .badge-call { background:${T.cream}; color:${T.charcoal}; border:1px solid ${T.beige}; }
  .badge-taken { background:${T.okayBg}; color:${T.okayInk}; }
  .quote { display:flex; gap:14px; align-items:flex-start; background:${T.surface};
           border:1px solid ${T.beige}; border-left:3px solid ${T.clay}; border-radius:20px;
           padding:20px 24px; margin-bottom:12px; }
  .quote-mark { flex:0 0 auto; margin-top:2px; opacity:.55; }
  .quote p { margin:0; font-size:17px; line-height:1.55; }
  .qdate { display:block; margin-top:8px; font-family:'JetBrains Mono',ui-monospace,monospace;
           font-size:11px; color:${T.muted2}; }
  .day-stamp { text-align:center; font-family:'JetBrains Mono',ui-monospace,monospace; font-size:11px;
               letter-spacing:.14em; color:${T.muted2}; margin:22px 0 12px; }
  .day-stamp:first-child { margin-top:0; }
  .entry { display:grid; grid-template-columns:40px minmax(0,1fr); gap:14px;
           background:${T.surface}; border:1px solid ${T.beige}; border-radius:20px;
           padding:18px 20px; margin-bottom:10px; }
  .entry-icon { width:40px; height:40px; border-radius:13px; display:grid; place-items:center; flex:0 0 auto; }
  .entry-icon-text { background:color-mix(in srgb, ${T.clay} 14%, white); }
  .entry-icon-call { background:${T.cream}; }
  .entry-body { min-width:0; }
  .entry-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
  .entry-time { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:12px; color:${T.muted2}; }
  .entry-copy { margin:0; font-size:16px; line-height:1.55; }
  .entry-copy.prompt { color:${T.muted}; font-size:14px; margin-bottom:6px; }
  .entry-copy.reply { font-size:16px; }
  details.call-transcript { margin-top:14px; }
  details.call-transcript summary { cursor:pointer; font-family:'JetBrains Mono',ui-monospace,monospace;
                                     font-size:11px; letter-spacing:.1em; text-transform:uppercase;
                                     color:${T.clayDeep}; }
  details.call-transcript p { margin-top:10px; padding:14px 16px; background:${T.cream}; border-radius:12px;
                               font-size:14px; line-height:1.6; color:${T.muted}; white-space:pre-wrap; }
  footer { margin-top:56px; border-top:1px solid ${T.beige}; padding-top:20px;
           font-size:13px; line-height:1.7; color:${T.muted2}; }
  @media print {
    body { background:#fff; }
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
  ${statPills}

  ${sec("Pain, day by day", chartBlock)}
  ${sec("The tablets", meds)}
  ${sec("Where it shows up", chips)}
  ${sec("In your own words", quotes)}
  ${sec("The check-ins", checkinEntries)}

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
