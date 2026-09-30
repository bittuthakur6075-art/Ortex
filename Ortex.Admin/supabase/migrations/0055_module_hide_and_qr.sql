-- 0055: the QR code becomes an ordinary module, and the Super Admin can hide
-- any module from one person.
--
-- 1. attendance-qr. Until now only the Super Admin and Admins ticked one by one
--    could show the gate code (0043). Owner's decision 2026-09-30: every Admin
--    shows it, like any other module. It now goes through has_module_access(),
--    so the Modules page controls it the usual way: the Admin column (on by
--    default), role ticks, personal ticks, the company switch, and (2) below.
--
-- 2. profiles.modules_hidden. A list of module keys this person must NOT
--    reach even though their role (or the Admin role) gives it: the "hide"
--    on Modules -> People. Only the Super Admin (or the service role) may
--    change it; the Super Admin is never hidden from anything.

alter table public.profiles
  add column if not exists modules_hidden jsonb not null default '[]'::jsonb;

do $$
begin
  alter table public.profiles
    add constraint profiles_modules_hidden_array check (jsonb_typeof(modules_hidden) = 'array');
exception when duplicate_object then null;
end $$;

-- An Admin may update profiles (0050), so the column needs its own guard: an
-- Admin hidden from a module must not be able to un-hide themselves.
create or replace function public.profiles_guard_hidden()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new; -- service role (admin-create-user / admin-manage-user) and migrations
  end if;
  if tg_op = 'INSERT' then
    if new.modules_hidden <> '[]'::jsonb and not public.is_super_admin() then
      raise exception 'Only the Super Admin can hide modules from a person';
    end if;
  elsif new.modules_hidden is distinct from old.modules_hidden and not public.is_super_admin() then
    raise exception 'Only the Super Admin can hide modules from a person';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_hidden on public.profiles;
create trigger profiles_guard_hidden
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_hidden();

-- ---- the checks, now honouring the hide list -----------------------------------------

create or replace function public.has_module_access(p_module text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      left join public.role_permissions r on r.role = p.role
      left join public.module_controls c on c.key = p_module
     where p.id = auth.uid()
       and p.active = true
       and (
         p.role = 'super_admin'
         or (
           coalesce(c.enabled, true)
           and not coalesce(p.modules_hidden, '[]'::jsonb) @> jsonb_build_array(p_module)
           and (
             (p.role = 'admin' and coalesce(c.admin_access, true))
             or p.modules @> jsonb_build_array(p_module)
             or coalesce(r.modules, '[]'::jsonb) @> jsonb_build_array(p_module)
           )
         )
       )
  );
$$;

create or replace function public.is_payroll()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      left join public.role_permissions r on r.role = p.role
     where p.id = auth.uid()
       and p.active
       and (p.role = 'super_admin'
            or (public.module_enabled('payroll')
                and not coalesce(p.modules_hidden, '[]'::jsonb) @> '["payroll"]'::jsonb
                and (p.modules @> '["payroll"]'::jsonb
                     or coalesce(r.modules, '[]'::jsonb) @> '["payroll"]'::jsonb)))
  );
$$;

-- Who may show the gate code: whoever may open the attendance-qr module.
create or replace function public.attendance_qr_issuer()
returns boolean language sql security definer stable set search_path = public as $$
  select public.has_module_access('attendance-qr');
$$;
