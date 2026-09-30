-- 0053: the Super Admin's Modules page (console /modules).
--
-- Two new controls per module, on top of 0032's role grants and per-person
-- extras. One row per module key; a missing row means "as before" (on, and
-- every Admin reaches it), so nothing changes until the Super Admin does.
--
--   enabled       false = the module is switched off for the whole company.
--                 Nobody but the Super Admin reaches it, whatever their role
--                 or extras say. Grants are kept, so switching it back on
--                 restores exactly who had it.
--   admin_access  false = Admins no longer reach it automatically. An Admin
--                 still gets it when the Super Admin ticks it on that Admin's
--                 own profile (profiles.modules), which only the Super Admin
--                 may edit (0032's guard).
--
-- Enforced in has_module_access(), which every module policy goes through, and
-- in is_payroll() and attendance_qr_issuer() for the two modules that have
-- their own rule. The Super Admin is never switched off.

create table if not exists public.module_controls (
  key text primary key check (key ~ '^[a-z][a-z-]{1,40}$'),
  enabled boolean not null default true,
  admin_access boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.module_controls enable row level security;

-- Both apps work out what to show from it; only the Super Admin changes it.
drop policy if exists module_controls_read on public.module_controls;
create policy module_controls_read on public.module_controls
  for select to authenticated using (public.is_active_staff());

drop policy if exists module_controls_insert on public.module_controls;
create policy module_controls_insert on public.module_controls
  for insert to authenticated with check (public.is_super_admin());

drop policy if exists module_controls_update on public.module_controls;
create policy module_controls_update on public.module_controls
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.module_controls_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists module_controls_stamp on public.module_controls;
create trigger module_controls_stamp
  before insert or update on public.module_controls
  for each row execute function public.module_controls_stamp();

-- Both apps follow the Super Admin's switches live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'module_controls'
     ) then
    alter publication supabase_realtime add table public.module_controls;
  end if;
end $$;

-- Is this module switched on for the company? No row = on.
create or replace function public.module_enabled(p_module text)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select c.enabled from public.module_controls c where c.key = p_module), true);
$$;
grant execute on function public.module_enabled(text) to authenticated;

-- ---- the checks --------------------------------------------------------------------------

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
                and (p.modules @> '["payroll"]'::jsonb
                     or coalesce(r.modules, '[]'::jsonb) @> '["payroll"]'::jsonb)))
  );
$$;

create or replace function public.attendance_qr_issuer()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.active = true
       and (
         p.role = 'super_admin'
         -- An ADMIN given the grant on their own profile (0043), while the
         -- module is switched on.
         or (p.role = 'admin' and p.modules @> '["attendance-qr"]'::jsonb and public.module_enabled('attendance-qr'))
       )
  );
$$;

-- The audit log follows the module, for Admins too: an Admin the Super Admin
-- has taken Invoices away from no longer reads invoice history through it.
-- Tables with no module stay admins-only, as in 0050.
create or replace function public.audit_can_read(p_table text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_table
    when 'products'          then public.has_module_access('products')
    when 'categories'        then public.has_module_access('categories')
    when 'work'              then public.has_module_access('work')
    when 'customers'         then public.has_module_access('customers')
    when 'enquiries'         then public.has_module_access('enquiries') or public.has_module_access('voice-leads')
    when 'leads'             then public.has_module_access('enquiries')
    when 'quotations'        then public.has_module_access('quotations')
    when 'invoices'          then public.has_module_access('invoices')
    when 'payments'          then public.has_module_access('payments')
    when 'social'            then public.has_module_access('social')
    when 'telecaller_jobs'   then public.has_module_access('telecaller')
    else public.is_admin()
  end;
$$;
