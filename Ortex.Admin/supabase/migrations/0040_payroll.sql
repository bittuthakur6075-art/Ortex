-- 0040_payroll.sql
--
-- PAYROLL, modelled on Zoho Payroll (India) (docs/pm/PAYROLL_PLAN.md).
--
--   payroll_settings      Zoho's Settings: organisation statutory IDs, pay
--                         schedule, EPF / ESI / LWF / PT / TDS, deduction cap,
--                         bank file. The Super Admin's.
--   salary_components     Earnings (Basic, HRA, Conveyance, Fixed allowance...)
--   salary_templates      named sets of component rules applied to a CTC.
--   employees             the pay profile: statutory IDs, bank, tax regime,
--                         exit. PAN and bank account are ENCRYPTED with a key
--                         the database generates in Vault; the table keeps only
--                         their last four digits in the clear.
--   salary_revisions      annual CTC with an Effective From and a Payout Month
--                         (arrears), never an overwrite.
--   pay_runs / payslips   draft → pending approval → approved → paid, with
--                         recall until paid. A payslip becomes visible to its
--                         employee only once the run is paid.
--   loans / loan_recoveries, reimbursement_claims, payroll_audit.
--
-- WHO: the payroll role is the Super Admin, and anyone granted the `payroll`
-- module (Accounts by default). An Admin is NOT payroll by default: salaries
-- are not "everything an admin sees". is_payroll() says so, and every policy
-- and function below uses it rather than is_admin().
--
-- Salary tables are deliberately NOT attached to the 0023 audit trail, whose
-- rows every member of staff can read. payroll_audit is their history, and only
-- the payroll role reads it.
--
-- The figures are computed by the pure engine (Ortex.Admin/src/lib/payroll.js,
-- tested) in the payroll user's console and saved through payroll_run_save();
-- the database owns who may do what, when, and what an employee can see.

-- ---- who ------------------------------------------------------------------------------------

create or replace function public.is_payroll()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      left join public.role_permissions r on r.role = p.role
     where p.id = auth.uid()
       and p.active
       and (p.role = 'super_admin'
            or p.modules @> '["payroll"]'::jsonb
            or coalesce(r.modules, '[]'::jsonb) @> '["payroll"]'::jsonb)
  );
$$;

grant execute on function public.is_payroll() to authenticated;

-- Accounts runs payroll by default (role permissions, 0032).
update public.role_permissions
   set modules = modules || '["payroll"]'::jsonb
 where role = 'accounts' and not (modules @> '["payroll"]'::jsonb);

-- ---- the encryption key --------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'payroll_data_key') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'payroll_data_key',
      'Encrypts PAN and bank account numbers in public.employees (0040).');
  end if;
end $$;

create or replace function public.payroll_key()
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'payroll_data_key' limit 1;
$$;
revoke all on function public.payroll_key() from public, anon, authenticated;

-- ---- history ------------------------------------------------------------------------------------

create table if not exists public.payroll_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  run_id uuid,
  user_id uuid,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists payroll_audit_at_idx on public.payroll_audit (at desc);
alter table public.payroll_audit enable row level security;
drop policy if exists payroll_audit_read on public.payroll_audit;
create policy payroll_audit_read on public.payroll_audit for select to authenticated using (public.is_payroll());

