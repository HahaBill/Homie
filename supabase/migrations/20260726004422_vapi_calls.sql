-- Vapi voice calls: the call surface from docs/PRD.md §6, persisted.
--
-- Vapi posts an end-of-call report per call; the worker matches it to a
-- patient by the customer's phone number (the same E.164 key users.phone
-- already carries, so a call from a number on record links itself) and
-- stores the transcript alongside it.
--
-- user_id is nullable on purpose. A call from an unknown number is still
-- worth recording, but it must NOT mint a patient — creating a users row
-- from an arbitrary inbound caller would fabricate a patient nobody
-- consented to being. Unlinked rows keep the number and nothing else.
--
-- A transcript is special-category health data under UK GDPR Art 9, so it
-- gets the same posture as every other table here: RLS on, no policies,
-- service-role only, and ON DELETE CASCADE so PRD §7.3's DELETE right
-- actually erases the calls too.

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  vapi_call_id text not null unique,
  user_id uuid references users (id) on delete cascade,
  phone text,
  direction text,
  status text,
  ended_reason text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  cost numeric,
  summary text,
  transcript text,
  recording_url text,
  -- The full report, kept so a schema gap never loses data we already had.
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists calls_user_idx on calls (user_id, started_at desc);
create index if not exists calls_phone_idx on calls (phone);

alter table calls enable row level security;

-- Scaffolding for a future user-scoped JWT client, mirroring the other
-- tables. Grants nothing today: no role holds a grant on this table.
create policy "calls_self" on calls for select
  to authenticated using ((select auth.uid()) = user_id);
