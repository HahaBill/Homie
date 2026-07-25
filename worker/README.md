# Homie worker

Cloudflare Worker (Hono) that owns the Sendblue iMessage thread — the one
piece of `docs/ARCHITECTURE.md`'s backend built so far. Companion to the
Next.js app in `app/`, which stays on Vercel.

## Scope of this slice

Built:
- Receive an iMessage via Sendblue's webhook, verify it, run it past the
  safety gates, structure it with the OpenAI Agents SDK, persist it, reply.
- Send a message via Sendblue (`channels/sendblue.ts`).
- Supabase Postgres for storage (`users`, `checkins`, `observations`,
  `audit_log`, `webhook_events` — schema lives in the repo-root
  `supabase/migrations/`, shared with the Next.js routes).
- Webhook replay guard: every delivery is claimed by dedupe key in
  `webhook_events` before any other write, so a Sendblue retry can't
  double-book a check-in or double-reply.
- The two safety gates `docs/PRD.md` §7 calls non-negotiable: a hard-coded
  red-flag bypass (`src/safety.ts`) and `STOP` / `DELETE` / `MY DATA`.

## Performance notes

The model call is the long pole (~1–2.5s measured against gpt-5.4-mini), so
the inbound pipeline is ordered around it: the call starts at t=0 and all
Supabase round trips (dedupe claim, user upsert, check-in resolution) run
underneath it; the reply is sent before the observation insert completes.
The red-flag bypass has zero dependencies — it fires even if Supabase and
OpenAI are both down. The bundle imports `@openai/agents-core` +
`@openai/agents-openai` directly rather than the `@openai/agents` facade
(whose entrypoint drags in the unused realtime stack un-tree-shakeably),
which roughly halves upload size; wrangler minification is on for the same
cold-start reason.

Deliberately not built yet (see `docs/PRD.md` / `docs/ARCHITECTURE.md`):
- **Durable Objects.** The PRD's original design used a per-patient DO for
  contextual/session state (see `proxima`'s `patient-do.ts` for that pattern).
  This slice uses Supabase instead, on purpose — a DO can be reintroduced
  later purely as a context/session cache in front of Supabase, without
  touching the Sendblue adapter or the webhook route.
- The morning-message composer (weather, wearable, medication schedule),
  WHOOP, ElevenLabs voice, the report page, and the consent-capture flow
  (`app/sign-in` is UI-only today — see the disabled submit button there).
  A user is auto-created on first inbound text with `consent_at` unset; that
  is **not** a substitute for PRD §7.4's explicit-consent requirement before
  a real (non-synthetic) person is messaged.
- Conversation memory. Each reply is parsed in isolation — no thread history
  is sent to OpenAI yet.

## Environment variables

Non-secret, committed in `wrangler.jsonc`'s `vars`: `OPENAI_MODEL`,
`SENDBLUE_FROM_NUMBER`, `SKIP_SENDBLUE_VERIFY`.

Secrets — copy `.dev.vars.example` to `.dev.vars` for local dev (gitignored),
and `wrangler secret put <NAME>` for production:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — this worker bypasses RLS as a trusted backend |
| `SENDBLUE_API_KEY_ID` / `SENDBLUE_API_KEY_SECRET` | Sendblue API auth |
| `SENDBLUE_WEBHOOK_SECRET` | Account-level "global" signing secret, checked against the `sb-signing-secret` header |
| `OPENAI_API_KEY` | Reply structuring |
| `WORKER_ADMIN_TOKEN` | Bearer token for `POST /send-test`. Leave unset to disable the route entirely |

## Local dev

```bash
npm install
npm run typecheck
npm run dev        # wrangler dev, http://localhost:8787
```

Webhooks won't reach localhost — deploy and use `npm run tail` to watch a
real Sendblue delivery.

## Database

The schema is the repo-root `supabase/` project (`supabase db push`, or the
SQL editor), shared with the Next.js API routes — this directory deliberately
has no copy of its own. The worker needs `webhook_events`
(`20260725191500_webhook_events.sql`) on top of the applied init schema.

## Deploy

```bash
npm run deploy
```

Then point Sendblue's inbound webhook at:

```
https://<your-worker-subdomain>.workers.dev/webhooks/sendblue
```

## CI/CD

`.github/workflows/deploy-worker.yml` deploys automatically on every push to
`main` that touches `worker/**` (typecheck, then `wrangler deploy`).

Repo secrets required (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → create one scoped to `Workers Scripts:Edit` (+ `Account Settings:Read`) for this account |
| `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` |

The workflow deliberately does **not** sync Worker secrets
(`SUPABASE_URL`, `SENDBLUE_*`, `OPENAI_API_KEY`, `WORKER_ADMIN_TOKEN`) from
GitHub — a secret added to Cloudflare via `wrangler secret put` but not (yet)
mirrored as a GitHub secret would otherwise get silently blanked on the next
deploy. Set those once, directly against Cloudflare:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SENDBLUE_API_KEY_ID
npx wrangler secret put SENDBLUE_API_KEY_SECRET
npx wrangler secret put SENDBLUE_WEBHOOK_SECRET
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put WORKER_ADMIN_TOKEN
```

They persist across deploys — `wrangler deploy` (and the CI workflow) never
touches them.

## Smoke-testing the send path

```bash
curl -X POST https://<worker>/send-test \
  -H "Authorization: Bearer $WORKER_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to": "+447700900000", "text": "Homie worker is live."}'
```
