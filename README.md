# Homie

> A gentle check-in. When you need it.

**Live:** https://meet-homie.vercel.app

Landing page for **Homie** — a wellbeing companion that shows up quietly
(phone, watch, glasses) and asks one honest question. Built with Next.js and
the **Homie Design System v2 (Core colorway)**.

## Design system

The visual language is transcribed directly from
`homie-design-system/project/Homie Design System v2.dc.html` (a Claude Design
handoff bundle kept in this repo for reference):

| Token | Value | Role |
| --- | --- | --- |
| Warm Cream | `#FFF4EC` | Canvas — ~70% of every screen |
| Terracotta Clay | `#D47A5A` | Primary action, wordmark — never > ~8% of a screen |
| Soft Peach | `#F6DCCB` | Feature panels, chips, selected states |
| Charcoal | `#2B2B2B` | Body text, watch & glasses surfaces |
| Muted Beige | `#E8DCC9` | Dividers, disabled, quiet fills |

Type: **Fredoka** (display), **Nunito** (interface), **JetBrains Mono**
(labels / hex / section numbers), all loaded via `next/font`.

Full tokens (radius, elevation, motion, mood tints) live in
[`app/globals.css`](app/globals.css).

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

Zero-config on [Vercel](https://vercel.com) — framework preset **Next.js** is
auto-detected. Push to the connected repo and Vercel builds and deploys.

## Stack

- Next.js 14 (App Router) · React 18 · TypeScript
- No runtime dependencies beyond React/Next — the page is static and
  self-contained.
