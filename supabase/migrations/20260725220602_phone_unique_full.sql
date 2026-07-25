-- Correction to 20260725220305_email_identity: the partial unique index on
-- phone (where phone is not null) cannot satisfy PostgREST's
-- ON CONFLICT (phone), which the worker's findOrCreateUserByPhone upsert
-- relies on. A plain unique index does the same job — Postgres treats NULLs
-- as distinct in unique indexes, so email-only rows with null phones still
-- coexist — and it restores upsert inference.

drop index if exists users_phone_unique;
create unique index if not exists users_phone_key on users (phone);
