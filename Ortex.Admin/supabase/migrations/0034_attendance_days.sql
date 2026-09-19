-- 0034_attendance_days.sql
--
-- ATTENDANCE, phase 2: what each day COUNTS as (docs/pm/ATTENDANCE_LEAVE_PLAN.md §2.6).
--
--   attendance_days    one row per person per day: P · HD · A · OD · WO · H · MP
--                      (L and LOP arrive with leave), first in, last out, minutes
--                      worked, late mark. Computed, never typed: only the
--                      functions below write it.
--   holidays           the company calendar, the Super Admin's.
--   regularisations    "I forgot to clock out" / "the time is wrong": asked on
--                      the phone, decided by an admin, applied as punches.
--   attendance_months  the payroll lock. A locked month never changes again,
--                      short of the Super Admin unlocking it with a reason.
--
-- The day rules read attendance_settings (0033), so the Super Admin's changes
-- apply to every day computed after them. Nothing here marks attendance for
-- anyone: a correction is the person's own request, and an override is the
-- Super Admin's, both logged.
--
-- A nightly pg_cron job closes the previous day for everyone; a second one
-- deletes selfies older than the retention setting through the
-- attendance-housekeeping Edge Function (Storage files can only be removed
-- through the Storage API), authorised by a secret the database generates for
-- itself in Vault, so nothing secret is written here.

