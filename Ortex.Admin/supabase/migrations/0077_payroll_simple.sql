-- 0077_payroll_simple.sql
--
-- Payroll simplified (owner's decision 2026-10-03, docs/pm/PAYROLL_PLAN.md):
-- no PF, ESI, professional tax, TDS, LWF, salary components or reimbursement
-- claims. A person is paid one of two ways, both in the monthly run:
--
--   * monthly: one salary, prorated by paid days (attendance's payable days);
--   * daily:   one daily rate x days worked (P and OD = 1, HD = 0.5 on the
--              effective status; weekly offs, holidays and leave are not paid).
--
-- Nothing is dropped: old revisions, payslips (with their statutory lines),
-- claims and settings stay as they are and stay readable.
--
--   1. salary_revisions.pay_type / daily_rate. A revision written before this
--      has no pay_type and is read as monthly at the sum of its earnings (the
--      gross), in the console (payTermsOf in lib/payroll.js).
--   2. payroll_days_worked(month): the days a daily-wage person worked, for
--      payroll. attendance_days is readable only by attendance-team or its
--      owner, and a payroll user may have neither.
--   3. claim_submit refuses: claims are no longer taken (an older phone app
--      still has the screen). Claims already sent are kept.

-- ---- 1. pay type on the revision ---------------------------------------------------------------

alter table public.salary_revisions add column if not exists pay_type text
  check (pay_type is null or pay_type in ('monthly', 'daily'));
alter table public.salary_revisions add column if not exists daily_rate numeric(12,2)
  check (daily_rate is null or daily_rate > 0);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'salary_revisions_daily_has_rate') then
    alter table public.salary_revisions add constraint salary_revisions_daily_has_rate
      check (pay_type is distinct from 'daily' or daily_rate is not null);
  end if;
end $$;

-- ---- 2. days worked, for daily wages ---------------------------------------------------------------

/**
 * One row per day a person worked in the month: the effective status
 * (override, else computed) when it is P, OD or HD. The console weighs them
 * (P / OD 1, HD 0.5) and keeps only the employed span.
 */
create or replace function public.payroll_days_worked(p_month date)
returns table (user_id uuid, day date, status text)
language plpgsql stable security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
begin
  if not public.is_payroll() then
    raise exception 'Only payroll can read days worked.';
  end if;
  return query
  select a.user_id, a.day, coalesce(a.override_status, a.status)
    from public.attendance_days a
   where a.day >= m and a.day < (m + interval '1 month')::date
     and coalesce(a.override_status, a.status) in ('P', 'OD', 'HD')
   order by a.user_id, a.day;
end $$;

revoke all on function public.payroll_days_worked(date) from public, anon;
grant execute on function public.payroll_days_worked(date) to authenticated;

-- ---- 3. no new claims ---------------------------------------------------------------------------------

create or replace function public.claim_submit(p_category text, p_amount numeric, p_bill_date date, p_description text, p_receipt text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Reimbursement claims are no longer taken in the app. Ask payroll.';
end $$;
