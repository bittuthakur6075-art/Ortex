-- 0075: several companies in one console (phase 1, database).
--
-- Owner's decision (2026-10-03): Ortex Industries, Aman Enterprise and Nidhi
-- Industries are run from the same console. Enquiries (Anu voice captures
-- included), leads, customers, quotations, invoices and payments belong to ONE
-- company each; the catalogue, staff, attendance, leave, payroll and chat stay
-- shared. Everything that exists today is Ortex's.
--
--   1. `companies`: one row per company. doc holds the blocks that used to be
--      global settings and differ per company: company (name, GSTIN, state,
--      address, contact, bank/UPI, paymentAliases, logoText), numbering
--      (prefixes), quotation (validity, terms), documents (printed wording),
--      tax (defaultGstRate, pricesIncludeTax) and tallyCompany. Ortex is seeded
--      from today's settings row; Aman and Nidhi start switched off, with names
--      only. Every signed-in person reads the companies they work in; only a
--      Super Admin writes. Global settings keep notifications, integrations and
--      telecaller (and, until the console moves, a copy of Ortex's blocks: 9).
--   2. profiles.companies: the companies a person works in, ["ortex"] for all
--      today. Only a Super Admin (or the service role) changes it
--      (protect_profile_privileges, from 0067).
--   3. has_company_access(p) and default_company_id(). A Super Admin (the Owner
--      is one) reaches every company; anyone else the ones in their list.
--      The default company is the first in the list; anon, the service role
--      and a migration get 'ortex', so the website, Anu voice captures,
--      IndiaMART and every edge function keep writing into Ortex.
--   4. company_id on the six tables, 'ortex' for every existing row, then
--      default_company_id() for new rows (old clients never send it).
--   5. sequences re-keyed '<company>:<series>'; next_sequence(series, company)
--      takes a number from that company's own series. The one-argument form
--      the console and phones call today stays, on the caller's default company.
--   6. audit_log.company_id, written by audit_row() for the six tables.
--   7. company_guard: a record changes company only by a Super Admin (or the
--      service role), and only while it has no number.
--   8. payments_validate (from 0066): a linked payment takes its invoice's
--      company. payments_number_key becomes unique per company.
--   9. settings_staff (from 0071) reads the blocks from the caller's default
--      company, same shape. While the console still edits company details in
--      Settings, a Super Admin's save there is copied onto the Ortex row.
--
-- The RLS on the six tables and audit_log, the customer matching and Anu's
-- team update are 0076. Safe to run twice: `if not exists`, `create or
-- replace`, guarded updates.

-- ---- 1. companies --------------------------------------------------------------------

create table if not exists public.companies (
  id         text primary key check (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  name       text not null check (btrim(name) <> ''),
  doc        jsonb not null default '{}'::jsonb check (jsonb_typeof(doc) = 'object'),
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.companies enable row level security;

insert into public.companies (id, name, doc, active, sort)
select 'ortex', 'Ortex Industries',
       jsonb_strip_nulls(jsonb_build_object(
         'company',   coalesce(s.doc -> 'company', jsonb_build_object('name', 'Ortex Industries')),
         'numbering', s.doc -> 'numbering',
         'quotation', s.doc -> 'quotation',
         'documents', s.doc -> 'documents',
         'tax',       s.doc -> 'tax',
         'tallyCompany', 'Ortex Industries'
       )),
       true, 0
  from (select 1) one
  left join public.settings s on s.id
on conflict (id) do nothing;

insert into public.companies (id, name, doc, active, sort) values
  ('aman',  'Aman Enterprise',  '{"company": {"name": "Aman Enterprise"}}',  false, 1),
  ('nidhi', 'Nidhi Industries', '{"company": {"name": "Nidhi Industries"}}', false, 2)
on conflict (id) do nothing;

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies
  for each row execute function public.set_updated_at();
drop trigger if exists companies_stamp_actor on public.companies;
create trigger companies_stamp_actor before insert or update on public.companies
  for each row execute function public.stamp_actor();

-- audit_row_plain (from 0065) gains companies: its id is text, so the log's
-- row_id is derived from it, and the stamps are not a change.
create or replace function public.audit_row_plain()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  n jsonb;
  d jsonb;
  v_row uuid;
  v_label text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_table_name = 'attendance_settings' then
    o := o -> 'doc';
    n := n -> 'doc';
    v_row := md5('attendance_settings')::uuid;
    v_label := 'Attendance settings';
  elsif tg_table_name = 'companies' then
    v_row := md5('companies:' || (coalesce(n, o) ->> 'id'))::uuid;
    v_label := coalesce(n, o) ->> 'name';
    o := o - 'created_at' - 'updated_at' - 'created_by' - 'updated_by';
    n := n - 'created_at' - 'updated_at' - 'created_by' - 'updated_by';
  else
    v_row := (coalesce(n, o) ->> 'id')::uuid;
    v_label := concat_ws(', ', coalesce(n, o) ->> 'name', coalesce(n, o) ->> 'day');
  end if;
  d := case tg_op when 'UPDATE' then public.audit_diff(o, n) when 'INSERT' then n else o end;
  if tg_op = 'UPDATE' and d = '{}'::jsonb then
    return null;
  end if;
  insert into public.audit_log (table_name, row_id, action, actor, changes, label)
  values (tg_table_name, v_row, lower(tg_op), auth.uid(), coalesce(d, '{}'::jsonb), v_label);
  return null;
end $$;

revoke all on function public.audit_row_plain() from public, anon, authenticated;

drop trigger if exists companies_audit on public.companies;
create trigger companies_audit after insert or update or delete on public.companies
  for each row execute function public.audit_row_plain();

-- ---- 2. profiles.companies -------------------------------------------------------------

alter table public.profiles
  add column if not exists companies jsonb not null default '["ortex"]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_companies_array') then
    alter table public.profiles add constraint profiles_companies_array
      check (jsonb_typeof(companies) = 'array');
  end if;
end $$;

-- ---- 3. access helpers -----------------------------------------------------------------

create or replace function public.has_company_access(p text)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or exists (
        select 1 from public.profiles
         where id = auth.uid() and active
           and (role = 'super_admin' or companies ? p)
      );
$$;
revoke all on function public.has_company_access(text) from public, anon;
grant execute on function public.has_company_access(text) to authenticated, service_role;

-- Where a new row goes when the client does not say: the first company in the
-- caller's list. Anon (the website, Anu), the service role and migrations: Ortex.
create or replace function public.default_company_id()
returns text language sql security definer stable set search_path = public as $$
  select coalesce(
    (select p.companies ->> 0 from public.profiles p
      where p.id = auth.uid() and exists (select 1 from public.companies c where c.id = p.companies ->> 0)),
    'ortex');
$$;
revoke all on function public.default_company_id() from public;
grant execute on function public.default_company_id() to anon, authenticated, service_role;

drop policy if exists companies_read on public.companies;
create policy companies_read on public.companies
  for select to authenticated using (public.has_company_access(id));
drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies
  for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

revoke all on public.companies from anon;
grant select, insert, update, delete on public.companies to authenticated;

-- protect_profile_privileges (from 0067): companies joins the privileged
-- columns, and only a Super Admin (or the service role) changes it.
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

  -- 0075: the companies someone works in are the Super Admin's to set.
  if new.companies is distinct from old.companies then
    raise exception 'Only the Super Admin can change which companies someone works in.';
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

-- ---- 4. company_id on the six tables ---------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['enquiries', 'leads', 'customers', 'quotations', 'invoices', 'payments'] loop
    execute format('alter table public.%I add column if not exists company_id text not null default ''ortex''', t);
    if not exists (select 1 from pg_constraint where conname = t || '_company_fk') then
      execute format('alter table public.%I add constraint %I foreign key (company_id) references public.companies(id)', t, t || '_company_fk');
    end if;
    execute format('alter table public.%I alter column company_id set default public.default_company_id()', t);
    execute format('create index if not exists %I on public.%I (company_id, created_at desc)', t || '_company_idx', t);
  end loop;
end $$;

-- ---- 5. numbers per company ------------------------------------------------------------

update public.sequences set series = 'ortex:' || series where series !~ ':';

create or replace function public.next_sequence(p_series text, p_company text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v int;
  v_key text := p_company || ':' || p_series;
  v_module text := case p_series
    when 'payment' then 'payments'
    when 'invoice' then 'invoices'
    when 'quotation' then 'quotations'
  end;
begin
  if v_module is null then
    raise exception 'Unknown number series "%".', p_series;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    if not public.is_active_staff() then
      raise exception 'Unauthorized: Active session required';
    end if;
    if not public.has_module_access(v_module) then
      raise exception 'You cannot take a new % number without the % module.', p_series, v_module;
    end if;
    if not public.has_company_access(p_company) then
      raise exception 'You do not work in company "%".', p_company;
    end if;
  end if;
  if not exists (select 1 from public.companies where id = p_company) then
    raise exception 'Unknown company "%".', p_company;
  end if;

  insert into public.sequences (series, value) values (v_key, 1)
    on conflict (series) do nothing;
  update public.sequences set value = value + 1
    where series = v_key
    returning value - 1 into v;
  return v;
end $$;
revoke all on function public.next_sequence(text, text) from public, anon;
grant execute on function public.next_sequence(text, text) to authenticated, service_role;

-- The call every console and phone makes today: the caller's default company.
create or replace function public.next_sequence(p_series text)
returns int language sql security definer set search_path = public as $$
  select public.next_sequence(p_series, public.default_company_id());
$$;

-- ---- 6. audit_log.company_id -----------------------------------------------------------

alter table public.audit_log add column if not exists company_id text;
update public.audit_log set company_id = 'ortex'
 where company_id is null
   and table_name in ('enquiries', 'leads', 'customers', 'quotations', 'invoices', 'payments');
create index if not exists audit_log_company_idx on public.audit_log (company_id, at desc);

-- audit_row (from 0023): the row's company_id, null for tables without one.
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, row_id, action, actor, changes, label, company_id)
    values (tg_table_name, new.id, 'insert', auth.uid(), coalesce(new.doc,'{}'::jsonb),
            public.audit_label(tg_table_name, new.doc), to_jsonb(new) ->> 'company_id');
    return new;
  elsif tg_op = 'UPDATE' then
    d := public.audit_diff(old.doc, new.doc);
    -- 0075: a move to another company is history too.
    if (to_jsonb(old) ->> 'company_id') is distinct from (to_jsonb(new) ->> 'company_id') then
      d := d || jsonb_build_object('company_id', jsonb_build_object(
        'from', to_jsonb(old) -> 'company_id', 'to', to_jsonb(new) -> 'company_id'));
    end if;
    -- A no-op write (the app re-saving an unchanged record) is not history.
    if d = '{}'::jsonb then return new; end if;
    insert into public.audit_log (table_name, row_id, action, actor, changes, label, company_id)
    values (tg_table_name, new.id, 'update', auth.uid(), d,
            public.audit_label(tg_table_name, new.doc), to_jsonb(new) ->> 'company_id');
    return new;
  else
    insert into public.audit_log (table_name, row_id, action, actor, changes, label, company_id)
    values (tg_table_name, old.id, 'delete', auth.uid(), coalesce(old.doc,'{}'::jsonb),
            public.audit_label(tg_table_name, old.doc), to_jsonb(old) ->> 'company_id');
    return old;
  end if;
end $$;

-- ---- 7. company_guard ------------------------------------------------------------------
-- SECURITY INVOKER on purpose: is_service_caller() reads current_user. The
-- trigger is named zz_ so it runs after every other BEFORE trigger (they fire
-- in name order) and judges the final company_id, payments_validate's included.

create or replace function public.company_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.company_id is distinct from old.company_id then
    if not (public.is_service_caller() or public.is_super_admin()) then
      raise exception 'Only the Super Admin can move a record to another company.';
    end if;
    if btrim(coalesce(old.doc ->> 'number', '')) <> '' or btrim(coalesce(new.doc ->> 'number', '')) <> '' then
      raise exception 'A record with a number (%) cannot move to another company.', coalesce(nullif(btrim(old.doc ->> 'number'), ''), new.doc ->> 'number');
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['enquiries', 'leads', 'customers', 'quotations', 'invoices', 'payments'] loop
    execute format('drop trigger if exists zz_company_guard on public.%I', t);
    execute format('create trigger zz_company_guard before update on public.%I
                    for each row execute function public.company_guard()', t);
  end loop;
end $$;

-- ---- 8. payments take their invoice's company ------------------------------------------

create or replace function public.payments_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_inv text := lower(nullif(btrim(coalesce(new.doc ->> 'invoiceId', '')), ''));
  v_check boolean := tg_op = 'INSERT';
  v_doc jsonb;
  v_company text;
begin
  -- Parenthesised: PL/pgSQL would read the CASE's own THEN as the IF's.
  if not (case when jsonb_typeof(new.doc -> 'amount') = 'number'
              then (new.doc ->> 'amount')::numeric > 0 and (new.doc ->> 'amount')::numeric < 1e10
              else false end) then
    raise exception 'The payment amount must be a number above 0 and below 10,000,000,000.';
  end if;
  if coalesce(new.doc ->> 'type', '') not in ('inflow', 'payout') then
    raise exception 'A payment must be an inflow or a payout.';
  end if;
  if tg_op = 'UPDATE' then
    v_check := v_inv is distinct from lower(nullif(btrim(coalesce(old.doc ->> 'invoiceId', '')), ''))
            or (old.doc -> 'type') is distinct from (new.doc -> 'type');
  end if;
  if v_inv is null then
    new.doc := case when new.doc ? 'invoiceId' then new.doc || '{"invoiceId": null}' else new.doc end - 'invoiceNumber';
    return new;
  end if;
  if v_check and new.doc ->> 'type' = 'payout' then
    raise exception 'A payout cannot be linked to an invoice.';
  end if;
  if v_inv ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select doc, company_id into v_doc, v_company from public.invoices where id = v_inv::uuid;
  end if;
  if v_doc is null then
    if v_check then
      raise exception 'This payment points to an invoice that does not exist.';
    end if;
    return new; -- a row older than 0066 whose invoice is gone: left as it is
  end if;
  new.doc := new.doc || jsonb_build_object('invoiceId', v_inv);
  -- 0075: the payment belongs to its invoice's company (RLS then checks the
  -- payer may write there; company_guard refuses a numbered payment moving).
  new.company_id := v_company;
  if new.doc ->> 'type' = 'inflow' then
    -- Tally's Agst Ref and party must be the invoice this payment settles.
    new.doc := new.doc || jsonb_build_object('invoiceNumber', v_doc -> 'number', 'customer', v_doc -> 'customer');
  end if;
  return new;
end;
$$;

-- Each company numbers its own payments, so a number is unique per company.
do $$
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_number_key'
              and indexdef !~ 'company_id') then
    drop index public.payments_number_key;
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_number_key') then
    begin
      create unique index payments_number_key on public.payments (company_id, (doc ->> 'number'))
        where btrim(coalesce(doc ->> 'number', '')) <> '';
    exception when unique_violation then
      raise notice '0075: payments_number_key NOT created: a payment number is used more than once in one company.';
    end;
  end if;
end $$;

-- ---- 9. settings_staff (from 0071), per company ----------------------------------------

create or replace view public.settings_staff as
  select
    s.id,
    jsonb_build_object(
      -- No fallback to the global block: another company must never print Ortex's GSTIN.
      'company',   coalesce(case when c.id is null then s.doc -> 'company' else c.doc -> 'company' end, '{}'::jsonb),
      'tax',       coalesce(c.doc -> 'tax',       s.doc -> 'tax',       '{}'::jsonb),
      'numbering', coalesce(c.doc -> 'numbering', s.doc -> 'numbering', '{}'::jsonb),
      'quotation', coalesce(c.doc -> 'quotation', s.doc -> 'quotation', '{}'::jsonb),
      'documents', coalesce(c.doc -> 'documents', s.doc -> 'documents', '{}'::jsonb)
    ) as doc,
    greatest(s.updated_at, c.updated_at) as updated_at
  from public.settings s
  left join public.companies c on c.id = public.default_company_id()
  where public.is_active_staff();

revoke all on public.settings_staff from anon;
grant select on public.settings_staff to authenticated;

comment on view public.settings_staff is
  'The document blocks (company, tax, numbering, quotation, documents) of the caller''s default company, global settings where the company has none (never another company''s details). Allow-list: never notifications, integrations or telecaller. 0075.';

-- Until the console edits companies itself (phase 2), its Settings page still
-- saves these blocks into settings. Copy the ones that changed onto Ortex.
-- Phase 2 drops this trigger.
create or replace function public.settings_mirror_ortex()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
  v_patch jsonb := '{}'::jsonb;
begin
  foreach k in array array['company', 'numbering', 'quotation', 'documents', 'tax'] loop
    if new.doc ? k and (tg_op = 'INSERT' or (new.doc -> k) is distinct from (old.doc -> k)) then
      v_patch := v_patch || jsonb_build_object(k, new.doc -> k);
    end if;
  end loop;
  if v_patch <> '{}'::jsonb then
    update public.companies
       set doc = doc || v_patch,
           name = coalesce(nullif(btrim(v_patch #>> '{company,name}'), ''), name)
     where id = 'ortex';
  end if;
  return null;
end $$;
revoke all on function public.settings_mirror_ortex() from public, anon, authenticated;

drop trigger if exists settings_mirror_ortex on public.settings;
create trigger settings_mirror_ortex after insert or update on public.settings
  for each row execute function public.settings_mirror_ortex();
