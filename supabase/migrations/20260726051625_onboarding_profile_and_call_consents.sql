-- Progressive onboarding profile and separate communication consents.
--
-- Keep volatile health-intake details in JSON while the product is still
-- shaping itself. Stable messaging gates get first-class timestamps so code
-- never has to inspect a blob before placing a call or sending a text.

alter table users
  add column if not exists onboarding_profile jsonb not null default '{}'::jsonb,
  add column if not exists onboarded_at timestamptz,
  add column if not exists text_consent_at timestamptz,
  add column if not exists call_consent_at timestamptz,
  add column if not exists transcript_consent_at timestamptz;

create index if not exists users_onboarded_at_idx
  on users (onboarded_at)
  where onboarded_at is not null;

create index if not exists users_call_consent_idx
  on users (call_consent_at)
  where call_consent_at is not null;
