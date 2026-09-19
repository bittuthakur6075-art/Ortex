-- 0032_roles.sql
--
-- FIVE ROLES, ONE SUPER ADMIN (owner's decision, 2026-09-19; the plan is
-- docs/pm/ATTENDANCE_LEAVE_PLAN.md §3a).
--
--   super_admin  the owner, and only the owner: louis.sharma37@gmail.com
--   admin        day-to-day operations; approves; manages Accounts/Sales/Staff
--   accounts     billing and payroll
--   sales        Sales Executive (field sales), as before
--   staff        factory and office: attendance and leave only
--
-- Until now there were two roles and `role = 'admin'` meant "everything". Every
-- existing admin-only policy goes through is_admin() or has_module_access(), so
-- making both of those true for super_admin keeps every one of them working
-- without touching it. The owner-only powers get their own is_super_admin().
--
-- THE SUPER ADMIN IS EXACTLY ONE PERSON, enforced here rather than in a screen:
--   · a unique partial index makes a second super_admin row impossible;
--   · profiles_protect refuses to demote, deactivate or delete that row, and
--     refuses to create a super_admin, except inside transfer_super_admin() or
--     this migration (both set the transaction-local flag ortex.role_change);
--   · an Admin can neither grant the admin/super_admin roles nor edit the
--     privileged columns of someone who holds one. Only the Super Admin can.
--
-- Migrations run with no JWT, so the 0008 trigger treats them as an untrusted
-- non-admin and silently puts role/active back (the exact bug 0016 records).
-- The seed below therefore sets the same flag the transfer uses.

-- ---- role values ---------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
-- NOT VALID first: a legacy row with a stray value must not stop the push.
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'admin', 'accounts', 'sales', 'staff')) not valid;
do $$
begin
  alter table public.profiles validate constraint profiles_role_check;
exception when check_violation then
  raise warning 'profiles has a role outside the five; fix it from Users, then run: alter table public.profiles validate constraint profiles_role_check;';
end $$;

-- At most one Super Admin. A unique index over a constant, limited to the
-- super_admin rows, admits one row and refuses the second.
create unique index if not exists profiles_one_super_admin
  on public.profiles ((true)) where role = 'super_admin';

-- ---- role checks -------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'super_admin') and active
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and active
  );
$$;

grant execute on function public.is_super_admin() to authenticated;

