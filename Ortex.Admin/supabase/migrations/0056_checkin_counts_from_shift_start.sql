-- 0056: check in from 8:30 AM, the day counts from the shift start, and a day
-- nobody closed is an absence.
--
-- Three changes:
--   * checkInFrom defaults to "08:30" (was "08:50" in 0049), and the key is
--     written into attendance_settings so the console's Settings page shows the
--     real figure instead of a fallback. The Super Admin can still move it.
--   * Arriving early no longer earns time. A check-in before the shift starts
--     counts FROM the shift start, so 8:35 on a 9:30 shift is 9:30, and the
--     person cannot bank an hour by standing at the gate. The punch is still
--     stored, and still shown, at the minute it happened: only the worked
--     total moves. first_in, the late mark and the timeline are untouched.
--   * A day whose check-in was never closed is an ABSENCE (A), not the missed
--     punch (MP) it was before. The check-in time is kept and still shown, the
--     check-out stays empty, and the day carries the `no_checkout` flag so both
--     clients can print "Not checked out" against it. Nothing is worked: the
--     open stretch has never counted. A correction is the way back, and the cap
--     on those rises from 3 days a month to 5 (Attendance → Settings, Super
--     Admin, enforced by regularise_request since 0034).
--   * `autoPresent`, a list of user ids in attendance_settings.doc: people who
--     are present on every working day without punching (an owner, a director,
--     anyone the Super Admin does not ask to queue at the gate). Their day is P
--     with the full shift's minutes, flagged `auto_present` so the register is
--     honest about where the figure came from, and it is never A, HD or MP. If
--     they do punch, the real times are kept and shown; the status still does
--     not fall. The list lives in the settings doc rather than on profiles so
--     that it inherits the table's rule: admins read, ONLY the Super Admin
--     writes.
--   * Overtime is measured and kept, for admins only. `attendance_overtime`
--     (user_id, day, minutes, basis) is written by the same recompute and is
--     readable ONLY by an admin or the Super Admin, never by the person who
--     worked it: overtime is a pay conversation, and a half-computed figure on
--     a phone starts arguments before anyone has approved it. On a working day
--     it is the minutes past the shift's length; on a holiday or a weekly off
--     every worked minute counts. Auto-present people never earn it, having
--     punched nothing to measure.
--
-- The clamp is skipped on a holiday or a weekly off. There is no shift to be
-- early for on a Sunday, and comp-off is earned on the hours actually worked.
-- A check-OUT is not clamped: staying past the shift end is overtime, which is
-- the point of recording it.
--
--   * There is NO auto clock-out any more. autoCloseAfterMin (0033) decided
--     when an open day stopped counting and became a missed punch; the setting
--     is gone from the console and unread here. While it is still their own day
--     an open in counts to now, however late it runs, and midnight IST closes
--     it as the absence above. One rule instead of two that disagreed.
--
-- Plain `create or replace` of two functions, safe to run twice. The recompute
-- is rebuilt from 0036's leave-aware body, NOT 0034's: 0036 is the version live
-- in production, and starting from 0034 would have quietly dropped L, LOP and
-- every half-day leave rule.

-- ---- the setting -----------------------------------------------------------

-- Both writes leave a figure the Super Admin has already moved alone.
update public.attendance_settings
   set doc = jsonb_set(doc, '{checkInFrom}', '"08:30"', true),
       updated_at = now()
 where id and coalesce(doc ->> 'checkInFrom', '08:50') = '08:50';

update public.attendance_settings
   set doc = jsonb_set(doc, '{correctionsPerMonth}', '5', true),
       updated_at = now()
 where id and coalesce((doc ->> 'correctionsPerMonth')::int, 3) = 3;

-- ---- overtime, admins only -------------------------------------------------

