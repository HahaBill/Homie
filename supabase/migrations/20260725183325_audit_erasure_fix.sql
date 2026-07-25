-- DELETE (PRD §7.3) must actually work. users.id FKs into audit_log with
-- ON DELETE SET NULL; the statement-level insert-only trigger blocked that
-- cascade, which made user erasure impossible — caught by an end-to-end
-- test deleting a synthetic user. Replace with a row-level trigger that
-- permits exactly one mutation: the FK's anonymising SET NULL of user_id.
-- Severing the link on erasure is also the better GDPR posture.

drop trigger if exists audit_log_insert_only on audit_log;

create or replace function audit_log_block_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.user_id is null and old.user_id is not null
     and new.id = old.id
     and new.event = old.event
     and new.payload = old.payload
     and new.created_at = old.created_at then
    return new; -- FK ON DELETE SET NULL during user erasure
  end if;
  raise exception 'audit_log is insert-only';
end;
$$;

create trigger audit_log_insert_only
  before update or delete on audit_log
  for each row
  execute function audit_log_block_mutation();