create or replace function public.payroll_log(p_action text, p_run uuid, p_user uuid, p_detail jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.payroll_audit (actor, action, run_id, user_id, detail) values (auth.uid(), p_action, p_run, p_user, coalesce(p_detail, '{}'::jsonb));
$$;
revoke all on function public.payroll_log(text, uuid, uuid, jsonb) from public, anon, authenticated;

-- ---- settings ------------------------------------------------------------------------------------

create table if not exists public.payroll_settings (
  id boolean primary key default true check (id),
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- The engine's DEFAULT_PAYROLL_SETTINGS, plus the organisation's IDs.
insert into public.payroll_settings (id, doc) values (true, jsonb_build_object(
  'organisation', jsonb_build_object('name', 'Ortex Industries', 'pan', '', 'tan', '', 'pfCode', '', 'esiCode', '', 'lwfReg', '', 'address', ''),
  'schedule', jsonb_build_object('basis', 'actual', 'fixedDays', 26, 'payDay', 7),
  'epf', jsonb_build_object('enabled', true, 'employeeRate', 12, 'employerRate', 12, 'epsRate', 8.33, 'edliRate', 0.5,
                            'adminRate', 0.5, 'restrictToCeiling', true, 'includeEmployerInCtc', true,
                            'ceilings', jsonb_build_array(jsonb_build_object('from', '2014-09-01', 'amount', 15000))),
  'esi', jsonb_build_object('enabled', true, 'employeeRate', 0.75, 'employerRate', 3.25, 'grossCeiling', 21000),
  'lwf', jsonb_build_object('enabled', true, 'employee', 0.75, 'employer', 2.25, 'months', jsonb_build_array(6, 12)),
  'pt', jsonb_build_object('enabled', false),
  'tds', jsonb_build_object('enabled', true, 'defaultRegime', 'new'),
  'deductionCapPct', 50,
  'bank', jsonb_build_object('debitAccount', '', 'debitIfsc', '', 'bankName', '', 'narration', 'Salary',
                             'columns', jsonb_build_array('mode', 'debit_account', 'beneficiary_name', 'account_number', 'ifsc', 'amount', 'date', 'narration', 'email'))
)) on conflict (id) do nothing;

alter table public.payroll_settings enable row level security;
drop policy if exists payroll_settings_read on public.payroll_settings;
create policy payroll_settings_read on public.payroll_settings for select to authenticated using (public.is_payroll());
drop policy if exists payroll_settings_write on public.payroll_settings;
create policy payroll_settings_write on public.payroll_settings for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.payroll_settings_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists payroll_settings_stamp on public.payroll_settings;
create trigger payroll_settings_stamp before update on public.payroll_settings
  for each row execute function public.payroll_settings_stamp();

-- ---- components and templates --------------------------------------------------------------------

create table if not exists public.salary_components (
  code text primary key check (code ~ '^[A-Z][A-Z0-9_]{1,15}$'),
  name text not null,
  kind text not null default 'earning' check (kind in ('earning', 'deduction', 'reimbursement')),
  calc text not null default 'flat' check (calc in ('pct_ctc', 'pct_basic', 'flat', 'balance', 'variable')),
  value numeric(12,2) not null default 0,
  taxable boolean not null default true,
  -- Code on Wages: counts as "wages" (the PF / gratuity / bonus base).
  in_wages boolean not null default false,
  show_in_payslip boolean not null default true,
  active boolean not null default true,
  sort int not null default 0
);

insert into public.salary_components (code, name, kind, calc, value, taxable, in_wages, sort) values
  ('BASIC', 'Basic', 'earning', 'pct_ctc', 50, true, true, 1),
  ('HRA', 'House rent allowance', 'earning', 'pct_basic', 40, true, false, 2),
  ('CONV', 'Conveyance allowance', 'earning', 'flat', 1600, true, false, 3),
  ('FIXED', 'Fixed allowance', 'earning', 'balance', 0, true, true, 4),
  ('BONUS', 'Bonus', 'earning', 'variable', 0, true, false, 10),
  ('INCENTIVE', 'Incentive', 'earning', 'variable', 0, true, false, 11),
  ('OVERTIME', 'Overtime', 'earning', 'variable', 0, true, false, 12),
  ('ARREARS', 'Arrears', 'earning', 'variable', 0, true, false, 13),
  ('RECOVERY', 'Recovery', 'deduction', 'variable', 0, false, false, 20)
on conflict (code) do nothing;

create table if not exists public.salary_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  -- [{ code, name, calc, value, taxable, in_wages, kind }]
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.salary_templates (name, description, items) values
  ('Standard', 'Basic 50% of CTC, HRA 40% of Basic, conveyance ₹1,600, fixed allowance the balance',
   '[{"code":"BASIC","name":"Basic","kind":"earning","calc":"pct_ctc","value":50,"taxable":true,"in_wages":true},
     {"code":"HRA","name":"House rent allowance","kind":"earning","calc":"pct_basic","value":40,"taxable":true,"in_wages":false},
     {"code":"CONV","name":"Conveyance allowance","kind":"earning","calc":"flat","value":1600,"taxable":true,"in_wages":false},
     {"code":"FIXED","name":"Fixed allowance","kind":"earning","calc":"balance","value":0,"taxable":true,"in_wages":true}]'::jsonb),
  ('Minimum wage (all basic)', 'For workers paid close to the Delhi minimum wage: everything is basic',
   '[{"code":"BASIC","name":"Basic","kind":"earning","calc":"pct_ctc","value":100,"taxable":true,"in_wages":true}]'::jsonb)
on conflict (name) do nothing;

alter table public.salary_components enable row level security;
alter table public.salary_templates enable row level security;
drop policy if exists salary_components_read on public.salary_components;
create policy salary_components_read on public.salary_components for select to authenticated using (public.is_active_staff());
drop policy if exists salary_components_write on public.salary_components;
create policy salary_components_write on public.salary_components for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists salary_templates_read on public.salary_templates;
create policy salary_templates_read on public.salary_templates for select to authenticated using (public.is_payroll());
drop policy if exists salary_templates_write on public.salary_templates;
create policy salary_templates_write on public.salary_templates for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- employees -------------------------------------------------------------------------------------

create table if not exists public.employees (
  user_id uuid primary key references auth.users (id) on delete cascade,
  employee_code text unique,
  doj date,
  dob date,
  gender text check (gender in ('male', 'female', 'other')),
  father_name text,
  designation text,
  department text,
  work_location text,
  employment_type text not null default 'monthly' check (employment_type in ('monthly', 'daily')),
  pay_mode text not null default 'bank' check (pay_mode in ('bank', 'cheque', 'cash')),
  bank_name text,
  ifsc text check (ifsc is null or ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
  account_holder text,
  account_last4 text,
  account_enc bytea,
  pan_last4 text,
  pan_enc bytea,
  uan text check (uan is null or uan ~ '^[0-9]{12}$'),
  esi_ip text check (esi_ip is null or esi_ip ~ '^[0-9]{10}$'),
  pf_enabled boolean not null default true,
  esi_enabled boolean not null default false,
  lwf_enabled boolean not null default true,
  tds_enabled boolean not null default true,
  tax_regime text not null default 'new' check (tax_regime in ('new', 'old')),
  -- Old regime: the year's declared deductions (80C, 80D, HRA exemption...).
  tax_deductions numeric(12,2) not null default 0 check (tax_deductions >= 0),
  status text not null default 'active' check (status in ('active', 'exited', 'settled')),
  exit_date date,
  exit_reason text,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.employees enable row level security;
-- Payroll reads everyone; a person reads their own (the encrypted columns are
-- unreadable bytes to them, and the last four digits are theirs anyway).
drop policy if exists employees_read on public.employees;
create policy employees_read on public.employees for select to authenticated
  using (user_id = auth.uid() or public.is_payroll());

/**
 * Save a pay profile. Plain fields are copied; `pan` and `account_number`, when
 * present, are encrypted and only their last four digits kept in the clear.
 */
create or replace function public.payroll_employee_save(p_user uuid, p jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := public.payroll_key();
  v_pan text := upper(nullif(trim(coalesce(p ->> 'pan', '')), ''));
  v_acc text := nullif(regexp_replace(coalesce(p ->> 'account_number', ''), '\s', '', 'g'), '');
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can change a pay profile.';
  end if;
  if v_pan is not null and v_pan !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then
    raise exception 'That PAN is not valid (10 characters, like ABCDE1234F).';
  end if;
  if v_acc is not null and v_acc !~ '^[0-9]{6,18}$' then
    raise exception 'A bank account number is 6 to 18 digits.';
  end if;
  insert into public.employees (user_id) values (p_user) on conflict (user_id) do nothing;
  update public.employees set
    employee_code = coalesce(nullif(trim(p ->> 'employee_code'), ''), employee_code),
    doj = coalesce((p ->> 'doj')::date, doj),
    dob = case when p ? 'dob' then nullif(p ->> 'dob', '')::date else dob end,
    gender = case when p ? 'gender' then nullif(p ->> 'gender', '') else gender end,
    father_name = case when p ? 'father_name' then nullif(trim(p ->> 'father_name'), '') else father_name end,
    designation = case when p ? 'designation' then nullif(trim(p ->> 'designation'), '') else designation end,
    department = case when p ? 'department' then nullif(trim(p ->> 'department'), '') else department end,
    work_location = case when p ? 'work_location' then nullif(trim(p ->> 'work_location'), '') else work_location end,
    employment_type = coalesce(nullif(p ->> 'employment_type', ''), employment_type),
    pay_mode = coalesce(nullif(p ->> 'pay_mode', ''), pay_mode),
    bank_name = case when p ? 'bank_name' then nullif(trim(p ->> 'bank_name'), '') else bank_name end,
    ifsc = case when p ? 'ifsc' then upper(nullif(trim(p ->> 'ifsc'), '')) else ifsc end,
    account_holder = case when p ? 'account_holder' then nullif(trim(p ->> 'account_holder'), '') else account_holder end,
    account_enc = case when v_acc is not null then pgp_sym_encrypt(v_acc, k) else account_enc end,
    account_last4 = case when v_acc is not null then right(v_acc, 4) else account_last4 end,
    pan_enc = case when v_pan is not null then pgp_sym_encrypt(v_pan, k) else pan_enc end,
    pan_last4 = case when v_pan is not null then right(v_pan, 4) else pan_last4 end,
    uan = case when p ? 'uan' then nullif(trim(p ->> 'uan'), '') else uan end,
    esi_ip = case when p ? 'esi_ip' then nullif(trim(p ->> 'esi_ip'), '') else esi_ip end,
    pf_enabled = coalesce((p ->> 'pf_enabled')::boolean, pf_enabled),
    esi_enabled = coalesce((p ->> 'esi_enabled')::boolean, esi_enabled),
    lwf_enabled = coalesce((p ->> 'lwf_enabled')::boolean, lwf_enabled),
    tds_enabled = coalesce((p ->> 'tds_enabled')::boolean, tds_enabled),
    tax_regime = coalesce(nullif(p ->> 'tax_regime', ''), tax_regime),
    tax_deductions = coalesce((p ->> 'tax_deductions')::numeric, tax_deductions),
    status = coalesce(nullif(p ->> 'status', ''), status),
    exit_date = case when p ? 'exit_date' then nullif(p ->> 'exit_date', '')::date else exit_date end,
    exit_reason = case when p ? 'exit_reason' then nullif(trim(p ->> 'exit_reason'), '') else exit_reason end,
    notes = case when p ? 'notes' then nullif(trim(p ->> 'notes'), '') else notes end,
    updated_at = now(),
    updated_by = auth.uid()
  where user_id = p_user;
  -- Which fields changed, never their values.
  perform public.payroll_log('employee.save', null, p_user,
    jsonb_build_object('fields', (select jsonb_agg(k2) from jsonb_object_keys(p) k2)));
end $$;

/** The full PAN and account number, for payroll, logged every time. */
create or replace function public.payroll_employee_secrets(p_user uuid)
returns table (pan text, account_number text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := public.payroll_key();
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can see full bank and PAN details.';
  end if;
  perform public.payroll_log('employee.reveal', null, p_user, '{}'::jsonb);
  return query
  select case when e.pan_enc is null then null else pgp_sym_decrypt(e.pan_enc, k) end,
         case when e.account_enc is null then null else pgp_sym_decrypt(e.account_enc, k) end
    from public.employees e where e.user_id = p_user;
end $$;

-- ---- salary revisions -------------------------------------------------------------------------------

create table if not exists public.salary_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  effective_from date not null check (extract(day from effective_from) = 1),
  payout_month date not null check (extract(day from payout_month) = 1),
  annual_ctc numeric(14,2) not null check (annual_ctc >= 0),
  template_id uuid references public.salary_templates (id) on delete set null,
  -- Full-month earnings as computed from the CTC and template (engine
  -- structureFromCtc), kept so a later template change never rewrites them.
  earnings jsonb not null check (jsonb_typeof(earnings) = 'array'),
  monthly_gross numeric(12,2) not null,
  employer_pf_in_ctc numeric(12,2) not null default 0,
  reason text,
  arrears_paid boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (payout_month >= effective_from)
);
create index if not exists salary_revisions_user_idx on public.salary_revisions (user_id, effective_from desc);

alter table public.salary_revisions enable row level security;
drop policy if exists salary_revisions_read on public.salary_revisions;
create policy salary_revisions_read on public.salary_revisions for select to authenticated
  using (user_id = auth.uid() or public.is_payroll());
drop policy if exists salary_revisions_insert on public.salary_revisions;
create policy salary_revisions_insert on public.salary_revisions for insert to authenticated
  with check (public.is_payroll());
drop policy if exists salary_revisions_delete on public.salary_revisions;
create policy salary_revisions_delete on public.salary_revisions for delete to authenticated
  using (public.is_payroll() and not arrears_paid);

create or replace function public.salary_revisions_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    perform public.payroll_log('revision.add', null, new.user_id,
      jsonb_build_object('effective_from', new.effective_from, 'payout_month', new.payout_month));
    return new;
  end if;
  perform public.payroll_log('revision.delete', null, old.user_id, jsonb_build_object('effective_from', old.effective_from));
  return old;
end $$;
drop trigger if exists salary_revisions_log on public.salary_revisions;
create trigger salary_revisions_log before insert or delete on public.salary_revisions
  for each row execute function public.salary_revisions_log();

-- ---- pay runs and payslips ---------------------------------------------------------------------------

create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  kind text not null default 'regular' check (kind in ('regular', 'off_cycle', 'settlement')),
  title text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'paid', 'cancelled')),
  pay_date date,
  totals jsonb not null default '{}'::jsonb,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references auth.users (id) on delete set null,
  paid_at timestamptz,
  payment_mode text,
  payment_ref text
);
create unique index if not exists pay_runs_one_regular on public.pay_runs (month) where kind = 'regular' and status <> 'cancelled';

create table if not exists public.payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.pay_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'included' check (status in ('included', 'skipped', 'withheld')),
  -- The engine's computePayslip() output, plus the attendance and employee
  -- snapshot it was computed from (name, designation, PAN/account last 4, UAN).
  data jsonb not null,
  gross numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  released_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (run_id, user_id)
);
create index if not exists payslips_user_idx on public.payslips (user_id, released_at desc);

alter table public.pay_runs enable row level security;
alter table public.payslips enable row level security;
drop policy if exists pay_runs_read on public.pay_runs;
create policy pay_runs_read on public.pay_runs for select to authenticated using (public.is_payroll());
drop policy if exists payslips_read on public.payslips;
create policy payslips_read on public.payslips for select to authenticated
  using (public.is_payroll() or (user_id = auth.uid() and released_at is not null));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pay_runs') then
      alter publication supabase_realtime add table public.pay_runs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payslips') then
      alter publication supabase_realtime add table public.payslips;
    end if;
  end if;
end $$;

create or replace function public.payroll_run_create(p_month date, p_kind text default 'regular', p_title text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  cfg jsonb;
  m date := date_trunc('month', p_month)::date;
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can create a pay run.';
  end if;
  if p_kind = 'regular' and exists (select 1 from public.pay_runs where month = m and kind = 'regular' and status <> 'cancelled') then
    raise exception 'There is already a pay run for %.', to_char(m, 'FMMonth YYYY');
  end if;
  select doc into cfg from public.payroll_settings where id;
  insert into public.pay_runs (month, kind, title, pay_date, created_by)
  values (m, coalesce(p_kind, 'regular'), nullif(trim(coalesce(p_title, '')), ''),
          (m + interval '1 month')::date + (least(greatest(coalesce((cfg -> 'schedule' ->> 'payDay')::int, 7), 1), 28) - 1),
          auth.uid())
  returning id into v_id;
  perform public.payroll_log('run.create', v_id, null, jsonb_build_object('month', m, 'kind', p_kind));
  return v_id;
end $$;

/**
 * Save the computed payslips of a draft run (replacing what was there) and its
 * totals. `p_slips` is [{ user_id, status, data, gross, net_pay }].
 */
create or replace function public.payroll_run_save(p_run uuid, p_slips jsonb, p_totals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can change a pay run.';
  end if;
  select * into r from public.pay_runs where id = p_run for update;
  if not found or r.status <> 'draft' then
    raise exception 'Only a draft pay run can be changed. Recall it first.';
  end if;
  delete from public.payslips where run_id = p_run
     and user_id not in (select (s ->> 'user_id')::uuid from jsonb_array_elements(p_slips) s);
  insert into public.payslips (run_id, user_id, status, data, gross, net_pay, updated_at)
  select p_run, (s ->> 'user_id')::uuid, coalesce(s ->> 'status', 'included'), s -> 'data',
         coalesce((s ->> 'gross')::numeric, 0), coalesce((s ->> 'net_pay')::numeric, 0), now()
    from jsonb_array_elements(p_slips) s
  on conflict (run_id, user_id) do update
    set status = excluded.status, data = excluded.data, gross = excluded.gross, net_pay = excluded.net_pay, updated_at = now();
  update public.pay_runs set totals = coalesce(p_totals, '{}'::jsonb) where id = p_run;
  perform public.payroll_log('run.save', p_run, null, jsonb_build_object('payslips', jsonb_array_length(p_slips)));
end $$;

create or replace function public.payroll_run_transition(p_run uuid, p_action text, p_note text default null,
                                                         p_pay_date date default null, p_mode text default null, p_ref text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  s record;
  d jsonb;
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can do that.';
  end if;
  select * into r from public.pay_runs where id = p_run for update;
  if not found then
    raise exception 'That pay run no longer exists.';
  end if;

  if p_action = 'submit' then
    if r.status <> 'draft' then raise exception 'Only a draft can be submitted.'; end if;
    if not exists (select 1 from public.payslips where run_id = p_run) then
      raise exception 'Calculate the payslips first.';
    end if;
    update public.pay_runs set status = 'pending_approval', submitted_by = auth.uid(), submitted_at = now() where id = p_run;

  elsif p_action = 'approve' then
    if r.status <> 'pending_approval' then raise exception 'Only a submitted pay run can be approved.'; end if;
    -- A second pair of eyes, unless it is the Super Admin.
    if r.submitted_by = auth.uid() and not public.is_super_admin() then
      raise exception 'Someone other than the person who submitted it must approve, or the Super Admin.';
    end if;
    update public.pay_runs set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_run;

  elsif p_action = 'recall' then
    if r.status not in ('pending_approval', 'approved') then raise exception 'Only a submitted or approved run can be recalled.'; end if;
    update public.pay_runs set status = 'draft', approved_by = null, approved_at = null, submitted_by = null, submitted_at = null,
           note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note) where id = p_run;

  elsif p_action = 'pay' then
    if r.status <> 'approved' then raise exception 'Approve the pay run before recording payment.'; end if;
    update public.pay_runs set status = 'paid', paid_by = auth.uid(), paid_at = now(),
           pay_date = coalesce(p_pay_date, pay_date), payment_mode = nullif(trim(coalesce(p_mode, '')), ''),
           payment_ref = nullif(trim(coalesce(p_ref, '')), '') where id = p_run;
    -- Payslips reach their people; loans and claims are settled from them.
    update public.payslips set released_at = now() where run_id = p_run and status = 'included';
    for s in select * from public.payslips where run_id = p_run and status = 'included' loop
      for d in select * from jsonb_array_elements(coalesce(s.data -> 'deductions', '[]'::jsonb)) loop
        if d ->> 'code' = 'LOAN' and d ? 'loanId' then
          insert into public.loan_recoveries (loan_id, run_id, amount, note)
          values ((d ->> 'loanId')::uuid, p_run, (d ->> 'amount')::numeric, 'Pay run ' || to_char(r.month, 'Mon YYYY'));
        end if;
      end loop;
      for d in select * from jsonb_array_elements(coalesce(s.data -> 'reimbursements', '[]'::jsonb)) loop
        if d ? 'claimId' then
          update public.reimbursement_claims set status = 'paid', run_id = p_run where id = (d ->> 'claimId')::uuid;
        end if;
      end loop;
    end loop;
    -- Back-dated revisions paid out in this run are done.
    update public.salary_revisions v set arrears_paid = true
     where v.payout_month = r.month and v.effective_from < r.month
       and v.user_id in (select user_id from public.payslips where run_id = p_run and status = 'included');

  elsif p_action = 'cancel' then
    if r.status not in ('draft', 'pending_approval') then raise exception 'A paid or approved run cannot be cancelled.'; end if;
    update public.pay_runs set status = 'cancelled', note = coalesce(nullif(trim(coalesce(p_note, '')), ''), note) where id = p_run;
  else
    raise exception 'Unknown action %.', p_action;
  end if;

  perform public.payroll_log('run.' || p_action, p_run, null,
    jsonb_strip_nulls(jsonb_build_object('note', p_note, 'mode', p_mode, 'ref', p_ref)));
end $$;

/** Pay a withheld salary later: the payslip is released on its own. */
create or replace function public.payroll_release_withheld(p_slip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can release a salary.';
  end if;
  select p.*, r.status as run_status into s from public.payslips p join public.pay_runs r on r.id = p.run_id where p.id = p_slip;
  if not found or s.status <> 'withheld' or s.run_status <> 'paid' then
    raise exception 'Only a withheld salary in a paid run can be released.';
  end if;
  update public.payslips set status = 'included', released_at = now() where id = p_slip;
  perform public.payroll_log('payslip.release', s.run_id, s.user_id, '{}'::jsonb);
end $$;

/** The bank advice: full account numbers for a run's payable payslips, logged. */
create or replace function public.payroll_bank_details(p_run uuid)
returns table (user_id uuid, account_number text, ifsc text, account_holder text, bank_name text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  k text := public.payroll_key();
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can export bank details.';
  end if;
  if not exists (select 1 from public.pay_runs where id = p_run and status in ('approved', 'paid')) then
    raise exception 'The bank file is available once the pay run is approved.';
  end if;
  perform public.payroll_log('run.bank_file', p_run, null, '{}'::jsonb);
  return query
  select e.user_id,
         case when e.account_enc is null then null else pgp_sym_decrypt(e.account_enc, k) end,
         e.ifsc, e.account_holder, e.bank_name
    from public.employees e
   where e.user_id in (select p.user_id from public.payslips p where p.run_id = p_run and p.status = 'included');
end $$;

-- ---- loans ---------------------------------------------------------------------------------------

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Salary advance',
  amount numeric(12,2) not null check (amount > 0),
  instalment numeric(12,2) not null check (instalment > 0),
  start_month date not null check (extract(day from start_month) = 1),
  disbursed_on date,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.loan_recoveries (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans (id) on delete cascade,
  run_id uuid references public.pay_runs (id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  at timestamptz not null default now(),
  note text
);

alter table public.loans enable row level security;
alter table public.loan_recoveries enable row level security;
drop policy if exists loans_read on public.loans;
create policy loans_read on public.loans for select to authenticated using (user_id = auth.uid() or public.is_payroll());
drop policy if exists loans_write on public.loans;
create policy loans_write on public.loans for all to authenticated using (public.is_payroll()) with check (public.is_payroll());
drop policy if exists loan_recoveries_read on public.loan_recoveries;
create policy loan_recoveries_read on public.loan_recoveries for select to authenticated
  using (public.is_payroll() or exists (select 1 from public.loans l where l.id = loan_id and l.user_id = auth.uid()));
drop policy if exists loan_recoveries_write on public.loan_recoveries;
create policy loan_recoveries_write on public.loan_recoveries for insert to authenticated with check (public.is_payroll());

-- A loan closes itself once it is fully recovered.
create or replace function public.loan_close_when_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.loans l set status = 'closed'
   where l.id = new.loan_id and l.status <> 'closed'
     and (select coalesce(sum(amount), 0) from public.loan_recoveries where loan_id = l.id) >= l.amount;
  return new;
end $$;
drop trigger if exists loan_close_when_paid on public.loan_recoveries;
create trigger loan_close_when_paid after insert on public.loan_recoveries
  for each row execute function public.loan_close_when_paid();

-- ---- reimbursement claims -----------------------------------------------------------------------------

create table if not exists public.reimbursement_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (length(trim(category)) between 2 and 40),
  amount numeric(12,2) not null check (amount > 0 and amount <= 200000),
  bill_date date not null,
  description text,
  receipt_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  run_id uuid references public.pay_runs (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reimbursement_claims_user_idx on public.reimbursement_claims (user_id, created_at desc);

alter table public.reimbursement_claims enable row level security;
drop policy if exists reimbursement_claims_read on public.reimbursement_claims;
create policy reimbursement_claims_read on public.reimbursement_claims for select to authenticated
  using (user_id = auth.uid() or public.is_payroll());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('claim-receipts', 'claim-receipts', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];
drop policy if exists claim_receipts_insert on storage.objects;
create policy claim_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-receipts' and public.is_active_staff() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists claim_receipts_read on storage.objects;
create policy claim_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'claim-receipts' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_payroll()));

create or replace function public.claim_submit(p_category text, p_amount numeric, p_bill_date date, p_description text, p_receipt text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account.';
  end if;
  if p_bill_date > (now() at time zone 'Asia/Kolkata')::date or p_bill_date < (now() at time zone 'Asia/Kolkata')::date - 90 then
    raise exception 'Claim bills from the last 90 days.';
  end if;
  if p_receipt is not null and split_part(p_receipt, '/', 1) <> auth.uid()::text then
    raise exception 'That receipt is not yours.';
  end if;
  insert into public.reimbursement_claims (user_id, category, amount, bill_date, description, receipt_path)
  values (auth.uid(), trim(p_category), round(p_amount, 2), p_bill_date, nullif(trim(coalesce(p_description, '')), ''), p_receipt)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.claim_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can decide a claim.';
  end if;
  select * into c from public.reimbursement_claims where id = p_id for update;
  if not found or c.status <> 'pending' then
    raise exception 'That claim has already been decided.';
  end if;
  if c.user_id = auth.uid() then
    raise exception 'Someone else must decide your own claim.';
  end if;
  update public.reimbursement_claims
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;
  perform public.payroll_log(case when p_approve then 'claim.approve' else 'claim.reject' end, null, c.user_id,
    jsonb_build_object('amount', c.amount, 'category', c.category));
end $$;

create or replace function public.claim_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.reimbursement_claims set status = 'cancelled' where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'That claim can no longer be cancelled.';
  end if;
end $$;

-- ---- grants ---------------------------------------------------------------------------------------------

revoke all on function public.payroll_employee_save(uuid, jsonb) from public, anon;
revoke all on function public.payroll_employee_secrets(uuid) from public, anon;
revoke all on function public.payroll_run_create(date, text, text) from public, anon;
revoke all on function public.payroll_run_save(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.payroll_run_transition(uuid, text, text, date, text, text) from public, anon;
revoke all on function public.payroll_release_withheld(uuid) from public, anon;
revoke all on function public.payroll_bank_details(uuid) from public, anon;
revoke all on function public.claim_submit(text, numeric, date, text, text) from public, anon;
revoke all on function public.claim_decide(uuid, boolean, text) from public, anon;
revoke all on function public.claim_cancel(uuid) from public, anon;
grant execute on function public.payroll_employee_save(uuid, jsonb) to authenticated;
grant execute on function public.payroll_employee_secrets(uuid) to authenticated;
grant execute on function public.payroll_run_create(date, text, text) to authenticated;
grant execute on function public.payroll_run_save(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.payroll_run_transition(uuid, text, text, date, text, text) to authenticated;
grant execute on function public.payroll_release_withheld(uuid) to authenticated;
grant execute on function public.payroll_bank_details(uuid) to authenticated;
grant execute on function public.claim_submit(text, numeric, date, text, text) to authenticated;
grant execute on function public.claim_decide(uuid, boolean, text) to authenticated;
grant execute on function public.claim_cancel(uuid) to authenticated;

-- ---- a pay profile for every active member of staff -----------------------------------------------------

-- Joining date from the account's creation (the Super Admin corrects it).
insert into public.employees (user_id, doj)
select p.id, (p.created_at at time zone 'Asia/Kolkata')::date
  from public.profiles p
 where p.active
on conflict (user_id) do nothing;
