-- Unify check-ins across channels. A Vapi call is a check-in too, not a
-- separate concept living only in its own table that nothing else counts —
-- checkins gets a channel column so a call can create a real row there
-- (reply_text carries its recap, exactly like a text reply does), and calls
-- gets a checkin_id back to it so the report page can still reach the full
-- transcript/duration for a "see the whole call" detail view, without those
-- columns bloating checkins itself.
--
-- Every downstream reader that already trusts checkins as the source of
-- truth — the report page's "X check-ins" line, getDataSummary's MY DATA
-- reply — picks up calls for free the moment storeVapiCall starts writing
-- here. No special-casing needed anywhere that already reads this table.

alter table checkins
  add column if not exists channel text not null default 'text'
    check (channel in ('text', 'call'));

alter table calls
  add column if not exists checkin_id uuid references checkins (id) on delete cascade;

create index if not exists calls_checkin_idx on calls (checkin_id);

-- Backfill: every call already stored (from this session's testing) links
-- to a new checkins row, so switching the report page to read checkins
-- doesn't make that history disappear from it.
do $$
declare
  r record;
  new_checkin_id uuid;
begin
  for r in
    select id, user_id, started_at, ended_at, summary, created_at
    from calls
    where user_id is not null and checkin_id is null
  loop
    insert into checkins (user_id, channel, sent_at, message_text, replied_at, reply_text)
    values (
      r.user_id,
      'call',
      coalesce(r.started_at, r.created_at),
      null,
      coalesce(r.ended_at, r.created_at),
      r.summary
    )
    returning id into new_checkin_id;

    update calls set checkin_id = new_checkin_id where id = r.id;
  end loop;
end $$;
