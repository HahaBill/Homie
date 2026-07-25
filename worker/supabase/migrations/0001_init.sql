-- Homie worker — initial schema for the Sendblue slice only.
--
-- Subset of docs/PRD.md §8: users, checkins, observations, audit_log.
-- medications / readings / weather are not created here — nothing in this
-- worker touches them yet (no morning-message composer, no wearable, no
-- weather integration). Add them in a later migration when that lands.

create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  timezone text not null default 'Europe/London',
  consent_at timestamptz,
  consent_version text,
  baseline_hrv numeric,
  status text not null default 'active' check (status in ('active', 'stopped', 'deleted')),
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  message_text text,
  replied_at timestamptz,
  reply_text text,
  created_at timestamptz not null default now()
);
create index if not exists checkins_user_open_idx on checkins (user_id, sent_at desc) where replied_at is null;

create table if not exists observations (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references checkins (id) on delete cascade,
  pain_level smallint check (pain_level between 1 and 5),
  areas text[] not null default '{}',
  meds_taken boolean,
  confidence numeric check (confidence >= 0 and confidence <= 1),
  note text,
  created_at timestamptz not null default now()
);

-- Insert-only — see docs/PRD.md §8. No update/delete policy is defined for
-- any role, and application code (src/supabase.ts) never issues one.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users (id) on delete set null,
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Webhook replay guard: Sendblue retries deliveries, so the worker claims
-- each one here (plain insert; primary-key conflict = duplicate, skip) before
-- writing anything else. Append-only and tiny — prune later if it ever
-- matters. Service-role only: RLS enabled below with no policies.
create table if not exists webhook_events (
  dedupe_key text primary key,
  received_at timestamptz not null default now()
);

alter table users enable row level security;
alter table webhook_events enable row level security;
alter table checkins enable row level security;
alter table observations enable row level security;
alter table audit_log enable row level security;

-- The worker connects with the service-role key and bypasses RLS entirely —
-- these policies are scaffolding for a future direct client (e.g. the report
-- page) reading with a Supabase Auth JWT whose auth.uid() equals users.id.
-- Nothing issues user-scoped JWTs yet, so these policies grant no access
-- today; they're here so the schema doesn't need revisiting when that lands.
create policy "users_self" on users for select using (auth.uid() = id);
create policy "checkins_self" on checkins for select using (auth.uid() = user_id);
create policy "observations_self" on observations for select using (
  checkin_id in (select id from checkins where user_id = auth.uid())
);
-- audit_log: no select policy — insert-only from the service role, not
-- readable by end users even once user-scoped auth exists.
