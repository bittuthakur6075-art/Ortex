-- 0048: attendance only between 20 minutes before the shift and 9 PM.
--
-- A check-in or check-out is refused before (shift start - openBeforeMin) or
-- after closeAt, IST. Defaults 20 minutes and 21:00; the Super Admin can set
-- either in attendance_settings.doc. Nothing else in attendance_punch (0043)
-- changes. The phone checks the same window before opening the camera; this is
-- the check that counts. Plain `create or replace`, safe to run twice.

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

  -- The window (0048): from openBeforeMin before the shift starts to closeAt.
  v_today := (v_at at time zone tz)::date;
  v_open := public.attendance_at(v_today, coalesce(cfg #>> '{shift,start}', '09:30'), tz)
    - make_interval(mins => coalesce((cfg ->> 'openBeforeMin')::int, 20));
  v_close := public.attendance_at(v_today, coalesce(cfg ->> 'closeAt', '21:00'), tz);
  if v_at < v_open or v_at > v_close then
    return jsonb_build_object('status', 'outside_hours', 'message',
      format('Attendance can be marked only between %s and %s.',
        to_char(v_open at time zone tz, 'FMHH12:MI AM'), to_char(v_close at time zone tz, 'FMHH12:MI AM')));
  end if;

  -- Office or field. A field person has no screen to scan.
  select * into loc from public.attendance_locate(uid, null, null);

  -- In, then out, then in.
  select * into prev from public.attendance_punches
   where user_id = uid and review <> 'rejected' and at <= v_at
   order by at desc limit 1;
  is_open := found and prev.kind = 'in' and prev.at > v_at - interval '20 hours';
  if p_kind = 'in' and is_open then
    return jsonb_build_object('status', 'already_in', 'message',
      format('You clocked in at %s. Clock out first.', to_char(prev.at at time zone tz, 'HH12:MI AM')));
  end if;
  if p_kind = 'out' and not is_open then
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
