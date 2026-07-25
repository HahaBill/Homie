import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — Homie",
  description:
    "Homie texts you a link to your page. There is no password to remember.",
};

export default function SignIn() {
  return (
    <>
      <header className="site-header">
        <div className="inner">
          <a href="/" className="wordmark" aria-label="Homie, home">
            Homie
          </a>
          <div className="header-actions">
            <a className="btn btn-quiet btn-sm" href="/">
              Back
            </a>
          </div>
        </div>
      </header>

      <main className="auth-wrap">
        <div className="auth-card">
          <h1>Get to your page</h1>
          <p className="lede" style={{ fontSize: 18 }}>
            Homie texts you a link. There is no password to remember and nothing
            to install.
          </p>

          {/* Not wired to a backend yet — deliberately collects no password. */}
          <form action="/sign-in" method="get">
            <label className="field" htmlFor="phone">
              <span>Your mobile number</span>
              <input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="07700 900000"
                aria-describedby="phone-help"
              />
            </label>

            <p id="phone-help" className="auth-note">
              We use your number to find your record and to send the link. It is
              never shared, and texting <strong>STOP</strong>,{" "}
              <strong>DELETE</strong> or <strong>MY DATA</strong> works at any
              time.
            </p>

            <div style={{ marginTop: 24 }}>
              <button className="btn btn-primary" type="submit" disabled>
                Text me a link
              </button>
            </div>
          </form>

          <p className="auth-note" style={{ marginTop: 24 }}>
            Sign-in is not live yet. Homie is in build for the Consumer Health
            Hackathon, and the text loop comes first.
          </p>
        </div>

        <p className="auth-note" style={{ textAlign: "center", marginTop: 24 }}>
          You do not need an account to use Homie. The thread works on its own.
        </p>
      </main>
    </>
  );
}
