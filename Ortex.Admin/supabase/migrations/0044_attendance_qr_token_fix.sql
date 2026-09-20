-- Attendance QR: make the token generator work on a project that already has
-- 0043 (2026-09-20).
--
-- 0043 built its token with pgcrypto's gen_random_bytes(). pgcrypto lives in
-- the `extensions` schema on Supabase, and every function in 0043 pins
-- `search_path = public`, so the call is invisible to them and the whole
-- display fails at runtime with 42883 ("function does not exist"), which the
-- console reports as "attendance codes are not set up on this database yet".
--
-- The fix was written into 0043 itself, which is right for a project that has
-- never seen it. It is NOT enough for one that has: `supabase db push` skips a
-- migration already recorded in schema_migrations, so the broken function
-- stays in the database and the tab keeps saying the migration is missing.
-- Hence this file. It is a plain `create or replace` and is safe to run twice.
--
-- gen_random_uuid() is core Postgres (pg_catalog, v13+), drawn from the same
-- CSPRNG, and needs no extension and no search_path juggling. 32 hex
-- characters, 128 bits, far beyond what a token living 30 seconds needs; the
-- `token` column is plain text, so the length change costs nothing.
create or replace function public.attendance_qr_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '');
$$;
