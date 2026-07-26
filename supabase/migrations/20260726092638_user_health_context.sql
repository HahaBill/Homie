-- Typed onboarding fields for deterministic call personalization.
-- onboarding_profile remains the lossless source document; these columns are
-- the bounded, queryable projection used by the app and Worker.

alter table public.users
  add column if not exists call_phone text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists height_cm numeric,
  add column if not exists weight_kg numeric,
  add column if not exists primary_condition text,
  add column if not exists conditions text[] not null default '{}',
  add column if not exists symptoms text[] not null default '{}',
  add column if not exists baseline_feeling smallint,
  add column if not exists bad_day text,
  add column if not exists remember text,
  add column if not exists care_contact text,
  add column if not exists country text;

alter table public.users
  add constraint users_call_phone_e164
    check (call_phone is null or call_phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint users_height_cm_range
    check (height_cm is null or height_cm between 60 and 260),
  add constraint users_weight_kg_range
    check (weight_kg is null or weight_kg between 20 and 350),
  add constraint users_baseline_feeling_range
    check (baseline_feeling is null or baseline_feeling between 1 and 5);

create unique index if not exists users_call_phone_unique
  on public.users (call_phone)
  where call_phone is not null;

update public.users
set
  call_phone = coalesce(call_phone, nullif(onboarding_profile->>'call_phone', '')),
  date_of_birth = coalesce(
    date_of_birth,
    case
      when pg_input_is_valid(onboarding_profile->>'date_of_birth', 'date')
        then (onboarding_profile->>'date_of_birth')::date
      else null
    end
  ),
  gender = coalesce(gender, nullif(onboarding_profile->>'gender', '')),
  height_cm = coalesce(
    height_cm,
    case
      when pg_input_is_valid(onboarding_profile->>'height_cm', 'numeric')
        then (onboarding_profile->>'height_cm')::numeric
      else null
    end
  ),
  weight_kg = coalesce(
    weight_kg,
    case
      when pg_input_is_valid(onboarding_profile->>'weight_kg', 'numeric')
        then (onboarding_profile->>'weight_kg')::numeric
      else null
    end
  ),
  primary_condition = coalesce(
    primary_condition,
    nullif(onboarding_profile->>'primary_condition', '')
  ),
  conditions = case
    when cardinality(conditions) > 0 then conditions
    when jsonb_typeof(onboarding_profile->'conditions') = 'array'
      then array(select jsonb_array_elements_text(onboarding_profile->'conditions'))
    else '{}'
  end,
  symptoms = case
    when cardinality(symptoms) > 0 then symptoms
    when jsonb_typeof(onboarding_profile->'symptoms') = 'array'
      then array(select jsonb_array_elements_text(onboarding_profile->'symptoms'))
    else '{}'
  end,
  baseline_feeling = coalesce(
    baseline_feeling,
    case
      when pg_input_is_valid(onboarding_profile->>'baseline_feeling', 'smallint')
        then (onboarding_profile->>'baseline_feeling')::smallint
      else null
    end
  ),
  bad_day = coalesce(bad_day, nullif(onboarding_profile->>'bad_day', '')),
  remember = coalesce(remember, nullif(onboarding_profile->>'remember', '')),
  care_contact = coalesce(care_contact, nullif(onboarding_profile->>'care_contact', '')),
  country = coalesce(country, nullif(onboarding_profile->>'country', ''))
where onboarding_profile <> '{}'::jsonb;

-- A call number is the latest number explicitly supplied for calls. Promote
-- it to the canonical phone only when no other account owns that number.
update public.users as candidate
set phone = candidate.call_phone
where candidate.call_phone is not null
  and candidate.phone is distinct from candidate.call_phone
  and not exists (
    select 1
    from public.users as other
    where other.id <> candidate.id
      and other.phone = candidate.call_phone
  );

-- Existing calls follow the canonical phone owner first, then the explicit
-- call phone. Unknown callers remain recorded with user_id null.
update public.calls as call
set user_id = owner.id
from public.users as owner
where call.phone = owner.phone
  and call.user_id is distinct from owner.id;

update public.calls as call
set user_id = owner.id
from public.users as owner
where call.phone = owner.call_phone
  and call.user_id is distinct from owner.id
  and not exists (
    select 1 from public.users as canonical where canonical.phone = call.phone
  );

create or replace function public.link_call_user_by_phone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  matched_user_id uuid;
begin
  if new.phone is null then
    return new;
  end if;

  select id into matched_user_id
  from public.users
  where phone = new.phone
  limit 1;

  if matched_user_id is null then
    select id into matched_user_id
    from public.users
    where call_phone = new.phone
    limit 1;
  end if;

  if matched_user_id is not null then
    new.user_id := matched_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists calls_link_user_by_phone on public.calls;
create trigger calls_link_user_by_phone
before insert or update of phone on public.calls
for each row execute function public.link_call_user_by_phone();

comment on column public.users.conditions is
  'User-reported conditions from onboarding. Context to confirm, never diagnoses.';
comment on column public.users.symptoms is
  'User-reported symptoms from onboarding. Context to confirm, never diagnoses.';
