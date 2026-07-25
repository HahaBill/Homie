-- Homie — completes the docs/PRD.md §8 schema.
--
-- 20260725182152_init.sql (verbatim copy of worker/supabase/migrations/
-- 0001_init.sql) created users, checkins, observations, audit_log. This
-- migration adds the remaining three tables — medications, readings,
-- weather — and hardens audit_log to be genuinely insert-only.
--
-- Access model, same as 0001: server processes (the Cloudflare worker and
-- the Next.js route handlers) connect with the service-role key and bypass
-- RLS. anon/authenticated get no grants — on projects created after the
-- 2026 Data API change, new tables are not auto-exposed, which is exactly
-- the posture we want for special-category health data. The self-select
-- policies below are scaffolding for a future user-scoped JWT client and
-- grant no access until such grants/JWTs exist.

-- Medication schedule, referenced when composing the morning message.
create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  dose text,
  schedule text,
  created_at timestamptz not null default now()
);
create index if not exists medications_user_idx on medications (user_id);

-- Wearable readings (WHOOP: read:recovery + read:sleep only — PRD §7.5).
create table if not exists readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  date date not null,
  source text not null default 'whoop',
  hrv numeric,
  resting_hr numeric,
  sleep_minutes integer,
  sleep_quality numeric,
  created_at timestamptz not null default now(),
  unique (user_id, date, source)
);
create index if not exists readings_user_date_idx on readings (user_id, date desc);

-- Daily barometric snapshot per user (Open-Meteo, PRD §9).
create table if not exists weather (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  date date not null,
  pressure_hpa numeric,
  pressure_delta_24h numeric,
  temp_c numeric,
  humidity numeric,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists weather_user_date_idx on weather (user_id, date desc);

alter table medications enable row level security;
alter table readings enable row level security;
alter table weather enable row level security;

-- Future user-scoped JWT read access, mirroring 0001's pattern.
create policy "medications_self" on medications for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "readings_self" on readings for select
  to authenticated using ((select auth.uid()) = user_id);
create policy "weather_self" on weather for select
  to authenticated using ((select auth.uid()) = user_id);

-- audit_log is insert-only (PRD §8). RLS already denies non-service roles;
-- this trigger makes the guarantee hold even for the service role, which
-- bypasses RLS but not triggers.
create or replace function audit_log_block_mutation()
returns trigger
language plpgsql
security invoker
as $$
begin
  raise exception 'audit_log is insert-only';
end;
$$;

create trigger audit_log_insert_only
  before update or delete on audit_log
  for each statement
  execute function audit_log_block_mutation();
