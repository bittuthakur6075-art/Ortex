-- Migration 0005: Secure RLS Policies
-- Enforces RBAC permissions and active account status on the database layer.

-- 1) Define security helpers
create or replace function public.is_active_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

create or replace function public.has_module_access(p_module text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active = true
      and (role = 'admin' or modules @> jsonb_build_array(p_module))
  );
$$;

-- 2) Update the next_sequence function to verify active staff status
create or replace function public.next_sequence(p_series text)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not public.is_active_staff() then
    raise exception 'Unauthorized: Active session required';
  end if;

  insert into public.sequences (series, value) values (p_series, 1)
    on conflict (series) do nothing;
  update public.sequences set value = value + 1
    where series = p_series
    returning value - 1 into v;
  return v;
end $$;

-- 3) Clean up generic staff_all policies and replace with module-specific permissions
do $$
declare c text;
begin
  foreach c in array array[
    'products','categories','customers','enquiries','leads',
    'quotations','invoices','payments','notifications','settings','sequences'
  ] loop
    execute format('drop policy if exists staff_all on public.%I;', c);
  end loop;
end $$;

-- 4) Apply table-specific RLS policies based on module keys
create policy staff_products on public.products
  for all to authenticated using (public.has_module_access('products')) with check (public.has_module_access('products'));

create policy staff_categories on public.categories
  for all to authenticated using (public.has_module_access('categories')) with check (public.has_module_access('categories'));

create policy staff_customers on public.customers
  for all to authenticated using (public.has_module_access('customers')) with check (public.has_module_access('customers'));

create policy staff_enquiries on public.enquiries
  for all to authenticated using (public.has_module_access('enquiries')) with check (public.has_module_access('enquiries'));

create policy staff_leads on public.leads
  for all to authenticated using (public.has_module_access('leads')) with check (public.has_module_access('leads'));

create policy staff_quotations on public.quotations
  for all to authenticated using (public.has_module_access('quotations')) with check (public.has_module_access('quotations'));

create policy staff_invoices on public.invoices
  for all to authenticated using (public.has_module_access('invoices')) with check (public.has_module_access('invoices'));

create policy staff_payments on public.payments
  for all to authenticated using (public.has_module_access('payments')) with check (public.has_module_access('payments'));

-- Settings singleton: restricted to active administrators only
create policy admin_settings on public.settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Notifications: accessible by any active staff member
create policy staff_notifications on public.notifications
  for all to authenticated using (public.is_active_staff()) with check (public.is_active_staff());