-- ---- what each role may open (the Super Admin's Roles & permissions screen) ----------
--
-- A role's grants apply to everyone holding it; the per-person `profiles.modules`
-- list still adds extras on top, exactly as the Users page ticks do today. So a
-- person's access is (their role's grants) ∪ (their own extras). Admin and Super
-- Admin are not rows here: they reach every module, and the Super-Admin-only
-- powers (managing admins, company settings, attendance rules, unlocking a
-- month) are role checks, never grantable keys.
create table if not exists public.role_permissions (
  role text primary key check (role in ('accounts', 'sales', 'staff')),
  modules jsonb not null default '[]'::jsonb check (jsonb_typeof(modules) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.role_permissions (role, modules) values
  ('sales',    '["voice-leads", "enquiries", "customers", "quotations"]'::jsonb),
  ('accounts', '["invoices", "payments", "attendance-team", "attendance-register"]'::jsonb),
  ('staff',    '[]'::jsonb)
on conflict (role) do nothing;

alter table public.role_permissions enable row level security;

-- Every active member of staff reads the grants (both apps work out what to
-- show from them); only the Super Admin changes them.
drop policy if exists role_permissions_read on public.role_permissions;
create policy role_permissions_read on public.role_permissions
  for select to authenticated using (public.is_active_staff());

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.role_permissions_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists role_permissions_stamp on public.role_permissions;
create trigger role_permissions_stamp
  before update on public.role_permissions
  for each row execute function public.role_permissions_stamp();

-- Both apps refetch their grants when the Super Admin saves.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'role_permissions'
     ) then
    alter publication supabase_realtime add table public.role_permissions;
  end if;
end $$;

create or replace function public.has_module_access(p_module text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      left join public.role_permissions r on r.role = p.role
     where p.id = auth.uid()
       and p.active = true
       and (
         p.role in ('admin', 'super_admin')
         or p.modules @> jsonb_build_array(p_module)
         or coalesce(r.modules, '[]'::jsonb) @> jsonb_build_array(p_module)
       )
  );
$$;

-- ---- the guard ---------------------------------------------------------------------

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  role_change boolean := coalesce(current_setting('ortex.role_change', true), '') = 'on';
  privileged text[] := array['admin', 'super_admin'];
begin
  -- The Super Admin's own invariants hold for EVERY caller, the service role
  -- included, so no Edge Function bug can leave the company with zero or two.
  if not role_change then
    if tg_op = 'DELETE' then
      if old.role = 'super_admin' then
        raise exception 'The Super Admin account cannot be deleted. Hand the role over first (transfer_super_admin).';
      end if;
      return old;
    end if;
    if tg_op = 'UPDATE' and old.role = 'super_admin' and (new.role is distinct from 'super_admin' or new.active is not true) then
      raise exception 'The Super Admin cannot be demoted or deactivated. Hand the role over first (transfer_super_admin).';
    end if;
    if new.role = 'super_admin' and (tg_op = 'INSERT' or old.role is distinct from 'super_admin') then
      raise exception 'There is only one Super Admin; the role can only be handed over by them (transfer_super_admin).';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Trusted: this migration, a transfer, or a server-side Edge Function using
  -- the service-role key (which enforces its own caller checks).
  if role_change or coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  if public.is_super_admin() then
    return new;
  end if;

  if public.is_admin() then
    -- An Admin manages Accounts, Sales and Staff, not other admins.
    if new.role = any (privileged) and new.role is distinct from old.role then
      raise exception 'Only the Super Admin can give someone the % role.', new.role;
    end if;
    if old.role = any (privileged) then
      new.role    := old.role;
      new.modules := old.modules;
      new.active  := old.active;
      new.email   := old.email;
    end if;
    return new;
  end if;

  -- Everyone else edits only their own harmless columns (0003).
  new.role    := old.role;
  new.modules := old.modules;
  new.active  := old.active;
  new.email   := old.email;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

drop trigger if exists profiles_protect_delete on public.profiles;
create trigger profiles_protect_delete
  before delete on public.profiles
  for each row execute function public.protect_profile_privileges();

drop trigger if exists profiles_protect_insert on public.profiles;
create trigger profiles_protect_insert
  before insert on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ---- hand-over -----------------------------------------------------------------------

-- The only way the Super Admin changes hands: the current one calls it, they
-- become an Admin and the other person becomes the Super Admin in the same
-- transaction, so there is never zero and never two.
create or replace function public.transfer_super_admin(p_new uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can hand the role over.';
  end if;
  if p_new is null or p_new = me then
    raise exception 'Choose another person to hand the Super Admin role to.';
  end if;
  if not exists (select 1 from public.profiles where id = p_new and active) then
    raise exception 'That person does not have an active account.';
  end if;
  perform set_config('ortex.role_change', 'on', true);
  update public.profiles set role = 'admin' where id = me;
  update public.profiles set role = 'super_admin', active = true where id = p_new;
  perform set_config('ortex.role_change', 'off', true);
end $$;

revoke all on function public.transfer_super_admin(uuid) from public, anon;
grant execute on function public.transfer_super_admin(uuid) to authenticated;

-- ---- the seed ----------------------------------------------------------------------------

-- The owner becomes the Super Admin. Fails loudly rather than leave the company
-- without one: the account must have signed in to the console at least once.
do $$
declare
  n int;
begin
  if exists (select 1 from public.profiles where role = 'super_admin') then
    return;
  end if;
  perform set_config('ortex.role_change', 'on', true);
  update public.profiles
     set role = 'super_admin', active = true
   where lower(email) = 'louis.sharma37@gmail.com';
  get diagnostics n = row_count;
  perform set_config('ortex.role_change', 'off', true);
  if n = 0 then
    raise exception 'No profile for louis.sharma37@gmail.com. Sign in to the console with that address once, then push again.';
  end if;
end $$;
