-- Email as a second identity door (Clerk email sign-in shipped before phone).
--
-- The web dashboard authenticates with Clerk; sessions may carry an email
-- and no phone. The thread join stays users-row-based: the Next.js API
-- resolves phone first, then email, creating a row keyed by email when
-- neither matches. When phone auth returns, the same row gains a phone and
-- both doors open onto one record.
--
-- phone goes nullable for exactly that reason — an email-created row has
-- no number yet. The worker always supplies a phone on its own paths, and
-- the partial unique index preserves one-row-per-phone for rows that have
-- one.

alter table users add column if not exists email text;

alter table users alter column phone drop not null;

-- Replace the plain unique constraint on phone with partial unique indexes
-- so multiple email-only rows (phone is null) can coexist.
alter table users drop constraint if exists users_phone_key;
create unique index if not exists users_phone_unique on users (phone) where phone is not null;
create unique index if not exists users_email_unique on users (lower(email)) where email is not null;
