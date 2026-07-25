-- Advisor-driven hardening, run immediately after the first two migrations.
--
-- 1. audit_log_block_mutation had a mutable search_path (lint 0011).
-- 2. The three self-select policies from 0001 re-evaluated auth.uid() per
--    row (lint 0003) and lacked a TO clause. Recreated with
--    (select auth.uid()) and `to authenticated`, matching 0002's pattern.
-- 3. rls_auto_enable() is the platform's RLS-on-new-tables event trigger.
--    Event-trigger functions cannot be invoked directly, but revoking
--    EXECUTE from client roles silences lints 0028/0029 and costs nothing.

alter function public.audit_log_block_mutation() set search_path = '';

do $$
begin
  revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
exception
  when insufficient_privilege or undefined_function then
    raise log 'security_hardening: skipped rls_auto_enable revoke';
end;
$$;

drop policy if exists "users_self" on users;
create policy "users_self" on users for select
  to authenticated using ((select auth.uid()) = id);

drop policy if exists "checkins_self" on checkins;
create policy "checkins_self" on checkins for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "observations_self" on observations;
create policy "observations_self" on observations for select
  to authenticated using (
    checkin_id in (select id from checkins where user_id = (select auth.uid()))
  );
