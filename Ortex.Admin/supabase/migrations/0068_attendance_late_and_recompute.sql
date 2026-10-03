-- 0068: late marks only on days that were worked and counted, and every
-- unlocked day since 1 September recalculated.
--
-- Found on live data (read-only test, 2026-10-03). Every function below is
-- redefined from its LATEST version (0065) and changes only what its section
-- says. Plain `create or replace` and one recalculation that gives the same
-- answer however often it runs: safe to run twice.
--
--   1. attendance_recompute_day (from 0065, everything else byte for byte).
--      The late mark was set from the first check-in before the day had a
--      verdict, so it stayed on days that were not worked or not counted as
--      worked: an ABSENT day (A with late_min 568, adding a late mark toward
--      the late penalty) and a day lifted to P by autoPresent (late_min 657).
--      Now a day is late only when its final status is P, OD or HD AND
--      autoPresent did not lift it; otherwise late is false and late_min 0.
--      The `no_checkout` flag stays on a day autoPresent lifted to P (Pradeep,
--      30 Sept): it is the record that nobody checked out, and both clients
--      now count a missed check-out only when the day's status, after any
--      override, is A or MP, so it costs nothing on a P day.
--   2. attendance_month_summary (from 0065). `lates` counts a late mark only
--      when the day's status after any override is P, OD or HD and the day
--      carries no `auto_present` flag. A day the Super Admin overrode to A, L,
--      WO or anything else no longer adds to the late penalty, and neither
--      does an old row computed before 1 above. `missed` is unchanged and
--      already agrees with the clients: an MP (after any override), or an A
--      with no override that carries `no_checkout`. A day lifted to P is
--      neither. Payable is unchanged apart from the late penalty it subtracts.
--   3. Recalculate every day from 2026-09-01 to today (IST) for everyone,
--      through attendance_close_day_all (active people plus anyone who
--      punched that day). attendance_recompute_day returns at once for a
--      locked month, so a month locked for payroll is not touched. This fixes
--      the late marks of 1 on old rows, and rows written before 0056 (count
--      from the shift start) and never recalculated since: Louis on
--      2026-09-28 still shows 600 minutes worked where 0056 gives 570. About
--      33 days x 10 people: a second or two.

-- ---- 1. the day (from 0065) --------------------------------------------------------

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
  v_count_from timestamptz;
  auto_present boolean;
  v_ot int := 0;
  v_ot_basis text := 'shift';
