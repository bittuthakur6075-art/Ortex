-- 0036_leave.sql
--
-- LEAVE, phase 3 of the Attendance & Leave plan (docs/pm/ATTENDANCE_LEAVE_PLAN.md §2.7).
--
--   leave_types     the policy, the Super Admin's: EL 15 (1.25 a month, carry 30),
--                   CL 7 and SL 7 (granted each January, lapse at year end),
--                   CO (comp-off, granted by hand, expires in 60 days), LOP.
--   leave_ledger    EVERY change to a balance is a row: accrual, grant, taken,
--                   reversal, lapse, adjustment. A balance is the sum of its
--                   rows, so any figure can be explained line by line.
--   leave_requests  applied on either client, decided by an admin (never the
--                   requester). Days are counted by the SERVER: weekly offs and
--                   holidays are not leave, unless the sandwich rule is on and
--                   they sit between two leave days.
--
-- Approved leave marks attendance_days as L (paid) or LOP (unpaid); a half-day
-- leave halves that day's hour thresholds. Nobody writes these tables
-- directly: only the functions below, which is what keeps the ledger honest.
--
-- Jobs (pg_cron): EL accrues on the 1st of each month; on 1 January the old
-- year's CL/SL lapse, EL above its carry limit lapses (encashable), and the new
-- year's CL/SL are granted.

-- ---- policy -------------------------------------------------------------------------------

create table if not exists public.leave_types (
  code text primary key check (code ~ '^[A-Z]{2,4}$'),
  name text not null,
  annual numeric(5,2) not null default 0 check (annual >= 0),
  -- monthly: annual/12 on the 1st; upfront: all of it each January (pro-rated
  -- for joiners); manual: only by grant (comp-off); none: unlimited, unpaid.
  accrual text not null check (accrual in ('monthly', 'upfront', 'manual', 'none')),
  carry_max numeric(5,2) not null default 0 check (carry_max >= 0),
  half_day boolean not null default true,
  max_run int check (max_run is null or max_run > 0),
  notice_days int not null default 0 check (notice_days >= 0),
  doc_after_days int check (doc_after_days is null or doc_after_days >= 0),
  paid boolean not null default true,
  expires_days int check (expires_days is null or expires_days > 0),
  active boolean not null default true,
  sort int not null default 0
);

insert into public.leave_types (code, name, annual, accrual, carry_max, half_day, max_run, notice_days, doc_after_days, paid, expires_days, sort) values
  ('EL',  'Earned leave',  15, 'monthly', 30, true, null, 7, null, true,  null, 1),
  ('CL',  'Casual leave',   7, 'upfront',  0, true, 3,    0, null, true,  null, 2),
  ('SL',  'Sick leave',     7, 'upfront',  0, true, null, 0, 3,    true,  null, 3),
  ('CO',  'Comp-off',       0, 'manual',   0, true, null, 0, null, true,  60,   4),
  ('LOP', 'Loss of pay',    0, 'none',     0, true, null, 0, null, false, null, 5)
on conflict (code) do nothing;

alter table public.leave_types enable row level security;
drop policy if exists leave_types_read on public.leave_types;
create policy leave_types_read on public.leave_types for select to authenticated using (public.is_active_staff());
drop policy if exists leave_types_super_write on public.leave_types;
create policy leave_types_super_write on public.leave_types for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The sandwich rule: off by default (§2.7).
update public.attendance_settings set doc = doc || '{"sandwich": false}'::jsonb where id and not (doc ? 'sandwich');

-- ---- the ledger --------------------------------------------------------------------------------

create table if not exists public.leave_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type_code text not null references public.leave_types (code),
  delta numeric(6,2) not null,
  reason text not null check (reason in ('accrual', 'grant', 'taken', 'reversal', 'lapse', 'adjust')),
  -- '2026-09' for a monthly accrual, '2026' for a yearly grant or lapse: with
  -- the unique index below, a job run twice never counts twice.
  period text,
  ref_id uuid,
  note text,
  at timestamptz not null default now(),
  by_user uuid references auth.users (id) on delete set null
);

create index if not exists leave_ledger_user_idx on public.leave_ledger (user_id, type_code, at desc);
create unique index if not exists leave_ledger_period_once
  on public.leave_ledger (user_id, type_code, reason, period) where period is not null;

