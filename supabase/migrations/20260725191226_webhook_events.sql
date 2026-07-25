-- Webhook replay guard, required by the worker's hardened inbound pipeline
-- (commit 6b75733). Sendblue retries deliveries, so the worker claims each
-- one here (plain insert; primary-key conflict = duplicate, skip) before
-- writing anything else. Append-only and tiny. Service-role only: RLS
-- enabled with no policies. Mirrors the addition made to
-- worker/supabase/migrations/0001_init.sql after the root copy was taken.

create table if not exists webhook_events (
  dedupe_key text primary key,
  received_at timestamptz not null default now()
);

alter table webhook_events enable row level security;
