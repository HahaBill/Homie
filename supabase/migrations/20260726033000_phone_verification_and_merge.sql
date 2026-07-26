-- Phone as the identity that joins every surface.
--
-- The thread, the calls and the texts all key on users.phone, but the web
-- signs in with a Clerk email, and Clerk's phone sign-in is a paid feature.
-- The result on live data was five user rows where not one had both a phone
-- and an email: three phone-only rows carrying the texts and the Vapi
-- transcripts, two email-only rows carrying the web sessions. Signing in
-- showed a record that was real but partial, and the calls were unreachable.
--
-- So Homie verifies the number itself, over the channel it already owns.

-- ---------------------------------------------------------------------------
-- 1. Verification codes
-- ---------------------------------------------------------------------------
-- The code is stored as a SHA-256 hash, never in the clear: this table is a
-- password-equivalent for the duration of its life, and a leaked row should
-- not hand over an account. One live challenge per user — starting a new one
-- replaces the old, so a code read off a stolen phone cannot be banked.
create table if not exists phone_verifications (
  user_id uuid primary key references users (id) on delete cascade,
  phone text not null,
  code_hash text not null,
  attempts smallint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table phone_verifications enable row level security;
-- Service-role only, like every other table here: no policies on purpose.

create index if not exists phone_verifications_expiry_idx
  on phone_verifications (expires_at);

-- ---------------------------------------------------------------------------
-- 2. Merging two rows for the same person
-- ---------------------------------------------------------------------------
-- Verifying a number that already belongs to a texting row cannot simply set
-- users.phone — users_phone_key would reject it. The rows have to be folded
-- together, and that has to be atomic: a half-merged patient is worse than an
-- unmerged one.
--
-- Three child tables carry unique constraints that a plain re-parent would
-- collide on, so their colliding source rows are dropped first. In each case
-- the target's row is the one kept, and the loss is a duplicate rather than
-- information:
--   checkins  (user_id, utc date) where message_text is not null
--             — both rows got a morning message on the same day
--   weather   (user_id, date)     — same day's weather, fetched twice
--   readings  (user_id, date, source) — same wearable reading, imported twice
--
-- audit_log is deliberately re-parented rather than pruned: it is insert-only
-- (PRD §8) and its history has to survive the merge intact.
create or replace function merge_user_into(source_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s_phone text; s_email text; s_name text; s_hrv numeric;
  s_consent timestamptz; s_consent_version text; s_status text;
begin
  if source_id = target_id then
    return;
  end if;

  -- Captured before anything moves: the source's phone cannot be written to
  -- the target while the source row still holds it (users_phone_key), so the
  -- values are read here, the row deleted below, and only then written.
  select phone, email, name, baseline_hrv, consent_at, consent_version, status
    into s_phone, s_email, s_name, s_hrv, s_consent, s_consent_version, s_status
  from users where id = source_id;

  if not found then
    raise exception 'merge_user_into: source row % not found', source_id;
  end if;
  if not exists (select 1 from users where id = target_id) then
    raise exception 'merge_user_into: target row % not found', target_id;
  end if;

  -- Drop source rows that would violate a unique constraint on arrival.
  delete from checkins s
   where s.user_id = source_id
     and s.message_text is not null
     and exists (
       select 1 from checkins t
        where t.user_id = target_id
          and t.message_text is not null
          and (t.sent_at at time zone 'utc')::date = (s.sent_at at time zone 'utc')::date
     );

  delete from weather s
   where s.user_id = source_id
     and exists (
       select 1 from weather t where t.user_id = target_id and t.date = s.date
     );

  delete from readings s
   where s.user_id = source_id
     and exists (
       select 1 from readings t
        where t.user_id = target_id and t.date = s.date and t.source = s.source
     );

  -- Re-parent everything that remains.
  update checkins    set user_id = target_id where user_id = source_id;
  update weather     set user_id = target_id where user_id = source_id;
  update readings    set user_id = target_id where user_id = source_id;
  update medications set user_id = target_id where user_id = source_id;
  update calls       set user_id = target_id where user_id = source_id;
  update audit_log   set user_id = target_id where user_id = source_id;

  -- The source must go before its phone can land on the target: the unique
  -- index does not care that the row is on its way out. Its children are
  -- already re-parented above, so ON DELETE SET NULL has nothing left to null.
  delete from users where id = source_id;

  -- Fill the target's gaps from the source, never overwrite what it has.
  -- Consent is the exception that matters: it is a decision with a timestamp,
  -- so the EARLIER one is kept, and least() ignoring nulls means a row that
  -- never consented cannot inherit consent it was not given. Stopped anywhere
  -- means stopped — an opt-out must survive a merge.
  update users t set
    phone           = coalesce(t.phone, s_phone),
    email           = coalesce(t.email, s_email),
    name            = coalesce(t.name, s_name),
    baseline_hrv    = coalesce(t.baseline_hrv, s_hrv),
    consent_at      = least(t.consent_at, s_consent),
    consent_version = coalesce(t.consent_version, s_consent_version),
    status          = case when t.status = 'stopped' or s_status = 'stopped'
                           then 'stopped' else t.status end
  where t.id = target_id;
end;
$$;

comment on function merge_user_into(uuid, uuid) is
  'Folds source user row into target: re-parents children, drops duplicates that would break unique constraints, keeps the earlier consent and any stopped status, then deletes source. Atomic.';