-- ---- holidays -----------------------------------------------------------------------------

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  name text not null check (length(trim(name)) between 1 and 80),
  kind text not null default 'festival' check (kind in ('national', 'festival', 'optional')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.holidays enable row level security;

drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using (public.is_active_staff());

drop policy if exists holidays_super_write on public.holidays;
create policy holidays_super_write on public.holidays for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- The three national holidays every Delhi establishment must give, for this
-- year and the next. Festivals are the Super Admin's to add.
insert into public.holidays (day, name, kind) values
  ('2026-01-26', 'Republic Day', 'national'),
  ('2026-08-15', 'Independence Day', 'national'),
  ('2026-10-02', 'Gandhi Jayanti', 'national'),
  ('2027-01-26', 'Republic Day', 'national'),
  ('2027-08-15', 'Independence Day', 'national'),
  ('2027-10-02', 'Gandhi Jayanti', 'national')
on conflict (day) do nothing;

-- ---- the payroll lock ------------------------------------------------------------------------

create table if not exists public.attendance_months (
  month date primary key check (extract(day from month) = 1),
  locked_by uuid references auth.users (id) on delete set null,
  locked_at timestamptz not null default now(),
  note text
);

alter table public.attendance_months enable row level security;

drop policy if exists attendance_months_read on public.attendance_months;
create policy attendance_months_read on public.attendance_months for select to authenticated
  using (public.is_active_staff());

create or replace function public.attendance_month_locked(p_day date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.attendance_months where month = date_trunc('month', p_day)::date);
$$;

-- No punch lands in a locked month, whichever door it came through.
create or replace function public.attendance_punches_lock_guard()
returns trigger language plpgsql as $$
begin
  -- The selfie purge clears selfie_path on old punches, which are almost all
  -- in locked months. That changes nothing payroll reads, so it passes.
  if tg_op = 'UPDATE'
     and new.kind = old.kind and new.at = old.at and new.day = old.day
     and new.review = old.review and new.mode = old.mode
     and new.selfie_path is null then
    return new;
  end if;
  if public.attendance_month_locked(new.day) then
    raise exception 'Attendance for % is locked for payroll.', to_char(new.day, 'FMMonth YYYY');
  end if;
  return new;
end $$;

drop trigger if exists attendance_punches_lock_guard on public.attendance_punches;
create trigger attendance_punches_lock_guard before insert or update on public.attendance_punches
  for each row execute function public.attendance_punches_lock_guard();

-- ---- days --------------------------------------------------------------------------------------

create table if not exists public.attendance_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  status text not null check (status in ('P', 'HD', 'A', 'OD', 'WO', 'H', 'MP', 'L', 'LOP')),
  first_in timestamptz,
  last_out timestamptz,
  worked_min integer not null default 0,
  late boolean not null default false,
  late_min integer not null default 0,
  -- worked_off_day: worked on a weekly off or holiday (comp-off, with leave).
  flags text[] not null default '{}',
  -- The Super Admin's override wins over the computed status until cleared.
  override_status text check (override_status in ('P', 'HD', 'A', 'OD', 'WO', 'H', 'MP', 'L', 'LOP')),
  override_reason text,
  overridden_by uuid references auth.users (id) on delete set null,
  overridden_at timestamptz,
  computed_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index if not exists attendance_days_day_idx on public.attendance_days (day desc);

alter table public.attendance_days enable row level security;

drop policy if exists attendance_days_read on public.attendance_days;
create policy attendance_days_read on public.attendance_days for select to authenticated
  using (user_id = auth.uid() or public.has_module_access('attendance-team'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_days') then
    alter publication supabase_realtime add table public.attendance_days;
  end if;
end $$;

-- "09:30" in the company timezone, on a given day, as a timestamptz.
create or replace function public.attendance_at(p_day date, p_hhmm text, p_tz text)
returns timestamptz language sql immutable as $$
  select ((p_day::text || ' ' || coalesce(nullif(p_hhmm, ''), '00:00'))::timestamp) at time zone p_tz;
$$;

/**
 * What one person's day counts as, from their punches and the rules. Writes
 * the row (or deletes it for a day that has not happened yet). A locked month
 * is never touched; an override keeps its status but refreshes the times.
 */
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
  half_below := coalesce((cfg ->> 'halfDayBelowMin')::numeric, 270) * case when saturday_half then 0.5 else 1 end;
  absent_below := coalesce((cfg ->> 'absentBelowMin')::numeric, 120) * case when saturday_half then 0.5 else 1 end;
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

  -- An in still open: today it runs to now; on a past day (or once the
  -- auto-close time has passed) it is a missed punch, worth nothing on its own.
  if open_at is not null then
    if p_day < today or now() > shift_end + make_interval(mins => auto_close) then
      v_open_past := true;
    else
      worked := worked + extract(epoch from (now() - open_at)) / 60;
    end if;
  end if;

  if not any_punch then
    if p_day >= today then
      -- Today, not in yet: no row until the day is over or they clock in.
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      return;
    end if;
    -- Before they joined, or while switched off, a day is not theirs to miss.
    if p_day < (prof.created_at at time zone tz)::date or prof.active is not true then
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      return;
    end if;
    v_status := case when is_holiday then 'H' when is_off then 'WO' else 'A' end;
  else
    if v_first is not null and v_first > shift_start + make_interval(mins => grace) and not is_holiday and not is_off then
      v_late := true;
      v_late_min := ceil(extract(epoch from (v_first - shift_start)) / 60)::int;
    end if;
    if is_holiday or is_off then
      v_flags := array_append(v_flags, 'worked_off_day');
    end if;
    if v_open_past then
      v_status := 'MP';
    elsif worked < absent_below and p_day < today then
      v_status := 'A';
      v_flags := array_append(v_flags, 'short_hours');
    elsif worked < half_below and p_day < today then
      v_status := 'HD';
    else
      v_status := case when all_field then 'OD' else 'P' end;
    end if;
  end if;

  insert into public.attendance_days as d (user_id, day, status, first_in, last_out, worked_min, late, late_min, flags, computed_at)
  values (p_user, p_day, v_status, v_first, v_last, round(worked)::int, v_late, v_late_min, v_flags, now())
  on conflict (user_id, day) do update
    set status = excluded.status, first_in = excluded.first_in, last_out = excluded.last_out,
        worked_min = excluded.worked_min, late = excluded.late, late_min = excluded.late_min,
        flags = excluded.flags, computed_at = excluded.computed_at;
end $$;

-- Every punch (and every review of one) recomputes its day.
create or replace function public.attendance_punches_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.attendance_recompute_day(new.user_id, new.day);
  return new;
end $$;

drop trigger if exists attendance_punches_recompute on public.attendance_punches;
create trigger attendance_punches_recompute after insert or update on public.attendance_punches
  for each row execute function public.attendance_punches_recompute();

/**
 * Close a day for everyone. The internal version has no caller check and no
 * grant: the nightly job, the month lock (which Accounts may run) and the
 * admin's recalculation all reach it through their own gate.
 */
create or replace function public.attendance_close_day_all(p_day date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select id from public.profiles where active
    union
    select distinct user_id from public.attendance_punches where day = p_day
  loop
    perform public.attendance_recompute_day(r.id, p_day);
    n := n + 1;
  end loop;
  return n;
end $$;

/** "Recalculate this day" for an admin. */
create or replace function public.attendance_close_day(p_day date)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can recalculate attendance.';
  end if;
  return public.attendance_close_day_all(p_day);
end $$;

/** Recalculate a range (Settings: after the rules change). Admins only. */
create or replace function public.attendance_recompute_range(p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  d date;
  n int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can recalculate attendance.';
  end if;
  if p_to - p_from > 62 then
    raise exception 'Recalculate at most two months at a time.';
  end if;
  d := p_from;
  while d <= p_to loop
    n := n + public.attendance_close_day_all(d);
    d := d + 1;
  end loop;
  return n;
end $$;

-- ---- corrections -----------------------------------------------------------------------------

create table if not exists public.regularisations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  in_at timestamptz,
  out_at timestamptz,
  reason text not null check (length(trim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (in_at is not null or out_at is not null),
  check (in_at is null or out_at is null or out_at > in_at)
);

create index if not exists regularisations_user_idx on public.regularisations (user_id, day desc);
create index if not exists regularisations_pending_idx on public.regularisations (status) where status = 'pending';

alter table public.regularisations enable row level security;

drop policy if exists regularisations_read on public.regularisations;
create policy regularisations_read on public.regularisations for select to authenticated
  using (user_id = auth.uid() or public.has_module_access('attendance-team'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'regularisations') then
    alter publication supabase_realtime add table public.regularisations;
  end if;
end $$;

/** "I forgot to clock out at 6:30": the person's own request, from the phone. */
create or replace function public.regularise_request(p_day date, p_in_at timestamptz, p_out_at timestamptz, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb;
  tz text;
  cap int;
  used int;
  v_id uuid;
begin
  if uid is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account.';
  end if;
  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
  if p_day > (now() at time zone tz)::date then
    raise exception 'You can only correct a day that has started.';
  end if;
  if public.attendance_month_locked(p_day) then
    raise exception 'Attendance for % is locked for payroll.', to_char(p_day, 'FMMonth YYYY');
  end if;
  if p_in_at is null and p_out_at is null then
    raise exception 'Give the time you came in, the time you left, or both.';
  end if;
  if (p_in_at is not null and (p_in_at at time zone tz)::date <> p_day)
     or (p_out_at is not null and (p_out_at at time zone tz)::date not in (p_day, p_day + 1)) then
    raise exception 'The times must be on that day.';
  end if;
  if exists (select 1 from public.regularisations where user_id = uid and day = p_day and status = 'pending') then
    raise exception 'You already have a correction waiting for that day.';
  end if;
  cap := coalesce((cfg ->> 'correctionsPerMonth')::int, 3);
  select count(*) into used from public.regularisations
   where user_id = uid and status in ('pending', 'approved')
     and date_trunc('month', day) = date_trunc('month', p_day);
  if used >= cap then
    raise exception 'You have used all % corrections for this month.', cap;
  end if;
  insert into public.regularisations (user_id, day, in_at, out_at, reason)
  values (uid, p_day, p_in_at, p_out_at, trim(p_reason))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.regularise_cancel(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.regularisations set status = 'cancelled'
   where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then
    raise exception 'That correction can no longer be cancelled.';
  end if;
end $$;

/**
 * An admin's decision. Approving applies the corrected times as punches
 * (flagged `regularised`, already accepted), so the day recomputes from the
 * same source every other day does. Never one's own request.
 */
create or replace function public.regularise_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  cfg jsonb;
  tz text;
  v_mode text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can decide a correction.';
  end if;
  select * into r from public.regularisations where id = p_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'That correction has already been decided.';
  end if;
  if r.user_id = auth.uid() then
    raise exception 'Another admin must decide your own correction.';
  end if;
  if public.attendance_month_locked(r.day) then
    raise exception 'Attendance for % is locked for payroll.', to_char(r.day, 'FMMonth YYYY');
  end if;

  update public.regularisations
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;

  if p_approve then
    select doc into cfg from public.attendance_settings where id;
    tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
    select mode into v_mode from public.attendance_punches where user_id = r.user_id and day = r.day order by at limit 1;
    v_mode := coalesce(v_mode, 'office');
    if r.in_at is not null then
      insert into public.attendance_punches (id, user_id, kind, at, day, mode, flags, review, reviewed_by, reviewed_at, review_note)
      values (gen_random_uuid(), r.user_id, 'in', r.in_at, r.day, v_mode, array['regularised'], 'accepted', auth.uid(), now(), r.reason);
    end if;
    if r.out_at is not null then
      insert into public.attendance_punches (id, user_id, kind, at, day, mode, flags, review, reviewed_by, reviewed_at, review_note)
      values (gen_random_uuid(), r.user_id, 'out', r.out_at, r.day, v_mode, array['regularised'], 'accepted', auth.uid(), now(), r.reason);
    end if;
  end if;
end $$;

-- ---- the Super Admin's powers ----------------------------------------------------------------

/** Set (or clear, with null) what a day counts as. Always with a reason. */
create or replace function public.attendance_override_day(p_user uuid, p_day date, p_status text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can override a day.';
  end if;
  if public.attendance_month_locked(p_day) then
    raise exception 'Unlock % first.', to_char(p_day, 'FMMonth YYYY');
  end if;
  if p_status is not null and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for the override.';
  end if;
  if p_status is null then
    update public.attendance_days
       set override_status = null, override_reason = null, overridden_by = null, overridden_at = null
     where user_id = p_user and day = p_day;
    perform public.attendance_recompute_day(p_user, p_day);
    return;
  end if;
  perform public.attendance_recompute_day(p_user, p_day);
  insert into public.attendance_days (user_id, day, status, override_status, override_reason, overridden_by, overridden_at)
  values (p_user, p_day, p_status, p_status, trim(p_reason), auth.uid(), now())
  on conflict (user_id, day) do update
    set override_status = excluded.override_status, override_reason = excluded.override_reason,
        overridden_by = excluded.overridden_by, overridden_at = excluded.overridden_at;
end $$;

/** Lock a month for payroll: Super Admin, Admin or Accounts (attendance-register). */
create or replace function public.attendance_lock_month(p_month date, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  d date;
begin
  if not public.has_module_access('attendance-register') then
    raise exception 'You cannot lock attendance.';
  end if;
  if m >= date_trunc('month', now() at time zone 'Asia/Kolkata')::date then
    raise exception 'A month can be locked once it is over.';
  end if;
  -- Bring every day up to date first: the lock freezes what is there.
  d := m;
  while d < (m + interval '1 month')::date loop
    perform public.attendance_close_day_all(d);
    d := d + 1;
  end loop;
  insert into public.attendance_months (month, locked_by, note) values (m, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (month) do nothing;
end $$;

/** Only the Super Admin unlocks, and only with a reason (kept in the audit trail). */
create or replace function public.attendance_unlock_month(p_month date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can unlock a month.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for unlocking.';
  end if;
  delete from public.attendance_months where month = date_trunc('month', p_month)::date;
  raise log 'attendance month % unlocked by %: %', p_month, auth.uid(), p_reason;
end $$;

-- ---- the payroll summary ---------------------------------------------------------------------

/**
 * One row per person for a month: the counts payroll needs. Payable days =
 * P + OD + WO + H + L + half of each HD and MP, less the late penalty
 * (every `lateRule.count` lates cost `lateRule.deductDays`).
 */
create or replace function public.attendance_month_summary(p_month date)
returns table (
  user_id uuid, name text, role text,
  present int, field int, half_days int, absent int, weekly_off int, holidays int, missed int, leave int, lop int,
  lates int, late_penalty numeric, worked_min bigint, payable numeric, locked boolean
)
language plpgsql stable security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  cfg jsonb;
  per int;
  deduct numeric;
begin
  if not (public.has_module_access('attendance-register') or public.has_module_access('attendance-team')) then
    raise exception 'You cannot see everyone''s attendance.';
  end if;
  select doc into cfg from public.attendance_settings where id;
  per := greatest(coalesce((cfg -> 'lateRule' ->> 'count')::int, 3), 1);
  deduct := coalesce((cfg -> 'lateRule' ->> 'deductDays')::numeric, 0.5);
  return query
  with d as (
    select a.user_id, coalesce(a.override_status, a.status) as s, a.late, a.worked_min
      from public.attendance_days a
     where a.day >= m and a.day < (m + interval '1 month')::date
  ), agg as (
    select d.user_id,
           count(*) filter (where s = 'P')::int as present,
           count(*) filter (where s = 'OD')::int as field,
           count(*) filter (where s = 'HD')::int as half_days,
           count(*) filter (where s = 'A')::int as absent,
           count(*) filter (where s = 'WO')::int as weekly_off,
           count(*) filter (where s = 'H')::int as holidays,
           count(*) filter (where s = 'MP')::int as missed,
           count(*) filter (where s = 'L')::int as leave,
           count(*) filter (where s = 'LOP')::int as lop,
           count(*) filter (where d.late)::int as lates,
           coalesce(sum(d.worked_min), 0)::bigint as worked_min
      from d group by d.user_id
  )
  select p.id, coalesce(nullif(p.name, ''), p.email), p.role,
         coalesce(a.present, 0), coalesce(a.field, 0), coalesce(a.half_days, 0), coalesce(a.absent, 0),
         coalesce(a.weekly_off, 0), coalesce(a.holidays, 0), coalesce(a.missed, 0), coalesce(a.leave, 0), coalesce(a.lop, 0),
         coalesce(a.lates, 0),
         (floor(coalesce(a.lates, 0)::numeric / per) * deduct),
         coalesce(a.worked_min, 0),
         greatest(0,
           coalesce(a.present, 0) + coalesce(a.field, 0) + coalesce(a.weekly_off, 0) + coalesce(a.holidays, 0) + coalesce(a.leave, 0)
           + 0.5 * (coalesce(a.half_days, 0) + coalesce(a.missed, 0))
           - floor(coalesce(a.lates, 0)::numeric / per) * deduct),
         public.attendance_month_locked(m)
    from public.profiles p
    left join agg a on a.user_id = p.id
   where p.active or a.user_id is not null
   order by 2;
end $$;

-- ---- selfie retention ------------------------------------------------------------------------

-- A secret for the housekeeping job, generated INSIDE the database, so it is
-- never written in this file or in git. The Edge Function checks a caller's
-- header against it through attendance_cron_secret_ok(), callable only with the
-- service role.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'attendance_cron_secret') then
    perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'attendance_cron_secret',
      'Authorises the nightly attendance-housekeeping call (0034).');
  end if;
exception when others then
  raise warning 'attendance: could not create the housekeeping secret (%). Selfie purge must be run by hand.', sqlerrm;
end $$;

create or replace function public.attendance_cron_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'attendance_cron_secret' and decrypted_secret = p_secret);
$$;

revoke all on function public.attendance_cron_secret_ok(text) from public, anon, authenticated;
grant execute on function public.attendance_cron_secret_ok(text) to service_role;

/** Selfies to delete: older than the retention setting, oldest first. */
create or replace function public.attendance_expired_selfies(p_limit int default 500)
returns table (punch_id uuid, path text)
language sql stable security definer set search_path = public as $$
  select p.id, p.selfie_path
    from public.attendance_punches p, public.attendance_settings s
   where s.id and p.selfie_path is not null
     and p.at < now() - make_interval(days => coalesce((s.doc ->> 'selfieRetentionDays')::int, 90))
   order by p.at
   limit greatest(1, least(p_limit, 1000));
$$;

create or replace function public.attendance_selfies_purged(p_ids uuid[])
returns void language sql security definer set search_path = public as $$
  update public.attendance_punches set selfie_path = null where id = any (p_ids);
$$;

revoke all on function public.attendance_expired_selfies(int) from public, anon, authenticated;
revoke all on function public.attendance_selfies_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.attendance_expired_selfies(int) to service_role;
grant execute on function public.attendance_selfies_purged(uuid[]) to service_role;

-- ---- grants ---------------------------------------------------------------------------------

revoke all on function public.attendance_recompute_day(uuid, date) from public, anon, authenticated;
revoke all on function public.attendance_close_day_all(date) from public, anon, authenticated;
revoke all on function public.attendance_close_day(date) from public, anon;
revoke all on function public.attendance_recompute_range(date, date) from public, anon;
revoke all on function public.regularise_request(date, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.regularise_cancel(uuid) from public, anon;
revoke all on function public.regularise_decide(uuid, boolean, text) from public, anon;
revoke all on function public.attendance_override_day(uuid, date, text, text) from public, anon;
revoke all on function public.attendance_lock_month(date, text) from public, anon;
revoke all on function public.attendance_unlock_month(date, text) from public, anon;
revoke all on function public.attendance_month_summary(date) from public, anon;
grant execute on function public.attendance_close_day(date) to authenticated;
grant execute on function public.attendance_recompute_range(date, date) to authenticated;
grant execute on function public.regularise_request(date, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.regularise_cancel(uuid) to authenticated;
grant execute on function public.regularise_decide(uuid, boolean, text) to authenticated;
grant execute on function public.attendance_override_day(uuid, date, text, text) to authenticated;
grant execute on function public.attendance_lock_month(date, text) to authenticated;
grant execute on function public.attendance_unlock_month(date, text) to authenticated;
grant execute on function public.attendance_month_summary(date) to authenticated;

-- ---- the nightly jobs ------------------------------------------------------------------------

-- 00:05 IST (18:35 UTC): close yesterday for everyone.
-- 00:20 IST: purge expired selfies, through the Edge Function (Storage API).
-- Both are skipped with a warning where pg_cron is not available.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname in ('attendance-close-day', 'attendance-housekeeping');
  perform cron.schedule('attendance-close-day', '35 18 * * *',
    $job$ select public.attendance_close_day_all(((now() at time zone 'Asia/Kolkata')::date - 1)) $job$);
  perform cron.schedule('attendance-housekeeping', '50 18 * * *', $job$
    select net.http_post(
      url := 'https://pfoeztiakqtemakfgpgs.supabase.co/functions/v1/attendance-housekeeping',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'attendance_cron_secret')),
      body := '{"job":"purge-selfies"}'::jsonb)
  $job$);
exception when others then
  raise warning 'attendance: nightly jobs not scheduled (%). Run attendance_close_day() by hand.', sqlerrm;
end $$;

-- Days since clock-ins began: compute them now, so the register is not empty.
do $$
declare
  d date;
begin
  for d in select distinct day from public.attendance_punches loop
    perform public.attendance_close_day_all(d);
  end loop;
end $$;
