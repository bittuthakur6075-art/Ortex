-- 0067: the Owner, and more than one Super Admin (owner's decision, 2026-10-03:
-- "the real super admin is Louis Sharma", and "no one can remove him").
--
-- Until now (0032) the Super Admin was exactly one person, enforced by the
-- unique index profiles_one_super_admin, and the role could only change hands
-- through transfer_super_admin(). From here:
--
--   1. profiles.is_owner marks THE Owner: today's Super Admin row, set once by
--      this migration. A unique partial index admits one owner. Ownership is
--      PERMANENT: no client, edge function or RPC can set, clear or move it.
--      Only a migration (which sets ortex.role_change) could.
--   2. public.is_owner(): the caller is the Owner and active.
--   3. The one-Super-Admin index goes, so several people may hold the
--      super_admin role. is_super_admin() is unchanged ("role super_admin and
--      active"), so every Super Admin keeps every Super Admin power: payroll
--      (is_payroll), settings writes, Modules, role grants, unlocking a month,
--      attendance rules, Anu bot settings, synced payments, hiding modules.
--      Owner-only, by this migration: making or removing a Super Admin, and
--      everything about the Owner's own row.
--   4. protect_profile_privileges() (latest: 0032) is rewritten:
--      a. Every caller, the service role included: is_owner never changes and
--         is never inserted true; the Owner's row is never deleted, demoted
--         or deactivated, by the Owner either.
--      b. Only the Owner gives or takes away the super_admin role (insert as
--         super_admin, update to or from it), and only the Owner deletes or
--         deactivates a Super Admin. The service role passes this check: the
--         two edge functions that use it (admin-create-user,
--         admin-manage-user) check the CALLER is the Owner themselves.
--         A migration without the flag, or GoTrue, has no JWT and is refused.
--      c. A signed-in person other than the Owner cannot change the Owner's
--         row at all.
--      d. As before: an Admin cannot grant admin, nor edit the privileged
--         columns of an Admin or Super Admin; everyone else edits only their
--         own harmless columns. A Super Admin edits any row but the Owner's,
--         within (b).
--   5. transfer_super_admin() stays defined so an old client gets an error,
--      but refuses for everyone ("The Owner cannot be changed.") and is no
--      longer executable by signed-in people. Before, it made the old Super
--      Admin an Admin and the new person the Super Admin.
--   6. staff_directory gains is_owner, so both apps can label the Owner. It is
--      not sensitive.
--
-- profiles_guard_hidden (0055) is untouched: any Super Admin may hide modules,
-- except on the Owner's row, which (4c) closes.
-- Safe to run twice: `if not exists`, `create or replace`, guarded updates.

-- ---- 1. the column and the one Owner -------------------------------------------------

alter table public.profiles
  add column if not exists is_owner boolean not null default false;

do $$
begin
  if not exists (select 1 from public.profiles where is_owner) then
    perform set_config('ortex.role_change', 'on', true);
    -- profiles_one_super_admin still stands here, so this is at most one row.
    update public.profiles set is_owner = true where role = 'super_admin';
    perform set_config('ortex.role_change', 'off', true);
  end if;
end $$;

create unique index if not exists profiles_one_owner
  on public.profiles ((true)) where is_owner;

-- ---- 2. is_owner() -------------------------------------------------------------------

create or replace function public.is_owner()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_owner and active
  );
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated, service_role;

-- The sentence every refusal of (4b) uses, with the Owner's name from profiles.
create or replace function public.owner_only_message()
returns text language sql security definer stable set search_path = public as $$
  select 'Only the Owner (' || coalesce(
    (select nullif(btrim(name), '') from public.profiles where is_owner limit 1), 'Louis Sharma'
  ) || ') can make or remove a Super Admin.';
$$;

revoke all on function public.owner_only_message() from public, anon, authenticated;

-- ---- 3. several Super Admins ---------------------------------------------------------

drop index if exists public.profiles_one_super_admin;

-- ---- 4. the guard (from 0032) --------------------------------------------------------

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  role_change boolean := coalesce(current_setting('ortex.role_change', true), '') = 'on';
  service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  me uuid := auth.uid();
  owner_call boolean := public.is_owner();
  privileged text[] := array['admin', 'super_admin'];
begin
  -- (a) The Owner, for EVERY caller, the service role and the Owner included.
  if not role_change then
    if tg_op = 'DELETE' then
      if old.is_owner then
        raise exception 'The Owner''s account cannot be deleted.';
      end if;
    elsif tg_op = 'INSERT' then
      if new.is_owner then
        raise exception 'The Owner cannot be changed.';
      end if;
    else
      if new.is_owner is distinct from old.is_owner then
        raise exception 'The Owner cannot be changed.';
      end if;
      if old.is_owner and (new.role is distinct from 'super_admin' or new.active is not true) then
        raise exception 'The Owner cannot be demoted or deactivated.';
      end if;
    end if;
  end if;

  if role_change then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- (c) Nobody signed in but the Owner changes the Owner's row.
  if me is not null and tg_op = 'UPDATE' and old.is_owner and not owner_call
     and new is distinct from old then
    raise exception 'Only the Owner can change the Owner''s account.';
  end if;

  -- (b) Only the Owner makes, removes, deactivates or deletes a Super Admin.
  -- The service role passes: its edge functions check the caller is the Owner.
  if not (service or owner_call) then
    if (tg_op = 'DELETE' and old.role = 'super_admin')
       or (tg_op = 'INSERT' and new.role = 'super_admin')
       or (tg_op = 'UPDATE' and (old.role = 'super_admin') is distinct from (new.role = 'super_admin'))
       or (tg_op = 'UPDATE' and old.role = 'super_admin' and new.active is distinct from old.active) then
      raise exception '%', public.owner_only_message();
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- Trusted from here: the service role (its functions check the caller).
  if service or tg_op = 'INSERT' then
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

-- The three triggers from 0032 already call this function; nothing to recreate.

-- ---- 5. no hand-over -----------------------------------------------------------------

create or replace function public.transfer_super_admin(p_new uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  raise exception 'The Owner cannot be changed.';
end $$;

revoke all on function public.transfer_super_admin(uuid) from public, anon, authenticated;

-- ---- 6. staff_directory (from 0023 / 0026) -------------------------------------------

create or replace view public.staff_directory as
  select
    p.id,
    p.name,
    p.avatar_url,
    p.role,
    p.is_owner
  from public.profiles p;

revoke all on public.staff_directory from anon;
grant select on public.staff_directory to authenticated;

comment on view public.staff_directory is
  'id -> name/avatar/role/is_owner for rendering attribution and labelling the Owner. Allow-list: never email, modules or active. authenticated only (0026).';
