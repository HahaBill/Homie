/* Homie — landing page
   Copy, palette, and components applied from "Homie Design System v2". */

const LOGO = "/homie-logo.png";

const PRINCIPLES = [
  {
    n: "PRINCIPLE 01",
    title: "Ask, don't assess",
    body: "Every surface opens with a question, not a score. Data is a side effect of care, never the point.",
  },
  {
    n: "PRINCIPLE 02",
    title: "One thing at a time",
    body: "A screen holds a single decision. If it needs a second, it needs a second screen.",
  },
  {
    n: "PRINCIPLE 03",
    title: "Soft edges, clear exits",
    body: "Low-contrast, rounded surfaces — but the way out and the way to help are always obvious.",
  },
];

const SWATCHES = [
  { name: "Warm Cream", hex: "#FFF4EC", note: "Canvas. 70% of every screen.", bg: "var(--cream)" },
  { name: "Terracotta Clay", hex: "#D47A5A", note: "Primary action, wordmark, active tab.", bg: "var(--clay)" },
  { name: "Soft Peach", hex: "#F6DCCB", note: "Feature panels, chips, selected states.", bg: "var(--peach)" },
  { name: "Charcoal", hex: "#2B2B2B", note: "Body text, watch & glasses surfaces.", bg: "var(--charcoal)" },
  { name: "Muted Beige", hex: "#E8DCC9", note: "Dividers, disabled, quiet fills.", bg: "var(--beige)" },
];

const WE_SAY = [
  "“Hey, just checking in.”",
  "“That sounds heavy. Want to talk about it?”",
  "“No rush — I'll be here later.”",
  "“Thanks for telling me.”",
];

const WE_DONT = [
  "“Complete your daily wellness assessment.”",
  "“Your mood score dropped 12% this week.”",
  "“You've broken your 7-day streak!”",
  "“Logged successfully.”",
];

const VOICE_RULES = [
  { title: "Short sentences", body: "Under 12 words on a phone. Under 8 on a watch.", dark: false },
  { title: "No diagnosis", body: "Homie never names a condition or gives medical advice.", dark: false },
  { title: "Always an exit", body: "“Not now” is offered as often as “Yes”.", dark: false },
  {
    title: "Crisis language",
    body: "Direct, calm, no metaphors: “I can connect you with someone now.” Human help is one tap away.",
    dark: true,
  },
];

