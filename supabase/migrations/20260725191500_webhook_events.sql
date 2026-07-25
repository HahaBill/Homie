-- Webhook replay guard for the worker's Sendblue inbound path. The applied
-- init migration is a verbatim copy of the worker's schema from before this
-- table existed (worker commit 6b75733 added the dedupe claim), so it lands
-- here as its own migration.
--
-- Sendblue retries deliveries: the worker claims each one (plain insert;
-- primary-key conflict = duplicate, skip) before writing anything else, so a
-- retry can never double-book a check-in or double-reply. Append-only and
-- tiny — prune later if it ever matters. Service-role only: RLS enabled, no
-- policies, matching the posture of the other tables.
create table if not exists webhook_events (
  dedupe_key text primary key,
  received_at timestamptz not null default now()
);

alter table webhook_events enable row level security;
