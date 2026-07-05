-- RBAC: two roles (admin | sales) + per-user module access.
--
-- profiles gains `name`, `modules` (list of allowed module keys) and `active`.
-- An admin manages everyone; a user can read their own profile. New users are
-- created by the `admin-create-user` Edge Function, which passes role/name/
-- modules as auth user_metadata — the signup trigger copies them into profiles.

alter table public.profiles
  add column if not exists name    text,
  add column if not exists modules jsonb   not null default '[]'::jsonb,
  add column if not exists active  boolean not null default true;

alter table public.profiles alter column role set default 'sales';

-- Admin check that BYPASSES RLS (security definer) so profiles policies that
-- reference the caller's role don't recurse.
create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- Populate a new profile from the auth user's metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role, modules)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'sales'),
    coalesce(new.raw_user_meta_data->'modules', '[]'::jsonb)
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- RLS: self-read + admin-manage-all.
drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;

create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Bootstrap the first admin (idempotent).
insert into public.profiles (id, email, role, modules)
select id, email, 'admin',
       '["leads","enquiries","customers","products","categories","quotations","invoices","payments"]'::jsonb
from auth.users
where email = 'louis.sharma37@gmail.com'
on conflict (id) do update
  set role = 'admin', modules = excluded.modules, active = true;
