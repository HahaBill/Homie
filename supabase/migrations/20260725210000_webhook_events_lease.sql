-- webhook_events as a lease rather than a tombstone.
--
-- The original guard (20260725191226 / 20260725191500) deduped on a bare
-- insert: the key landing suppressed every later retry, whether or not the
-- pipeline that claimed it ever finished. A delivery that claimed and then
-- died mid-flight — model timeout, isolate eviction, Supabase blip — was
-- therefore dropped permanently, with Sendblue's retries silently rejected.
--
-- A claim now starts as 'processing' and is promoted to 'completed' only once
-- the worker has finished the delivery. Retries of a completed event are still
-- refused; retries of a lease that has gone stale are allowed to take it over
-- (see CLAIM_LEASE_MS in worker/src/supabase.ts).

alter table webhook_events
  add column if not exists status text not null default 'processing',
  add column if not exists claimed_at timestamptz not null default now();

-- Rows written under the old insert-only semantics were, by definition, never
-- marked finished. Treat them as completed so this migration does not suddenly
-- reopen historical deliveries for reprocessing.
update webhook_events set status = 'completed' where status <> 'completed';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'webhook_events_status_check'
  ) then
    alter table webhook_events
      add constraint webhook_events_status_check
      check (status in ('processing', 'completed'));
  end if;
end $$;

-- Reclaim scans look up stale leases by (status, claimed_at); the table is
-- tiny today but this keeps the guard cheap on the hot inbound path.
create index if not exists webhook_events_stale_claims_idx
  on webhook_events (status, claimed_at)
  where status = 'processing';
