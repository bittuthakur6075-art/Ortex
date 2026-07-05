-- Ortex Admin — initial schema
--
-- Design: each app "collection" is one table holding the record as a JSONB
-- `doc`, plus a generated uuid id and timestamps. This mirrors the document
-- shapes the front-end already uses (see src/data/schema.js) so the admin
-- modules need no changes — apiStore.js maps rows <-> {...doc, id, createdAt,
-- updatedAt}. Cross-references (invoice.quotationId, payment.invoiceId, …) live
-- inside the doc and point at other rows' ids. Analytics aggregates client-side.
--
-- Security: RLS on everywhere. Authenticated staff get full access; the public
-- (anon) may ONLY insert enquiries — that is the website lead-capture path.

create extension if not exists pgcrypto;

-- ---- shared bits ----------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Factory: create a standard collection table + updated_at trigger + RLS.
-- (Written out explicitly per table below for clarity/greppability.)

-- ---- collection tables ----------------------------------------------------

do $$
declare c text;
begin
  foreach c in array array[
    'products','categories','customers','enquiries','leads',
    'quotations','invoices','payments','notifications'
  ] loop
    execute format($f$
      create table if not exists public.%1$I (
        id         uuid primary key default gen_random_uuid(),
        doc        jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists %1$s_created_idx on public.%1$I (created_at desc);
      create trigger %1$s_touch before update on public.%1$I
        for each row execute function set_updated_at();
      alter table public.%1$I enable row level security;
    $f$, c);
  end loop;
end $$;

-- ---- settings singleton ---------------------------------------------------

create table if not exists public.settings (
  id         boolean primary key default true check (id),   -- exactly one row
  doc        jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create trigger settings_touch before update on public.settings
  for each row execute function set_updated_at();
alter table public.settings enable row level security;

-- ---- numbering sequences (GST-safe, atomic) -------------------------------

create table if not exists public.sequences (
  series text primary key,     -- 'quotation' | 'invoice' | 'payment'
  value  int  not null default 1
);
alter table public.sequences enable row level security;

-- Atomically return the current value for a series and bump it, mirroring the
-- app's nextSequence(). Row is created on first use.
create or replace function public.next_sequence(p_series text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.sequences (series, value) values (p_series, 1)
    on conflict (series) do nothing;
  update public.sequences set value = value + 1
    where series = p_series
    returning value - 1 into v;
  return v;
end $$;

-- ---- profiles (staff accounts / roles) ------------------------------------

create table if not exists public.profiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  email    text,
  role     text not null default 'staff',   -- 'admin' | 'staff'
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- RLS policies ---------------------------------------------------------

-- Authenticated staff: full access to every business table + settings + sequences.
do $$
declare c text;
begin
  foreach c in array array[
    'products','categories','customers','enquiries','leads',
    'quotations','invoices','payments','notifications','settings','sequences'
  ] loop
    execute format($p$
      drop policy if exists staff_all on public.%1$I;
      create policy staff_all on public.%1$I
        for all to authenticated using (true) with check (true);
    $p$, c);
  end loop;
end $$;

-- Public website lead capture: anon may INSERT enquiries only (no read/update).
drop policy if exists anon_insert_enquiries on public.enquiries;
create policy anon_insert_enquiries on public.enquiries
  for insert to anon with check (true);

-- Profiles: a user can read their own profile; admins can read all.
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));
