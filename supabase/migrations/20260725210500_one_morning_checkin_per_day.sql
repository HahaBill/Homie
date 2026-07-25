-- One morning message per user per day, enforced by the database.
--
-- The cron route (app/api/cron/morning/route.ts) had no idempotency guard at
-- all: Vercel cron is at-least-once, and the endpoint is a plain authenticated
-- GET, so a retry or a second trigger re-sent the morning check-in to every
-- eligible user. A read-then-write check would still race two overlapping
-- invocations, so the guarantee lives here instead — the route claims the day
-- by inserting the checkin row before sending, and a duplicate claim fails on
-- this index.
--
-- Partial, on message_text is not null, so it constrains only the messages
-- Homie sends. The worker's ad-hoc check-ins (worker/src/supabase.ts,
-- createAdHocCheckin) insert message_text null for replies that arrive with no
-- outstanding morning message, and there can legitimately be several of those
-- in a day.

create unique index if not exists checkins_one_morning_per_user_day_idx
  on checkins (user_id, ((sent_at at time zone 'utc')::date))
  where message_text is not null;