alter table public.leave_ledger enable row level security;
drop policy if exists leave_ledger_read on public.leave_ledger;
create policy leave_ledger_read on public.leave_ledger for select to authenticated
  using (user_id = auth.uid() or public.has_module_access('attendance-team'));

-- ---- requests ----------------------------------------------------------------------------------

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type_code text not null references public.leave_types (code),
  from_day date not null,
  to_day date not null,
  -- 'second': the first day starts after lunch. 'first': the last day ends at lunch.
  from_half text not null default 'full' check (from_half in ('full', 'second')),
  to_half text not null default 'full' check (to_half in ('full', 'first')),
  days numeric(5,1) not null check (days > 0),
  sandwich boolean not null default false,
  reason text not null check (length(trim(reason)) between 3 and 500),
  attachment_path text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (to_day >= from_day)
);

create index if not exists leave_requests_user_idx on public.leave_requests (user_id, from_day desc);
create index if not exists leave_requests_range_idx on public.leave_requests (from_day, to_day) where status in ('pending', 'approved');

alter table public.leave_requests enable row level security;
drop policy if exists leave_requests_read on public.leave_requests;
create policy leave_requests_read on public.leave_requests for select to authenticated
  using (user_id = auth.uid() or public.has_module_access('attendance-team'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_requests') then
      alter publication supabase_realtime add table public.leave_requests;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leave_ledger') then
      alter publication supabase_realtime add table public.leave_ledger;
    end if;
  end if;
end $$;

-- Medical certificates and the like. Private; you upload into your own folder,
-- you and the attendance readers can view.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-documents', 'leave-documents', false, 5242880, array['image/jpeg', 'image/png', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'application/pdf'];

drop policy if exists leave_documents_insert on storage.objects;
create policy leave_documents_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-documents' and public.is_active_staff()
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists leave_documents_read on storage.objects;
create policy leave_documents_read on storage.objects for select to authenticated
  using (bucket_id = 'leave-documents'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.has_module_access('attendance-team')));

-- ---- attendance days learn about leave -----------------------------------------------------------

alter table public.attendance_days add column if not exists leave_type text;
alter table public.attendance_days add column if not exists leave_fraction numeric(2,1) not null default 0;

/** Is a day a weekly off or a holiday, by the current rules? */
create or replace function public.attendance_is_off_day(p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.holidays h where h.day = p_day and h.active and h.kind <> 'optional')
      or coalesce(
           (select (s.doc -> 'weeklyOff') @> to_jsonb(extract(dow from p_day)::int) from public.attendance_settings s where s.id),
           extract(dow from p_day) = 0);
$$;

/**
 * Leave days between two dates, the way payroll counts them. A weekly off or
 * holiday is not leave, unless the sandwich rule is on and it sits strictly
 * inside the range. Half days take 0.5 off the first and/or last day.
 */
create or replace function public.leave_days_between(p_from date, p_to date, p_from_half text, p_to_half text, p_sandwich boolean)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  d date := p_from;
  n numeric := 0;
  off boolean;
begin
  if p_to < p_from then
    return 0;
  end if;
  while d <= p_to loop
    off := public.attendance_is_off_day(d);
    if not off or (p_sandwich and d > p_from and d < p_to) then
      n := n + 1
        - case when d = p_from and p_from_half = 'second' then 0.5 else 0 end
        - case when d = p_to and p_to_half = 'first' then 0.5 else 0 end;
    end if;
    d := d + 1;
  end loop;
  return greatest(n, 0);
end $$;

-- The same day rules as 0034, with leave: a full day of approved leave is L
-- (or LOP when the type is unpaid) unless they clocked in anyway; a half day
-- of leave halves the thresholds for the half they worked.
create or replace function public.attendance_recompute_day(p_user uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  tz text;
  today date;
  prof record;
  is_holiday boolean;
  is_off boolean;
  saturday_half boolean;
  shift_start timestamptz;
  shift_end timestamptz;
  shift_min numeric;
  grace int;
  half_below numeric;
  absent_below numeric;
  auto_close int;
  p record;
  lv record;
  leave_frac numeric := 0;
  leave_code text;
  leave_paid boolean := true;
  open_at timestamptz;
  worked numeric := 0;
  v_first timestamptz;
  v_last timestamptz;
  any_punch boolean := false;
  all_field boolean := true;
  v_status text;
  v_late boolean := false;
  v_late_min int := 0;
  v_flags text[] := '{}';
  v_open_past boolean := false;
begin
  if public.attendance_month_locked(p_day) then
    return;
  end if;

  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
  today := (now() at time zone tz)::date;
  if p_day > today then
    delete from public.attendance_days where user_id = p_user and day = p_day;
    return;
  end if;

  select id, active, created_at into prof from public.profiles where id = p_user;
  if not found then
    return;
  end if;

  is_holiday := exists (select 1 from public.holidays h where h.day = p_day and h.active and h.kind <> 'optional');
  is_off := coalesce((cfg -> 'weeklyOff') @> to_jsonb(extract(dow from p_day)::int), extract(dow from p_day) = 0);
  saturday_half := extract(dow from p_day) = 6 and coalesce(cfg ->> 'saturday', 'full') = 'half';

  -- Approved leave covering this day. An off day counts only if the request
  -- was counted with the sandwich rule.
  select r.type_code, r.from_day, r.to_day, r.from_half, r.to_half, r.sandwich, t.paid
    into lv
    from public.leave_requests r join public.leave_types t on t.code = r.type_code
   where r.user_id = p_user and r.status = 'approved' and p_day between r.from_day and r.to_day
   order by r.created_at desc limit 1;
  if found and (not (is_holiday or is_off) or (lv.sandwich and p_day > lv.from_day and p_day < lv.to_day)) then
    leave_code := lv.type_code;
    leave_paid := lv.paid;
    leave_frac := 1
      - case when p_day = lv.from_day and lv.from_half = 'second' then 0.5 else 0 end
      - case when p_day = lv.to_day and lv.to_half = 'first' then 0.5 else 0 end;
  end if;

  shift_start := public.attendance_at(p_day, cfg -> 'shift' ->> 'start', tz);
  shift_end := public.attendance_at(p_day, cfg -> 'shift' ->> 'end', tz);
  if shift_end <= shift_start then
    shift_end := shift_end + interval '1 day';
  end if;
  shift_min := extract(epoch from (shift_end - shift_start)) / 60;
  if saturday_half then
    shift_min := shift_min / 2;
    shift_end := shift_start + make_interval(mins => shift_min::int);
  end if;
  grace := coalesce((cfg ->> 'graceMin')::int, 15);
  half_below := coalesce((cfg ->> 'halfDayBelowMin')::numeric, 270)
    * case when saturday_half then 0.5 else 1 end * case when leave_frac = 0.5 then 0.5 else 1 end;
  absent_below := coalesce((cfg ->> 'absentBelowMin')::numeric, 120)
    * case when saturday_half then 0.5 else 1 end * case when leave_frac = 0.5 then 0.5 else 1 end;
  auto_close := coalesce((cfg ->> 'autoCloseAfterMin')::int, 240);

  for p in
    select kind, at, mode from public.attendance_punches
     where user_id = p_user and day = p_day and review <> 'rejected'
     order by at
  loop
    any_punch := true;
    if p.mode <> 'field' then all_field := false; end if;
    if p.kind = 'in' then
      if open_at is null then open_at := p.at; end if;
      if v_first is null then v_first := p.at; end if;
    elsif open_at is not null then
      worked := worked + extract(epoch from (p.at - open_at)) / 60;
      open_at := null;
      v_last := p.at;
    end if;
  end loop;

  if open_at is not null then
    if p_day < today or now() > shift_end + make_interval(mins => auto_close) then
      v_open_past := true;
    else
      worked := worked + extract(epoch from (now() - open_at)) / 60;
    end if;
  end if;

  if not any_punch then
    if leave_frac = 1 then
      -- On leave the whole day: counts as leave, today included.
      v_status := case when leave_paid then 'L' else 'LOP' end;
    elsif leave_frac = 0.5 and p_day < today then
      -- Half a day of leave and no work: half the day is paid (paid leave),
      -- the other half missed.
      v_status := case when leave_paid then 'HD' else 'A' end;
      v_flags := array_append(v_flags, 'half_leave');
    elsif p_day >= today then
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      return;
    elsif p_day < (prof.created_at at time zone tz)::date or prof.active is not true then
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      return;
    else
      v_status := case when is_holiday then 'H' when is_off then 'WO' else 'A' end;
    end if;
  else
    if v_first is not null and v_first > shift_start + make_interval(mins => grace)
       and not is_holiday and not is_off and leave_frac = 0 then
      v_late := true;
      v_late_min := ceil(extract(epoch from (v_first - shift_start)) / 60)::int;
    end if;
    if is_holiday or is_off then
      v_flags := array_append(v_flags, 'worked_off_day');
    end if;
    if leave_frac = 1 then
      v_flags := array_append(v_flags, 'worked_on_leave');
    elsif leave_frac = 0.5 then
      v_flags := array_append(v_flags, 'half_leave');
    end if;
    if v_open_past then
      v_status := 'MP';
    elsif worked < absent_below and p_day < today then
      v_status := case when leave_frac = 0.5 and leave_paid then 'HD' else 'A' end;
      v_flags := array_append(v_flags, 'short_hours');
    elsif worked < half_below and p_day < today then
      v_status := case when leave_frac = 0.5 and leave_paid then 'P' else 'HD' end;
    else
      v_status := case when all_field then 'OD' else 'P' end;
    end if;
  end if;

  insert into public.attendance_days as d (user_id, day, status, first_in, last_out, worked_min, late, late_min, flags,
                                            leave_type, leave_fraction, computed_at)
  values (p_user, p_day, v_status, v_first, v_last, round(worked)::int, v_late, v_late_min, v_flags,
          leave_code, leave_frac, now())
  on conflict (user_id, day) do update
    set status = excluded.status, first_in = excluded.first_in, last_out = excluded.last_out,
        worked_min = excluded.worked_min, late = excluded.late, late_min = excluded.late_min,
        flags = excluded.flags, leave_type = excluded.leave_type, leave_fraction = excluded.leave_fraction,
        computed_at = excluded.computed_at;
end $$;

/** Recompute every past-or-today day a request covers. */
create or replace function public.leave_recompute_range(p_user uuid, p_from date, p_to date)
returns void language plpgsql security definer set search_path = public as $$
declare
  d date := p_from;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  while d <= least(p_to, today) loop
    perform public.attendance_recompute_day(p_user, d);
    d := d + 1;
  end loop;
end $$;

-- ---- balances ---------------------------------------------------------------------------------

/**
 * One row per leave type for a person: balance (the ledger), pending (asked,
 * not decided), available (balance less pending), taken this year.
 */
create or replace function public.leave_balances(p_user uuid default null)
returns table (code text, name text, balance numeric, pending numeric, available numeric, taken_year numeric,
               paid boolean, half_day boolean, accrual text, annual numeric, sort int)
language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := coalesce(p_user, auth.uid());
begin
  if uid is null or (uid <> auth.uid() and not public.has_module_access('attendance-team')) then
    raise exception 'You cannot see that person''s leave.';
  end if;
  return query
  select t.code, t.name,
         coalesce((select sum(l.delta) from public.leave_ledger l where l.user_id = uid and l.type_code = t.code), 0),
         coalesce((select sum(r.days) from public.leave_requests r where r.user_id = uid and r.type_code = t.code and r.status = 'pending'), 0),
         coalesce((select sum(l.delta) from public.leave_ledger l where l.user_id = uid and l.type_code = t.code), 0)
           - coalesce((select sum(r.days) from public.leave_requests r where r.user_id = uid and r.type_code = t.code and r.status = 'pending'), 0),
         coalesce((select -sum(l.delta) from public.leave_ledger l
                    where l.user_id = uid and l.type_code = t.code and l.reason in ('taken', 'reversal')
                      and l.at >= date_trunc('year', now() at time zone 'Asia/Kolkata')), 0),
         t.paid, t.half_day, t.accrual, t.annual, t.sort
    from public.leave_types t
   where t.active
   order by t.sort;
end $$;

-- ---- apply / decide / cancel --------------------------------------------------------------------

create or replace function public.leave_apply(
  p_type text, p_from date, p_to date, p_from_half text, p_to_half text, p_reason text, p_attachment text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  t record;
  cfg jsonb;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  sandwich boolean;
  v_days numeric;
  v_run int;
  avail numeric;
  v_id uuid;
  d date;
begin
  if uid is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account.';
  end if;
  select * into t from public.leave_types where code = p_type and active;
  if not found then
    raise exception 'That leave type is not available.';
  end if;
  p_from_half := coalesce(p_from_half, 'full');
  p_to_half := coalesce(p_to_half, 'full');
  if p_to < p_from then
    raise exception 'The last day is before the first day.';
  end if;
  if p_from = p_to and p_from_half = 'second' and p_to_half = 'first' then
    raise exception 'Choose either the morning or the afternoon for a single half day.';
  end if;
  if (p_from_half <> 'full' or p_to_half <> 'full') and not t.half_day then
    raise exception '% cannot be taken as a half day.', t.name;
  end if;
  if p_from < today - 30 then
    raise exception 'Leave can be applied at most 30 days after it was taken.';
  end if;
  if t.notice_days > 0 and p_from > today and p_from < today + t.notice_days then
    raise exception '% needs % days'' notice.', t.name, t.notice_days;
  end if;
  if p_to - p_from > 60 then
    raise exception 'A single request can cover at most two months.';
  end if;
  d := p_from;
  while d <= p_to loop
    if public.attendance_month_locked(d) then
      raise exception 'Attendance for % is locked for payroll.', to_char(d, 'FMMonth YYYY');
    end if;
    d := (date_trunc('month', d) + interval '1 month')::date;
  end loop;
  if exists (select 1 from public.leave_requests r
              where r.user_id = uid and r.status in ('pending', 'approved')
                and r.from_day <= p_to and r.to_day >= p_from) then
    raise exception 'You already have leave on some of those days.';
  end if;

  select doc into cfg from public.attendance_settings where id;
  sandwich := coalesce((cfg ->> 'sandwich')::boolean, false);
  v_days := public.leave_days_between(p_from, p_to, p_from_half, p_to_half, sandwich);
  if v_days <= 0 then
    raise exception 'Those days are all weekly offs or holidays.';
  end if;
  v_run := (p_to - p_from) + 1;
  if t.max_run is not null and v_days > t.max_run then
    raise exception '% can be at most % days in a row.', t.name, t.max_run;
  end if;
  if t.doc_after_days is not null and v_days > t.doc_after_days and nullif(trim(coalesce(p_attachment, '')), '') is null then
    raise exception 'Attach a certificate for % longer than % days.', lower(t.name), t.doc_after_days;
  end if;
  if p_attachment is not null and split_part(p_attachment, '/', 1) <> uid::text then
    raise exception 'That attachment is not yours.';
  end if;
  if t.accrual <> 'none' then
    select b.available into avail from public.leave_balances(uid) b where b.code = t.code;
    if coalesce(avail, 0) < v_days then
      raise exception 'Only % days of % left. Apply for fewer days, or for loss of pay.', coalesce(avail, 0), lower(t.name);
    end if;
  end if;

  insert into public.leave_requests (user_id, type_code, from_day, to_day, from_half, to_half, days, sandwich, reason, attachment_path)
  values (uid, t.code, p_from, p_to, p_from_half, p_to_half, v_days,
          sandwich and v_days > public.leave_days_between(p_from, p_to, p_from_half, p_to_half, false),
          trim(p_reason), nullif(trim(coalesce(p_attachment, '')), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'days', v_days);
end $$;

create or replace function public.leave_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  t record;
  avail numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decide leave.';
  end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'That request has already been decided.';
  end if;
  if r.user_id = auth.uid() then
    raise exception 'Another admin must decide your own leave.';
  end if;
  select * into t from public.leave_types where code = r.type_code;
  if p_approve and t.accrual <> 'none' then
    -- Available already excludes this request's own pending days; add them back.
    select b.available + r.days into avail from public.leave_balances(r.user_id) b where b.code = r.type_code;
    if coalesce(avail, 0) < r.days then
      raise exception 'Not enough % left to approve this (% available).', lower(t.name), coalesce(avail, 0);
    end if;
  end if;
  update public.leave_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;
  if p_approve then
    if t.accrual <> 'none' then
      insert into public.leave_ledger (user_id, type_code, delta, reason, ref_id, note, by_user)
      values (r.user_id, r.type_code, -r.days, 'taken', r.id,
              to_char(r.from_day, 'DD Mon') || case when r.to_day > r.from_day then ' to ' || to_char(r.to_day, 'DD Mon') else '' end,
              auth.uid());
    end if;
    perform public.leave_recompute_range(r.user_id, r.from_day, r.to_day);
  end if;
end $$;

/**
 * Withdraw a request. The person may cancel their own pending request, or
 * their own approved leave that has not started; an admin may cancel any
 * approved leave (for someone else). Approved leave gives the days back.
 */
create or replace function public.leave_cancel(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  t record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or r.status not in ('pending', 'approved') then
    raise exception 'That request can no longer be cancelled.';
  end if;
  if r.user_id = auth.uid() then
    if r.status = 'approved' and r.from_day <= today then
      raise exception 'Leave that has started can only be cancelled by an admin.';
    end if;
  elsif not public.is_admin() then
    raise exception 'You cannot cancel someone else''s leave.';
  end if;
  if exists (select 1 from public.attendance_months m
              where m.month between date_trunc('month', r.from_day)::date and date_trunc('month', r.to_day)::date) then
    raise exception 'Some of that leave is in a month locked for payroll.';
  end if;
  update public.leave_requests
     set status = 'cancelled', decided_by = coalesce(decided_by, auth.uid()), decided_at = coalesce(decided_at, now()),
         decision_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), decision_note)
   where id = p_id;
  if r.status = 'approved' then
    select * into t from public.leave_types where code = r.type_code;
    if t.accrual <> 'none' then
      insert into public.leave_ledger (user_id, type_code, delta, reason, ref_id, note, by_user)
      values (r.user_id, r.type_code, r.days, 'reversal', r.id, 'Cancelled', auth.uid());
    end if;
    perform public.leave_recompute_range(r.user_id, r.from_day, r.to_day);
  end if;
end $$;

/** The Super Admin's hand on a balance: opening balances, comp-off, corrections. */
create or replace function public.leave_adjust(p_user uuid, p_type text, p_delta numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can adjust leave balances.';
  end if;
  if p_delta = 0 or abs(p_delta) > 60 then
    raise exception 'Adjust by between 0.5 and 60 days.';
  end if;
  if length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why (for example: opening balance, comp-off for 2 Oct).';
  end if;
  if not exists (select 1 from public.leave_types where code = p_type and accrual <> 'none') then
    raise exception 'That leave type has no balance.';
  end if;
  insert into public.leave_ledger (user_id, type_code, delta, reason, note, by_user)
  values (p_user, p_type, round(p_delta * 2) / 2, case when p_delta > 0 and p_type = 'CO' then 'grant' else 'adjust' end,
          trim(p_note), auth.uid());
end $$;

-- ---- the jobs -----------------------------------------------------------------------------------

/** EL (and any monthly type) for one month, for everyone who had joined by its end. */
create or replace function public.leave_accrue_month(p_month date)
returns int language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  n int := 0;
begin
  insert into public.leave_ledger (user_id, type_code, delta, reason, period, note)
  select p.id, t.code, round(t.annual / 12, 2), 'accrual', to_char(m, 'YYYY-MM'), 'Accrued for ' || to_char(m, 'FMMonth YYYY')
    from public.profiles p cross join public.leave_types t
   where p.active and t.active and t.accrual = 'monthly' and t.annual > 0
     and (p.created_at at time zone 'Asia/Kolkata')::date < (m + interval '1 month')::date
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/** A year's upfront types (CL, SL), pro-rated by the month someone joined. */
create or replace function public.leave_grant_year(p_year int)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  insert into public.leave_ledger (user_id, type_code, delta, reason, period, note)
  select p.id, t.code,
         -- Joined this year: the months left, rounded down to a half day.
         floor(t.annual * (12 - case when extract(year from p.created_at at time zone 'Asia/Kolkata') = p_year
                                     then extract(month from p.created_at at time zone 'Asia/Kolkata') - 1 else 0 end) / 12 * 2) / 2,
         'grant', p_year::text, 'Granted for ' || p_year
    from public.profiles p cross join public.leave_types t
   where p.active and t.active and t.accrual = 'upfront' and t.annual > 0
     and extract(year from p.created_at at time zone 'Asia/Kolkata') <= p_year
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

/**
 * Close a leave year: every type lapses what is above its carry limit (all of
 * it for CL and SL; EL above 30, noted as encashable).
 */
create or replace function public.leave_close_year(p_year int)
returns int language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  insert into public.leave_ledger (user_id, type_code, delta, reason, period, note)
  select b.user_id, b.type_code, -(b.bal - t.carry_max), 'lapse', p_year::text,
         case when t.carry_max > 0 then 'Above the carry-forward limit of ' || t.carry_max || ' days: encashable'
              else 'Lapsed at the end of ' || p_year end
    from (select l.user_id, l.type_code, sum(l.delta) as bal from public.leave_ledger l group by 1, 2) b
    join public.leave_types t on t.code = b.type_code
   where t.accrual in ('monthly', 'upfront') and b.bal > t.carry_max
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.leave_accrue_month(date) from public, anon, authenticated;
revoke all on function public.leave_grant_year(int) from public, anon, authenticated;
revoke all on function public.leave_close_year(int) from public, anon, authenticated;
revoke all on function public.leave_recompute_range(uuid, date, date) from public, anon, authenticated;
revoke all on function public.leave_days_between(date, date, text, text, boolean) from public, anon;
revoke all on function public.leave_balances(uuid) from public, anon;
revoke all on function public.leave_apply(text, date, date, text, text, text, text) from public, anon;
revoke all on function public.leave_decide(uuid, boolean, text) from public, anon;
revoke all on function public.leave_cancel(uuid, text) from public, anon;
revoke all on function public.leave_adjust(uuid, text, numeric, text) from public, anon;
grant execute on function public.leave_days_between(date, date, text, text, boolean) to authenticated;
grant execute on function public.leave_balances(uuid) to authenticated;
grant execute on function public.leave_apply(text, date, date, text, text, text, text) to authenticated;
grant execute on function public.leave_decide(uuid, boolean, text) to authenticated;
grant execute on function public.leave_cancel(uuid, text) to authenticated;
grant execute on function public.leave_adjust(uuid, text, numeric, text) to authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('leave-accrue-month', 'leave-new-year');
  -- 1st of each month, 00:20 IST (18:50 UTC on the last day of the month
  -- before; pg_cron's "$" is the last day), after the year close at 00:15.
  perform cron.schedule('leave-accrue-month', '50 18 $ * *',
    $job$ select public.leave_accrue_month(((now() at time zone 'Asia/Kolkata')::date)) $job$);
  -- 1 January, 00:15 IST (18:45 UTC on 31 December): close the old year, open the new.
  perform cron.schedule('leave-new-year', '45 18 31 12 *', $job$
    select public.leave_close_year(extract(year from (now() at time zone 'Asia/Kolkata'))::int - 1),
           public.leave_grant_year(extract(year from (now() at time zone 'Asia/Kolkata'))::int)
  $job$);
exception when others then
  raise warning 'leave: jobs not scheduled (%). Run leave_accrue_month / leave_grant_year by hand.', sqlerrm;
end $$;

-- ---- opening balances ------------------------------------------------------------------------------

-- Leave tracking starts NOW, not in January: this year's CL and SL are
-- granted for the months left from this one (September to December is 4/12 of
-- the year), and EL accrues from this month. Anything earned before is the
-- Super Admin's to enter as an opening balance (leave_adjust).
do $$
declare
  y int := extract(year from (now() at time zone 'Asia/Kolkata'))::int;
  mo int := extract(month from (now() at time zone 'Asia/Kolkata'))::int;
begin
  insert into public.leave_ledger (user_id, type_code, delta, reason, period, note)
  select p.id, t.code,
         floor(t.annual * (12 - greatest(mo,
               case when extract(year from p.created_at at time zone 'Asia/Kolkata') = y
                    then extract(month from p.created_at at time zone 'Asia/Kolkata')::int else 1 end) + 1) / 12 * 2) / 2,
         'grant', y::text, 'Opening grant for the rest of ' || y
    from public.profiles p cross join public.leave_types t
   where p.active and t.active and t.accrual = 'upfront' and t.annual > 0
  on conflict do nothing;
  perform public.leave_accrue_month((now() at time zone 'Asia/Kolkata')::date);
end $$;
