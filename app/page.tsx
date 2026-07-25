/* Homie — landing page
   Content from PRD §1–§7 and §14. Design system from PRD §13.
   Constraints honoured: one apricot element per screen, alert red only on the
   999 path, no gradients, no glass, no shadows, no emoji, no exclamation marks. */

/* Three weeks of daily readings. Pressure drops lead symptom rises by ~a day.
   Plotted as inline SVG so it renders without JS and prints as vector. */
const PRESSURE = [
  1018, 1020, 1019, 1015, 1009, 1004, 1006, 1012, 1016, 1017, 1014, 1008, 1002,
  1005, 1011, 1015, 1013, 1007, 1001, 1004, 1010,
];
const PAIN = [2, 2, 2, 3, 4, 5, 4, 3, 2, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4, 3];

const X = (i: number) => i * 34 + 12;
/* Pressure occupies the upper band, symptoms the lower — shared date axis. */
const YP = (hpa: number) => 110 - (hpa - 998) * 3.75;
const YS = (level: number) => 200 - (level - 1) * 17.5;

const line = (values: number[], y: (v: number) => number) =>
  values.map((v, i) => `${X(i)},${y(v).toFixed(1)}`).join(" ");

const STEPS = [
  {
    n: "01",
    title: "A message arrives",
    body: "Same time every morning. Built from today's pressure, last night's sleep, your medication schedule, and what you said yesterday.",
  },
  {
    n: "02",
    title: "You reply how you talk",
    body: "“hands are bad”. “ok today”. “didn't sleep”. No form, no scale, no required format. Ignoring it for three days costs you nothing.",
  },
  {
    n: "03",
    title: "Homie keeps the record",
    body: "Your words become structured notes. Where a reply is unclear, it stays unclear — nothing is guessed into a number that looks certain.",
  },
  {
    n: "04",
    title: "Ninety days becomes one page",
    body: "Pressure and symptoms on one chart, your medication, your own words with dates. Printable, and made to be handed over.",
  },
];

const QUOTES = [
  { d: "Tue 8 July", t: "“hands are bad again, worse than sunday”" },
  { d: "Sat 12 July", t: "“slept maybe four hours. everything aches”" },
  { d: "Wed 16 July", t: "“ok today actually. did the garden”" },
];

const NEVER = [
  {
    h: "It never recommends a dose",
    p: "Changing your medication is your clinician's decision. Homie will not suggest one, and does not try to.",
  },
  {
    h: "It never diagnoses or predicts",
    p: "No flare forecasts, no triage, no conclusions about what your symptoms mean. Homie notices; it does not conclude.",
  },
  {
    h: "There are no scores or streaks",
    p: "Nothing to fail, nothing to keep up. Comparisons are to your own recent baseline, never to a population average.",
  },
  {
    h: "STOP, DELETE and MY DATA work",
    p: "Text any of them and they take effect immediately. Consent is explicit, timestamped, and yours to withdraw.",
  },
];

