-- Supabase shim for PGlite. Mirrors only what the migrations touch.
set timezone = 'UTC';
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then create role supabase_admin; end if;
end $$;
grant anon, authenticated, service_role to authenticator;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255),
  encrypted_password varchar(255), email_confirmed_at timestamptz, invited_at timestamptz,
  confirmation_token varchar(255), recovery_token varchar(255), last_sign_in_at timestamptz,
  raw_app_meta_data jsonb default '{}'::jsonb, raw_user_meta_data jsonb default '{}'::jsonb,
  is_super_admin boolean, created_at timestamptz default now(), updated_at timestamptz default now(),
  phone text, phone_confirmed_at timestamptz, banned_until timestamptz, deleted_at timestamptz,
  is_anonymous boolean not null default false
);
create table auth.sessions (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), factor_id uuid,
  aal text, not_after timestamptz, refreshed_at timestamp, user_agent text, ip inet, tag text
);
create table auth.refresh_tokens (
  instance_id uuid, id bigserial primary key, token varchar(255), user_id varchar(255),
  revoked boolean, created_at timestamptz, updated_at timestamptz, parent varchar(255),
  session_id uuid references auth.sessions(id) on delete cascade
);
create or replace function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
                  nullif(current_setting('request.jwt.claims', true), ''))::jsonb $f$;
create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $f$;
create or replace function auth.email() returns text language sql stable as $f$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email') $f$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- storage
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text not null, owner uuid, created_at timestamptz default now(),
  updated_at timestamptz default now(), public boolean default false, avif_autodetection boolean default false,
  file_size_limit bigint, allowed_mime_types text[], owner_id text
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, owner_id text, created_at timestamptz default now(), updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(), metadata jsonb, path_tokens text[], version text
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language plpgsql immutable as $f$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1:array_length(_parts,1)-1]; end $f$;
create or replace function storage.filename(name text) returns text language plpgsql immutable as $f$
declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[array_length(_parts,1)]; end $f$;
create or replace function storage.extension(name text) returns text language plpgsql immutable as $f$
declare _parts text[]; _filename text; begin select string_to_array(name, '/') into _parts; select _parts[array_length(_parts,1)] into _filename;
return reverse(split_part(reverse(_filename), '.', 1)); end $f$;

-- pg_cron stub
create schema if not exists cron;
create table cron.job (jobid bigserial primary key, schedule text, command text, jobname text, active boolean default true);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $f$
declare v bigint; begin delete from cron.job where jobname = job_name;
insert into cron.job(schedule, command, jobname) values (schedule, command, job_name) returning jobid into v; return v; end $f$;
create or replace function cron.schedule(schedule text, command text) returns bigint language sql as $f$
  insert into cron.job(schedule, command) values (schedule, command) returning jobid $f$;
create or replace function cron.unschedule(job_id bigint) returns boolean language sql as $f$
  with d as (delete from cron.job where jobid = job_id returning 1) select exists(select 1 from d) $f$;
create or replace function cron.unschedule(job_name text) returns boolean language sql as $f$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists(select 1 from d) $f$;

-- pg_net stub
create schema if not exists net;
create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, at timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $f$ insert into net.calls(url, body, headers) values (url, body, headers) returning id $f$;

-- Vault stub
create schema if not exists vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text,
  secret text, key_id uuid, nonce bytea, created_at timestamptz default now(), updated_at timestamptz default now());
create or replace view vault.decrypted_secrets as select *, secret as decrypted_secret from vault.secrets;
create or replace function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql as $f$ insert into vault.secrets(secret, name, description) values (new_secret, new_name, new_description) returning id $f$;
create or replace function vault.update_secret(secret_id uuid, new_secret text default null, new_name text default null, new_description text default null, new_key_id uuid default null)
returns void language sql as $f$ update vault.secrets set secret = coalesce(new_secret, secret), name = coalesce(new_name, name) where id = secret_id $f$;

-- realtime
create publication supabase_realtime;
