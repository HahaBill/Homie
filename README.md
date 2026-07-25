# Homie

> Homie checks in, so you don't have to keep track.

**Live:** https://meet-homie.vercel.app

Homie texts you every morning, notices the pattern between the weather, your
sleep and how you feel, and turns ninety days of it into one page you hand your
consultant. No app, no account — it arrives as a text message.

Built for the Consumer Health Hackathon, Encode Hub London.

## Documents

| Doc | What it covers |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Source of truth for **scope**. Problem, persona, non-goals, safety gates, data model, build order, demo script |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Source of truth for **runtime**. Where each piece runs, why the report page is pre-rendered, caching rules |

## Design system — warm apricot v2

Transcribed from PRD §13. These are constraints, not suggestions.

| Token | Value | Role |
| --- | --- | --- |
| `--oat` | `#FBF4EA` | Page background |
| `--milk` | `#FFFCF7` | Card surface |
| `--edge` | `#EDE1D3` | Borders — the only separator, since there are no shadows |
| `--apricot` | `#E8823F` | **One element per screen.** Nothing else |
| `--clay` | `#D2643C` | Her voice in the thread, symptom line |
| `--ink` / `--cocoa` / `--mushroom` | `#2E2622` / `#5C4C43` / `#8C7B70` | Text, descending emphasis |
| `--alert` | `#B4291F` | **999 path only** |

- **Fraunces 600** for the name and the one feeling line per screen
- **Nunito Sans, 18px minimum**, tabular figures, for everything else
- 20px cards, 22px bubbles, 52px pill buttons and tap targets
- No gradients, no glass, no shadows, no emoji, no exclamation marks

The 18px floor and 52px targets come from the persona in PRD §3 — a woman in
her sixties whose hands hurt and whose eyes are tired. They are accessibility
requirements, not taste.

## The chart is inline SVG

The symptom and pressure lines are server-rendered SVG with no charting
library and no client JavaScript. It renders with JS disabled and prints at
vector quality — which matters, because the page exists to be printed and
handed to a rheumatologist. See `docs/ARCHITECTURE.md`.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## Build

```bash
npm run build
npm start
```

## Deploy

Connected to Vercel — pushes to `main` deploy to production automatically, and
pull requests get preview URLs.

## Stack

- Next.js 14 (App Router) · React 18 · TypeScript
- No runtime dependencies beyond React and Next. The page is static and
  self-contained.
