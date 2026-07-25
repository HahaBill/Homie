# Homie — Architecture

Companion to [`PRD.md`](./PRD.md). Where the two disagree, the PRD wins on
*scope* and this document wins on *runtime*.

---

## Runtime split

| Concern | Runs on | Why |
| --- | --- | --- |
| Marketing site, consent flow, link generation API | **Next.js App Router on Vercel** | Already deployed; App Router route handlers are enough for issuing signed links |
| The report page (`/r/:token`) | **Cloudflare Worker + Hono** | Edge-local, single round trip, no cold-start penalty on the demo |
| AI SDK — message composition, reply parsing | **Cloudflare Workers + Sandbox** | Keeps model calls off the request path of the page |
| Database | **Supabase Postgres, RLS on `user_id`** | PRD §8 |
| The thread | **Sendblue** (iMessage/SMS) | PRD §6 calls the thread the hero surface |
| Voice calls | **ElevenLabs Agents over Twilio** | PRD §6 |
| Weather | **Open-Meteo** | Free, no key, barometric pressure |
| Wearable | **WHOOP OAuth2** — `read:recovery`, `read:sleep` only | PRD §7.5, data minimisation |

This amends PRD §9, which put the AI SDK on Vercel functions and Twilio on the
messaging path. Twilio is retained for **voice only**.

---

## The report page

The page is a **document**, not an application. Every decision below follows
from that.

### It is pre-rendered, not client-fetched

```
check-in lands  →  regenerate page HTML  →  store in KV  →  Worker serves it
   (once a day)        (inline SVG)          (per user)      (verify → return)
```

A static SPA shell that reads `?token=` and then fetches its data costs **two
round trips and a loading state**. Pre-rendered HTML costs **one**. For the
primary persona — sixties, tired eyes, mobile data, possibly in a waiting room
— that difference is the whole experience.

Because a check-in arrives at most once a day, regenerating on write is cheap
and the page is always warm.

### Charts are server-generated inline SVG

No charting library. No canvas. No client JS.

- 90 daily points is a handful of kilobytes of path data
- Prints at **vector quality** — a rasterised canvas chart prints blurry, and
  this artifact exists to be printed and handed over
- Renders with JavaScript disabled
- Nothing to hydrate, nothing to fail on stage

Pressure and symptom lines share one plot with a common date axis, per PRD §5.

### No real-time, no streaming

The underlying data changes **once per day**. There is no stream to subscribe
to. Live-updating charts would add transport, client JS, and battery cost to
animate a line that moves daily — and would import precisely the
quantified-self framing the PRD rejects (§3, §14).

---

## Caching — read this before touching headers

Health data is **special-category data** under UK GDPR Art 9. Cache rules are a
safety gate, not an optimisation choice.

| Asset | Cache policy |
| --- | --- |
| Shell: CSS, fonts, logo | `public, max-age=31536000, immutable` — edge-cached globally |
| **Any response containing patient data** | **`private, no-store`** |

A shared-cache hit that serves one patient's page to another is a reportable
breach. Patient data never enters a shared cache, at any layer, ever.

## Link security

- Links are **HMAC-signed and expiring**. The token carries `user_id` + `exp`;
  the Worker verifies the signature before touching storage.
- A token is a bearer credential — treat a leaked link as a leaked record.
  Short expiry, revocable, and every issue/redeem is written to `audit_log`.
- `STOP`, `DELETE`, `MY DATA` invalidate outstanding tokens (PRD §7.3).

## Framework note

Hono is **not** slow on Workers — it is among the fastest routers available on
that runtime, designed for it. Next.js on Workers is the heavier option. Hono
handles the report route; Next.js stays on Vercel for the marketing site and
link issuance.

---

## What this buys at the demo

The page loads in one round trip with no spinner, works if the venue wifi is
poor, and prints from the phone without a layout surprise. There is no loading
state that can fail while a judge is watching.