export default function Home() {
  return (
    <>
      <header className="site-header">
        <div className="inner">
          <a href="#top" className="wordmark" aria-label="Homie, home">
            Homie
          </a>
          <nav className="site-nav" aria-label="Primary">
            <a href="#how">How it works</a>
            <a href="#thread">The thread</a>
            <a href="#page">The page</a>
            <a href="#trust">What it never does</a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero — the one feeling line per screen, plus the single apricot element */}
        <section className="hero wrap">
          <h1>Homie checks in, so you don&rsquo;t have to keep track.</h1>
          <p className="lede">
            Homie texts you every morning, notices the pattern between the
            weather, your sleep and how you feel, and turns ninety days of it
            into one page you hand your consultant.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#how">
              See how it works
            </a>
            <a className="btn btn-quiet" href="#page">
              Look at the page
            </a>
          </div>
          <p className="hero-note">
            No app to download. No account. It arrives as a text message.
          </p>
        </section>

        {/* The problem */}
        <section className="section wrap">
          <p className="label">The problem</p>
          <h2 className="h2">
            The pattern is real. It is just impossible to hold in your head.
          </h2>
          <p className="lede" style={{ marginTop: 20 }}>
            Pressure drops and your joints seize. You sleep badly and the next
            day is wrecked. You half-notice this, so you start writing it down —
            in a notebook, in the Notes app, in a spreadsheet.
          </p>
          <p className="lede" style={{ marginTop: 18 }}>
            Then the appointment comes, eleven weeks later, and you cannot
            remember. You say it has been about the same, because that is all
            you have got. Nothing gets adjusted. The cycle repeats.
          </p>
        </section>

        {/* The loop */}
        <section id="how" className="section wrap">
          <p className="label">How it works</p>
          <h2 className="h2">Four steps, and you only do one of them.</h2>
          <div className="loop">
            {STEPS.map((s) => (
              <article key={s.n} className="step">
                <div className="n">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* The thread */}
        <section id="thread" className="section wrap">
          <p className="label">The thread</p>
          <h2 className="h2">The text message is the whole interface.</h2>

          <div className="thread-grid">
            <div className="thread">
              <p className="thread-day">Thursday, 17 July</p>

              <div className="bubble homie">
                <p>
                  morning. you slept about five hours and your HRV&rsquo;s under
                  your usual. pressure&rsquo;s dropping today too, which is
                  usually a rough combination for you.
                </p>
                <p>no rush &mdash; did the tablets happen?</p>
              </div>

              <div className="bubble her">took them. hands are stiff though</div>

              <div className="bubble homie">
                <p>noted, thanks for telling me.</p>
                <p>
                  that&rsquo;s the fourth stiff morning after a pressure drop
                  this month. i&rsquo;ll keep it on the page for the 14th.
                </p>
              </div>

              <p className="thread-day">Friday, 18 July</p>

              <div className="bubble homie">
                morning. pressure&rsquo;s levelled out and you got seven hours.
                nothing needed from you today.
              </div>
            </div>

            <div className="notes">
              <div className="note">
                <h3>It notices. It does not advise.</h3>
                <p>
                  Homie can say that your stiff mornings follow pressure drops.
                  It will not tell you what to do about it. That conversation
                  belongs to you and your rheumatologist.
                </p>
              </div>
              <div className="note">
                <h3>Silence is a valid reply.</h3>
                <p>
                  Every question has an obvious way to not answer it. Miss three
                  days and nothing breaks, nothing resets, and nobody is
                  disappointed in you.
                </p>
              </div>
              <div className="note">
                <h3>Compared to you, not to a population.</h3>
                <p>
                  Your HRV is read against your own recent baseline. There is no
                  average person to fall short of.
                </p>
              </div>
              <div className="note">
                <h3>If typing hurts, it rings instead.</h3>
                <p>
                  Text the word <strong>call</strong> and Homie phones you. It
                  also rings if two mornings go unanswered.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The page — the payoff */}
        <section id="page" className="section wrap">
          <p className="label">The page</p>
          <h2 className="h2">
            The thing you actually hand over at the appointment.
          </h2>

          <div className="report">
            <div className="report-head">
              <h3>Ninety-day summary</h3>
              <span className="range">
                Prepared for rheumatology &middot; 21 days shown
              </span>
            </div>

            <div className="chart-key">
              <span>
                <i
                  className="swatch-line"
                  style={{ background: "var(--sky)" }}
                  aria-hidden="true"
                />
                Barometric pressure
              </span>
              <span>
                <i
                  className="swatch-line"
                  style={{ background: "var(--clay)" }}
                  aria-hidden="true"
                />
                Reported symptoms
              </span>
            </div>

            <svg
              className="chart"
              viewBox="0 0 704 220"
              role="img"
              aria-label="Barometric pressure plotted above reported symptom level across 21 days. Each fall in pressure is followed within a day by a rise in symptoms."
            >
              {/* baselines */}
              <line
                x1="12"
                y1="118"
                x2="692"
                y2="118"
                stroke="var(--edge)"
                strokeWidth="1"
              />
              <line
                x1="12"
                y1="208"
                x2="692"
                y2="208"
                stroke="var(--edge)"
                strokeWidth="1"
              />
              <polyline
                points={line(PRESSURE, YP)}
                fill="none"
                stroke="var(--sky)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <polyline
                points={line(PAIN, YS)}
                fill="none"
                stroke="var(--clay)"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {PAIN.map((v, i) =>
                v === 5 ? (
                  <circle
                    key={i}
                    cx={X(i)}
                    cy={YS(v)}
                    r="4"
                    fill="var(--clay)"
                  />
                ) : null,
              )}
            </svg>

            <p className="finding">
              Across the last 21 days, every fall in barometric pressure of more
              than 8 hPa was followed within a day by a reported rise in joint
              symptoms. Medication was taken on 19 of 21 days.
            </p>

            <div className="quotes">
              {QUOTES.map((q) => (
                <blockquote key={q.d} className="quote">
                  <div className="d">{q.d}</div>
                  <div className="t">{q.t}</div>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        {/* Trust */}
        <section id="trust" className="section wrap">
          <p className="label">What Homie never does</p>
          <h2 className="h2">The limits are the point.</h2>

          <div className="never">
            {NEVER.map((n) => (
              <article key={n.h} className="card">
                <h3>{n.h}</h3>
                <p>{n.p}</p>
              </article>
            ))}
          </div>

          {/* The only permitted use of alert red — the 999 path */}
          <div className="emergency">
            <h3>If something is an emergency</h3>
            <p>
              Messages describing chest pain, difficulty breathing, sudden
              severe symptoms or signs of stroke are caught before Homie&rsquo;s
              model ever sees them, and answered with fixed NHS 111 and 999
              guidance. That check is a plain rule, deliberately simple, and it
              runs first.
            </p>
          </div>
        </section>

        {/* Close */}
        <section className="section wrap">
          <h2 className="h2">
            Homie notices, so you have something to say when someone finally
            asks.
          </h2>
          <div className="hero-actions" style={{ marginTop: 28 }}>
            <a className="btn btn-primary" href="#top">
              Start with one message
            </a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap inner">
          <span>Homie &middot; a gentle record between appointments</span>
          <span>Homie is not a medical device and does not give medical advice.</span>
        </div>
      </footer>
    </>
  );
}