begin
  if public.attendance_month_locked(p_day) then
    return;
  end if;

  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
  today := (now() at time zone tz)::date;
  if p_day > today then
    delete from public.attendance_days where user_id = p_user and day = p_day;
    delete from public.attendance_overtime where user_id = p_user and day = p_day;
    return;
  end if;

  select id, active, created_at into prof from public.profiles where id = p_user;
  if not found then
    delete from public.attendance_overtime where user_id = p_user and day = p_day;
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

  -- 0056: the earliest instant that counts. Null on a day with no shift to be
  -- early for, which leaves those hours whole.
  v_count_from := case when is_holiday or is_off then null else shift_start end;

  -- 0056: present without punching. Never on a holiday or a weekly off, which
  -- stay H and WO for everyone, and never over an approved leave.
  auto_present := coalesce(cfg -> 'autoPresent' @> to_jsonb(p_user::text), false)
                  and not is_holiday and not is_off and leave_frac = 0;

  for p in
    select kind, at, mode from public.attendance_punches
     where user_id = p_user and day = p_day and review <> 'rejected'
     order by at
  loop
    any_punch := true;
    if p.mode <> 'field' then all_field := false; end if;
    if p.kind = 'in' then
      -- The punch keeps its own time in v_first (and on the row); only the
      -- clock that pays starts later (0056).
      if open_at is null then
        open_at := case when v_count_from is not null and p.at < v_count_from then v_count_from else p.at end;
      end if;
      if v_first is null then v_first := p.at; end if;
    elsif open_at is not null then
      worked := worked + greatest(0, extract(epoch from (p.at - open_at)) / 60);
      open_at := null;
      v_last := p.at;
    end if;
  end loop;

  -- 0056: there is NO auto clock-out. While it is still their own day an open
  -- in keeps counting to now, however late it runs. Midnight IST is the only
  -- thing that closes a day, and it closes it as an absence with no check-out.
  if open_at is not null then
    if p_day < today then
      v_open_past := true;
    else
      worked := worked + greatest(0, extract(epoch from (now() - open_at)) / 60);
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
    elsif p_day < (prof.created_at at time zone tz)::date or (prof.active is not true and p_day >= today) then
      -- Checked before auto-present, so nobody is marked present before their
      -- start date or after they are switched off. 0065: switching someone off
      -- clears only today and later; the days they were employed keep counting.
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      delete from public.attendance_overtime where user_id = p_user and day = p_day;
      return;
    elsif auto_present then
      -- 0056: present by standing instruction, with the shift's own minutes.
      -- The flag says the figure was not punched.
      v_status := 'P';
      worked := shift_min;
      v_flags := array_append(v_flags, 'auto_present');
    elsif p_day >= today then
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      delete from public.attendance_overtime where user_id = p_user and day = p_day;
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
      -- 0056: checked in and never checked out. The check-in stays on the row as
      -- first_in, last_out stays null, and the day is an ABSENCE rather than the
      -- softer MP: nothing about it was verified, and an unclosed day used to sit
      -- in the register looking like a clerical gap instead of a day to fix.
      v_status := 'A';
      v_flags := array_append(v_flags, 'no_checkout');
    elsif worked < absent_below and p_day < today then
      v_status := case when leave_frac = 0.5 and leave_paid then 'HD' else 'A' end;
      v_flags := array_append(v_flags, 'short_hours');
    elsif worked < half_below and p_day < today then
      v_status := case when leave_frac = 0.5 and leave_paid then 'P' else 'HD' end;
    else
      v_status := case when all_field then 'OD' else 'P' end;
    end if;
    -- 0056: someone marked present by standing instruction does not fall to an
    -- absence, a half day or a missed punch because of what they did or did not
    -- scan. Their real punch times are kept and shown; only the verdict, and a
    -- worked total that would otherwise short their pay, are lifted.
    if auto_present and v_status in ('A', 'HD', 'MP') then
      v_status := 'P';
      v_flags := array_append(v_flags, 'auto_present');
      if worked < shift_min then
        worked := shift_min;
      end if;
    end if;
    -- 0068: a late mark only on a day worked and counted, never on one
    -- autoPresent lifted (its flag is added only by the lift above).
    if v_status not in ('P', 'OD', 'HD') or 'auto_present' = any (v_flags) then
      v_late := false;
      v_late_min := 0;
    end if;
  end if;

  -- 0056: overtime. Past the shift on a working day, every minute on a day
  -- off. An auto-present day has nothing measured, so it earns none.
  if auto_present or not any_punch then
    v_ot := 0;
  elsif is_holiday or is_off then
    v_ot := round(worked)::int;
    v_ot_basis := 'off_day';
  else
    v_ot := greatest(0, round(worked - shift_min))::int;
  end if;
  if v_ot > 0 then
    insert into public.attendance_overtime (user_id, day, minutes, basis, computed_at)
    values (p_user, p_day, v_ot, v_ot_basis, now())
    on conflict (user_id, day) do update
      set minutes = excluded.minutes, basis = excluded.basis, computed_at = excluded.computed_at;
  else
    delete from public.attendance_overtime where user_id = p_user and day = p_day;
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

-- ---- 2. the payroll summary (from 0065) -------------------------------------------

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
  if not (public.has_module_access('attendance-register') or public.has_module_access('attendance-team')
          or public.is_payroll()) then
    raise exception 'You cannot see everyone''s attendance.';
  end if;
  select doc into cfg from public.attendance_settings where id;
  per := greatest(coalesce((cfg -> 'lateRule' ->> 'count')::int, 3), 1);
  deduct := coalesce((cfg -> 'lateRule' ->> 'deductDays')::numeric, 0.5);
  return query
  with d as (
    select a.user_id, coalesce(a.override_status, a.status) as s, a.worked_min,
           -- 0068: a late mark counts only on a day worked and counted, after any
           -- override, and never on a day autoPresent lifted.
           (a.late and coalesce(a.override_status, a.status) in ('P', 'OD', 'HD')
            and not ('auto_present' = any (a.flags))) as late,
           -- 0065 (14): a day never checked out is an A flagged no_checkout since 0056;
           -- it counts as missed, as the console counts it.
           (a.override_status is null and a.status = 'A' and 'no_checkout' = any (a.flags)) as no_out
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
           count(*) filter (where s = 'MP' or d.no_out)::int as missed,
           -- Payable keeps its 0034 meaning: half a day for an MP only.
           count(*) filter (where s = 'MP')::int as mp,
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
           + 0.5 * (coalesce(a.half_days, 0) + coalesce(a.mp, 0))
           - floor(coalesce(a.lates, 0)::numeric / per) * deduct),
         public.attendance_month_locked(m)
    from public.profiles p
    left join agg a on a.user_id = p.id
   where p.active or a.user_id is not null
   order by 2;
end $$;

-- ---- 3. recalculate September onwards ----------------------------------------------

do $$
declare
  d date := '2026-09-01';
  today date := (now() at time zone coalesce((select doc ->> 'timezone' from public.attendance_settings where id), 'Asia/Kolkata'))::date;
begin
  while d <= today loop
    perform public.attendance_close_day_all(d);
    d := d + 1;
  end loop;
end $$;
