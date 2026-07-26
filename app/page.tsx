/* Homie — landing + web app
   Implemented from "Homie Web App.dc.html" (cream / terracotta colorway).
   The app section's thread goes live for signed-in visitors — see
   AppShowcase.tsx and app/api/thread/route.ts. */


import AppShowcase from "./AppShowcase";
import SiteHeader from "@/components/SiteHeader";

const LOGO = "/homie-logo.jpg";

export default function Home() {
  return (
    <>
      <SiteHeader />

      <main>
        {/* Hero ------------------------------------------------------------ */}
        <section className="wrap hero">
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <h1>
              someone who <span>notices.</span>
            </h1>
            <p className="lede" style={{ color: "var(--cocoa)", fontSize: 22 }}>
              Homie is a companion for living with lupus or rheumatoid
              arthritis. It reads your Whoop or Apple Watch, keeps track of
              what&apos;s normal <em>for you</em>, and gets in touch first when
              something shifts.
            </p>
            <p className="sub" style={{ color: "var(--faint)", fontSize: 19 }}>
              It notices. It doesn&apos;t advise, diagnose, or change a dose —
              and when something looks wrong it says so plainly and points you
              at a person.
            </p>
            <div className="hero-actions">
              <a className="btn btn-primary" href="/sign-in">
                start with a text
              </a>
              <a className="btn btn-ghost" href="#app">
                see a week of it
              </a>
            </div>
          </div>
          <div className="hero-visual">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO} alt="The Homie face" />
          </div>
        </section>

        {/* Channels --------------------------------------------------------- */}
        <section className="wrap channels" aria-label="How Homie reaches you">
          <div className="channel">
            <span className="mono">IMESSAGE</span>
            <h3>a text, most days</h3>
            <p>
              One message in the morning. Often none at all. Reply in your own
              words, or don&apos;t.
            </p>
          </div>
          <div className="channel">
            <span className="mono">PHONE CALL</span>
            <h3>a call, rarely</h3>
            <p>
              Only when something has shifted for a few days running — and it
              tells you why it rang.
            </p>
          </div>
          <div className="channel">
            <span className="mono">RAY-BAN DISPLAY</span>
            <h3>one line, glanceable</h3>
            <p>
              A nudge you can read in two seconds without stopping what
              you&apos;re doing.
            </p>
          </div>
        </section>

        {/* The app ----------------------------------------------------------- */}
        <section id="app" className="app-band">
          <div className="wrap">
            <div className="app-head">
              <span className="mono">THE APP</span>
              <span className="note">five screens, one idea each</span>
            </div>
            <AppShowcase />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="inner">
          <span>Homie · a companion, not a clinician</span>
          <span className="tagline">it notices. it asks. that&apos;s all.</span>
        </div>
      </footer>
    </>
  );
}