create table if not exists public.attendance_overtime (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  minutes int not null default 0,
  -- 'shift' past the day's shift length, 'off_day' every minute of a holiday
  -- or a weekly off.
  basis text not null default 'shift',
  computed_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.attendance_overtime enable row level security;

-- No write policy: only the security-definer recompute writes here.
drop policy if exists attendance_overtime_admin_read on public.attendance_overtime;
create policy attendance_overtime_admin_read on public.attendance_overtime
  for select to authenticated using (public.is_admin());

-- ---- the day's worked minutes ----------------------------------------------

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
    elsif p_day < (prof.created_at at time zone tz)::date or prof.active is not true then
      -- Checked before auto-present, so nobody is marked present before their
      -- start date or after they are switched off.
      delete from public.attendance_days where user_id = p_user and day = p_day and override_status is null;
      return;
    elsif auto_present then
      -- 0056: present by standing instruction, with the shift's own minutes.
      -- The flag says the figure was not punched.
      v_status := 'P';
      worked := shift_min;
      v_flags := array_append(v_flags, 'auto_present');
    elsif p_day >= today then
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


-- ---- the punch window ------------------------------------------------------
-- Identical to 0049 but for the checkInFrom fallback. Repeated in full because
-- the default is baked into the body.

create or replace function public.attendance_punch(
  p_id uuid,
  p_kind text,
  p_payload text,
  p_note text default null,
  p_device jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb;
  tz text;
  loc record;
  prev record;
  done record;
  existing record;
  code record;
  v_at timestamptz := now();
  v_flags text[] := '{}';
  v_review text;
  v_token text;
  v_site uuid;
  v_site_name text;
  v_issued_by uuid;
  require_code boolean;
  is_open boolean;
  v_today date;
  v_open timestamptz;
  v_close timestamptz;
begin
  if uid is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account to mark attendance.';
  end if;

  -- A retry of a punch that already landed returns what it returned then, so a
  -- dropped connection can never burn a second code or punch twice.
  select * into existing from public.attendance_punches where id = p_id;
  if found then
    if existing.user_id <> uid then
      raise exception 'That punch id is taken.';
    end if;
    return jsonb_build_object(
      'status', case when existing.review = 'rejected' then 'refused' when existing.review = 'flagged' then 'flagged' else 'ok' end,
      'id', existing.id, 'kind', existing.kind, 'at', existing.at, 'site', existing.site_name,
      'flags', to_jsonb(existing.flags), 'repeat', true
    );
  end if;

  if p_kind not in ('in', 'out') then
    raise exception 'A punch is a clock in or a clock out.';
  end if;

  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
  require_code := coalesce((cfg ->> 'requireCode')::boolean, true);

  -- The check-in window: from checkInFrom (0056: 8:30 AM) to closeAt. A
  -- check-out has none.
  v_today := (v_at at time zone tz)::date;
  v_open := public.attendance_at(v_today, coalesce(cfg ->> 'checkInFrom', '08:30'), tz);
  v_close := public.attendance_at(v_today, coalesce(cfg ->> 'closeAt', '21:00'), tz);
  if p_kind = 'in' and v_at < v_open then
    return jsonb_build_object('status', 'outside_hours', 'message',
      format('Check-in opens at %s.', to_char(v_open at time zone tz, 'FMHH12:MI AM')));
  end if;
  if p_kind = 'in' and v_at > v_close then
    return jsonb_build_object('status', 'outside_hours', 'message',
      format('Check-in closed at %s. Ask an admin for a correction.', to_char(v_close at time zone tz, 'FMHH12:MI AM')));
  end if;

  -- Office or field. A field person has no screen to scan.
  select * into loc from public.attendance_locate(uid, null, null);

  -- In, then out, then in. An in is open only on its own day: at midnight IST
  -- an unclosed day resets (0049).
  select * into prev from public.attendance_punches
   where user_id = uid and review <> 'rejected' and at <= v_at
   order by at desc limit 1;
  is_open := found and prev.kind = 'in' and prev.day = v_today;
  if p_kind = 'in' and is_open then
    return jsonb_build_object('status', 'already_in', 'message',
      format('You clocked in at %s. Clock out first.', to_char(prev.at at time zone tz, 'HH12:MI AM')));
  end if;
  if p_kind = 'out' and not is_open then
    if found and prev.kind = 'in' then
      return jsonb_build_object('status', 'not_in', 'message',
        format('Your check-in on %s was never closed, and it reset at midnight. Ask an admin for a correction, then check in for today.',
          to_char(prev.at at time zone tz, 'FMDD Mon')));
    end if;
    return jsonb_build_object('status', 'not_in', 'message', 'You are not clocked in.');
  end if;

  -- One in and one out a day (0042).
  select * into done from public.attendance_punches
   where user_id = uid and review <> 'rejected' and kind = p_kind
     and day = (v_at at time zone tz)::date
   limit 1;
  if found then
    return jsonb_build_object('status', 'day_done', 'message',
      format('You already clocked %s today, at %s.',
        case when p_kind = 'in' then 'in' else 'out' end,
        to_char(done.at at time zone tz, 'HH12:MI AM')));
  end if;

  -- ---- the code -------------------------------------------------------------------------
  if p_payload is not null and length(trim(p_payload)) > 0 then
    if position('ORTEX-ATT1:' in p_payload) <> 1 then
      return jsonb_build_object('status', 'wrong_code', 'message',
        'That is not an Ortex attendance code. Scan the code on the office screen.');
    end if;
    v_token := substring(p_payload from 12);

    -- Lock the station's row: two phones scanning the same code race here, and
    -- exactly one of them wins.
    select * into code from public.attendance_qr where token = v_token for update;
    if not found then
      return jsonb_build_object('status', 'used_code', 'message',
        'That code has already been used. The screen is showing a new one, scan it.');
    end if;
    if code.expires_at <= now() then
      return jsonb_build_object('status', 'expired_code', 'message',
        'That code has expired. The screen is showing a new one, scan it.');
    end if;
    v_site := code.site_id;
    v_issued_by := code.issued_by;
    select s.name into v_site_name from public.work_sites s where s.id = v_site;
  elsif loc.mode = 'field' then
    -- A rep at a customer's site. Recorded, flagged, decided by an admin.
    v_flags := array_append(v_flags, 'no_code');
  elsif require_code then
    return jsonb_build_object('status', 'no_code', 'message',
      'Scan the code on the office screen to mark attendance.');
  else
    v_flags := array_append(v_flags, 'no_code');
  end if;

  v_review := case when cardinality(v_flags) > 0 then 'flagged' else 'ok' end;

  insert into public.attendance_punches (id, user_id, kind, at, day, client_at, mocked,
    mode, site_id, site_name, note, device, offline, flags, review, qr_site_id, qr_at)
  values (p_id, uid, p_kind, v_at, (v_at at time zone tz)::date, null, false,
    loc.mode, v_site, v_site_name, nullif(trim(coalesce(p_note, '')), ''),
    coalesce(p_device, '{}'::jsonb), false, v_flags, v_review, v_site,
    case when v_site is not null then v_at end);

  -- Burn it, and put the next code on the screen in the same transaction.
  if v_site is not null then
    update public.attendance_qr
       set last_user_id = uid, last_kind = p_kind, last_at = v_at
     where site_id = v_site;
    perform public.attendance_qr_next(v_site, v_issued_by);
  end if;

  return jsonb_build_object(
    'status', case when v_review = 'flagged' then 'flagged' else 'ok' end,
    'id', p_id,
    'kind', p_kind,
    'at', v_at,
    'mode', loc.mode,
    'site', v_site_name,
    'flags', to_jsonb(v_flags)
  );
end $$;

revoke all on function public.attendance_punch(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.attendance_punch(uuid, text, text, text, jsonb) to authenticated;