export default function Home() {
  return (
    <>
      {/* Header ------------------------------------------------------------ */}
      <header className="site-header">
        <div className="inner">
          <a className="brand-lockup" href="#top" aria-label="Homie home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-mark" src={LOGO} alt="Homie" />
            <span className="brand-word">
              Ho<span>mie</span>
            </span>
          </a>
          <span className="brand-tag">CORE COLORWAY · V2.0</span>
          <nav className="site-nav" aria-label="Primary">
            <a href="#principles">Principles</a>
            <a href="#channels">Channels</a>
            <a href="#palette">Palette</a>
            <a href="#voice">Voice</a>
          </nav>
          <a className="btn btn-primary" href="#get" style={{ marginLeft: 8 }}>
            Get Homie
          </a>
        </div>
      </header>

      <main id="top">
        {/* Hero ------------------------------------------------------------ */}
        <section className="hero wrap" aria-labelledby="hero-title">
          <div className="hero-grid">
            <div className="hero-copy">
              <h1 id="hero-title" className="hero-title">
                A gentle check-in.
                <br />
                <span>When you need it.</span>
              </h1>
              <p className="hero-sub">
                Homie is a wellbeing companion that shows up quietly — phone,
                watch, glasses — and asks one honest question. Warm cream is the
                canvas, terracotta is the only thing that ever asks to be
                tapped.
              </p>
              <div className="hero-tags">
                <span className="pill">Warm</span>
                <span className="pill">Unhurried</span>
                <span className="pill">Never clinical</span>
                <span className="pill">On your side</span>
              </div>
              <div className="hero-cta">
                <a className="btn btn-primary" href="#get">
                  Tap to check in
                </a>
                <a className="btn btn-ghost" href="#channels">
                  See how it shows up
                </a>
              </div>
            </div>
            <div className="hero-visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO} alt="The Homie app icon" />
            </div>
          </div>
        </section>

        {/* Principles ------------------------------------------------------ */}
        <section id="principles" className="section wrap">
          <div className="section-head">
            <span className="num">01</span>
            <h2>Built on three principles</h2>
          </div>
          <div className="grid-3">
            {PRINCIPLES.map((p) => (
              <article key={p.n} className="card principle">
                <div className="eyebrow">{p.n}</div>
                <div className="p-title">{p.title}</div>
                <p>{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Channels -------------------------------------------------------- */}
        <section id="channels" className="section wrap">
          <div className="section-head">
            <span className="num">02</span>
            <h2>However you already live, Homie fits</h2>
          </div>
          <p
            className="hero-sub"
            style={{ marginBottom: 32, maxWidth: "72ch" }}
          >
            One honest question, wherever you are — a phone check-in, a quiet
            nudge on your wrist, a text thread, or a voice call run by a warm
            conversational agent. Never two messages back to back. Always an
            easy way out.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 20,
              alignItems: "start",
            }}
          >
            {/* Phone check-in */}
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 22 }}>
                APP · PHONE
              </div>
              <div className="phone">
                <div className="phone-screen">
                  <div className="phone-status">
                    <span>9:41</span>
                    <span className="sig">▮▮▮</span>
                  </div>
                  <div className="phone-topbar">
                    <span className="phone-word">Homie</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={LOGO}
                      alt=""
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: "50%",
                        objectFit: "cover",
                        objectPosition: "50% 62%",
                      }}
                    />
                  </div>
                  <div className="phone-body">
                    <div className="phone-greeting">Hey, I&apos;m here.</div>
                    <div className="phone-q">How are you feeling today?</div>
                    <div className="mood-list">
                      <div className="mood okay">I&apos;m doing okay</div>
                      <div className="mood tough">I&apos;m having a tough day</div>
                      <div className="mood support">I need support</div>
                      <div className="mood neutral">Just checking in</div>
                    </div>
                  </div>
                  <div className="phone-tabs">
                    <div className="active">Check-in</div>
                    <div>History</div>
                    <div>Tools</div>
                    <div>Profile</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Watch + voice call stacked */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="card">
                <div className="eyebrow" style={{ marginBottom: 22 }}>
                  NOTIFICATION · WATCH
                </div>
                <div className="watch">
                  <div className="watch-head">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={LOGO}
                      alt=""
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        objectFit: "cover",
                        objectPosition: "50% 62%",
                      }}
                    />
                    <span className="lbl">HOMIE</span>
                    <span className="time">9:41</span>
                  </div>
                  <div className="watch-msg">
                    Hey, just checking in. How are you feeling?
                  </div>
                  <div className="watch-cta">Tap to check in</div>
                  <div className="watch-foot">You&apos;re not alone.</div>
                </div>
              </div>
            </div>

            {/* iMessage */}
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 22 }}>
                IMESSAGE THREAD
              </div>
              <div className="imsg">
                <div className="imsg-screen">
                  <div className="imsg-status">
                    <span>9:41</span>
                    <span className="sig">▮▮▮</span>
                  </div>
                  <div className="imsg-peer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={LOGO} alt="" />
                    <div className="name">Homie</div>
                  </div>
                  <div className="imsg-thread">
                    <div className="imsg-day">Today 9:41</div>
                    <div className="bubble them">
                      Hey, just checking in. How&apos;s today going?
                    </div>
                    <div className="bubble me">Honestly kind of rough</div>
                    <div className="bubble them">
                      That sounds heavy. Want to talk about it, or just sit with
                      it for a bit?
                    </div>
                    <div className="imsg-quick">
                      <span className="qr clay">Let&apos;s talk</span>
                      <span className="qr">Just sit</span>
                      <span className="qr">Call me</span>
                    </div>
                  </div>
                  <div className="imsg-input">
                    <div className="field">iMessage</div>
                    <div className="send">↑</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Voice call */}
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 22 }}>
                VOICE CALL · IN PROGRESS
              </div>
              <div className="call">
                <div className="call-screen">
                  <div className="call-status">
                    <span>9:41</span>
                    <span className="sig">▮▮▮</span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="call-avatar" src={LOGO} alt="" />
                  <div className="call-name">Homie</div>
                  <div className="call-state">LISTENING · 02:14</div>
                  <div className="waveform" aria-hidden="true">
                    {[14, 26, 40, 22, 34, 12, 30, 18, 8].map((h, i) => (
                      <span
                        key={i}
                        style={{
                          height: h,
                          animationDelay: `${i * 0.18}s`,
                          background:
                            h > 28 ? "var(--clay)" : "var(--clay-light)",
                        }}
                      />
                    ))}
                  </div>
                  <div className="call-caption">
                    “Take your time. I&apos;m not going anywhere.”
                  </div>
                  <div className="call-controls">
                    <div className="call-btn sm">Mute</div>
                    <div className="call-btn end">End</div>
                    <div className="call-btn sm">Human</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Palette --------------------------------------------------------- */}
        <section id="palette" className="section wrap">
          <div className="section-head">
            <span className="num">03</span>
            <h2>A calm, deliberate palette</h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 20,
              marginBottom: 20,
            }}
          >
            {SWATCHES.map((s) => (
              <div key={s.hex} className="card swatch">
                <div className="chip-color" style={{ background: s.bg }} />
                <div className="s-name">{s.name}</div>
                <div className="s-hex">{s.hex}</div>
                <div className="s-note">{s.note}</div>
              </div>
            ))}
          </div>

          <div className="panel-peach">
            <div
              className="eyebrow"
              style={{ color: "var(--clay-deep)", marginBottom: 20 }}
            >
              RATIO · HOW THE THREE MAIN COLORS SHARE A SCREEN
            </div>
            <div className="ratio">
              <div className="r-cream">Warm Cream · 70%</div>
              <div className="r-peach">Peach · 22%</div>
              <div className="r-clay">Clay · 8%</div>
            </div>
            <p
              style={{
                margin: "24px 0 0",
                fontSize: 15,
                lineHeight: 1.65,
                color: "var(--muted)",
              }}
            >
              Terracotta never exceeds ~8% of a screen — it marks the one thing
              worth tapping. Peach carries grouping; cream carries everything
              else. Charcoal and beige are structure, not colour.
            </p>
          </div>
        </section>

        {/* Voice ----------------------------------------------------------- */}
        <section id="voice" className="section wrap">
          <div className="section-head">
            <span className="num">04</span>
            <h2>Voice</h2>
          </div>

          <div className="voice-hero">
            <h3>
              Talk like a friend, <span>not a form.</span>
            </h3>
          </div>

          <div className="grid-2">
            <div className="say">
              <div className="say-head yes">WE SAY</div>
              <div className="say-body">
                {WE_SAY.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
            <div className="say">
              <div className="say-head no">WE DON&apos;T</div>
              <div className="say-body no">
                {WE_DONT.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid-4" style={{ marginTop: 20 }}>
            {VOICE_RULES.map((r) => (
              <div key={r.title} className={r.dark ? "panel-charcoal" : "card"}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 500,
                    fontSize: 22,
                    marginBottom: 8,
                  }}
                >
                  {r.title}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    lineHeight: 1.6,
                    color: r.dark ? "#C7BBB1" : "var(--muted)",
                  }}
                >
                  {r.body}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA ------------------------------------------------------------- */}
        <section id="get" className="section wrap">
          <div className="cta">
            <div className="eyebrow" style={{ color: "var(--clay-light)" }}>
              ONE HONEST QUESTION
            </div>
            <h2>
              Homie is ready <span>when you are.</span>
            </h2>
            <p>
              No score to chase, no streak to break. Just a warm check-in that
              shows up quietly and leaves the moment you want it to. Nothing you
              say leaves your device unless you send it.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="btn btn-primary" href="#top">
                Tap to check in
              </a>
              <a
                className="btn btn-secondary"
                href="#channels"
                style={{ background: "#3a3a3a", color: "var(--beige)" }}
              >
                Maybe later
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* Footer ----------------------------------------------------------- */}
      <footer className="site-footer">
        <div className="wrap inner">
          <span>Homie Design System · v2.0 · Core colorway</span>
          <span className="tagline">A gentle check-in. When you need it.</span>
        </div>
      </footer>
    </>
  );
}
