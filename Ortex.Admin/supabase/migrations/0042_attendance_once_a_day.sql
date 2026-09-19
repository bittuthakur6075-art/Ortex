-- 0042_attendance_once_a_day.sql
--
-- One check-in and one check-out a day. attendance_punch() (0033) only kept
-- punches in order (in, out, in, out), so a person could check in and out as
-- often as they liked in one day. The owner's rule is a single check-in and a
-- single check-out; anything else goes through a correction request (0034),
-- which an admin approves.
--
-- The function is replaced whole, same signature and grants. The only changes:
--   * an advisory lock per person, so two punches cannot race past the check;
--   * after the in/out order check, a refusal with status 'day_done' when the
--     day already has a check-out, or (for a check-in) already has a check-in.
-- A rejected punch (fake location) does not count. History is untouched.

create or replace function public.attendance_punch(
  p_id uuid,
  p_kind text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_mocked boolean,
  p_client_at timestamptz,
  p_selfie_path text,
  p_note text default null,
  p_offline boolean default false,
  p_device jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb;
  tz text;
  loc record;
  prev record;
  existing record;
  v_at timestamptz := now();
  v_flags text[] := '{}';
  v_inside boolean;
  v_review text;
  max_acc double precision;
  must_inside boolean;
  skew_min double precision;
  is_open boolean;
  v_day date;
  done record;
begin
  if uid is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account to mark attendance.';
  end if;

  -- A retry of a punch that already landed returns what it returned then.
  select * into existing from public.attendance_punches where id = p_id;
  if found then
    if existing.user_id <> uid then
      raise exception 'That punch id is taken.';
    end if;
    return jsonb_build_object(
      'status', case when existing.review = 'rejected' then 'refused' when existing.review = 'flagged' then 'flagged' else 'ok' end,
      'id', existing.id, 'kind', existing.kind, 'at', existing.at, 'site', existing.site_name,
      'distanceM', round(existing.distance_m::numeric, 0), 'flags', to_jsonb(existing.flags), 'repeat', true
    );
  end if;

  -- One punch at a time per person: two quick taps (or a queued offline punch
  -- replaying beside a live one) must not both pass the once-a-day check below.
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || uid::text, 0));

  if p_kind not in ('in', 'out') then
    raise exception 'A punch is a clock in or a clock out.';
  end if;
  if p_lat is null or p_lng is null or p_accuracy is null then
    return jsonb_build_object('status', 'no_location', 'message', 'Your location could not be read. Turn on location and try again.');
  end if;
  -- Phone-only by construction: a punch must carry a selfie the caller uploaded
  -- into their own folder.
  if p_selfie_path is null or split_part(p_selfie_path, '/', 1) <> uid::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'attendance-selfies' and o.name = p_selfie_path) then
    return jsonb_build_object('status', 'no_selfie', 'message', 'The selfie did not upload. Take it again.');
  end if;

  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
  max_acc := coalesce((cfg ->> 'maxAccuracyM')::double precision, 100);
  must_inside := coalesce((cfg ->> 'mustBeInside')::boolean, true);
  skew_min := coalesce((cfg ->> 'clockSkewMin')::double precision, 5);

  -- An offline punch keeps the time the phone recorded, if it is believable:
  -- not in the future and not more than a day old. It is always flagged.
  if p_offline then
    v_flags := array_append(v_flags, 'offline');
    if p_client_at is not null and p_client_at <= now() + interval '2 minutes' and p_client_at > now() - interval '24 hours' then
      v_at := p_client_at;
    end if;
  elsif p_client_at is not null and abs(extract(epoch from (now() - p_client_at))) > skew_min * 60 then
    v_flags := array_append(v_flags, 'clock_skew');
  end if;

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

  -- One check-in and one check-out a day (the owner's rule, 2026-09-19). A
  -- rejected punch (a fake location) does not use the day up; anything else
  -- does, flagged or not. A wrong time is fixed with a correction request.
  v_day := (v_at at time zone tz)::date;
  select * into done from public.attendance_punches
   where user_id = uid and day = v_day and kind = 'out' and review <> 'rejected'
   order by at desc limit 1;
  if found then
    return jsonb_build_object('status', 'day_done', 'message',
      format('You checked out at %s today. Attendance is one check-in and one check-out a day. If a time is wrong, request a correction.',
        to_char(done.at at time zone tz, 'HH12:MI AM')));
  end if;
  if p_kind = 'in' then
    select * into done from public.attendance_punches
     where user_id = uid and day = v_day and kind = 'in' and review <> 'rejected'
     order by at limit 1;
    if found then
      return jsonb_build_object('status', 'day_done', 'message',
        format('You already checked in today at %s. Attendance is one check-in and one check-out a day. If a time is wrong, request a correction.',
          to_char(done.at at time zone tz, 'HH12:MI AM')));
    end if;
  end if;

  select * into loc from public.attendance_locate(uid, p_lat, p_lng);
  v_inside := loc.distance_m is not null and (loc.distance_m - p_accuracy) <= loc.radius_m;

  -- A fake location is the one hard refusal. It is recorded, rejected, so an
  -- admin sees the attempt; the person can ask for a correction instead.
  if coalesce(p_mocked, false) then
    insert into public.attendance_punches (id, user_id, kind, at, day, client_at, lat, lng, accuracy_m, mocked,
      mode, site_id, site_name, distance_m, inside, note, selfie_path, device, offline, flags, review)
    values (p_id, uid, p_kind, v_at, (v_at at time zone tz)::date, p_client_at, p_lat, p_lng, p_accuracy, true,
      loc.mode, loc.site_id, loc.site_name, loc.distance_m, v_inside, p_note, p_selfie_path, coalesce(p_device, '{}'::jsonb),
      coalesce(p_offline, false), array_append(v_flags, 'mock_location'), 'rejected');
    return jsonb_build_object('status', 'refused', 'id', p_id, 'message',
      'Your phone reported a fake location, so this was not accepted. Turn off any location-changing app and try again, or request a correction.');
  end if;

  if loc.mode = 'office' then
    if not loc.sites_configured then
      return jsonb_build_object('status', 'no_site', 'message', 'Your office location has not been set up yet. Ask the Super Admin to add it.');
    end if;
    if p_accuracy > max_acc then
      return jsonb_build_object('status', 'weak_gps', 'accuracyM', round(p_accuracy::numeric, 0), 'maxAccuracyM', max_acc,
        'message', format('Location is only accurate to %s m. Move near a window or outside and try again.', round(p_accuracy::numeric, 0)));
    end if;
    if not v_inside then
      if must_inside then
        return jsonb_build_object('status', 'outside', 'site', loc.site_name,
          'distanceM', round(loc.distance_m::numeric, 0), 'radiusM', loc.radius_m,
          'message', format('You are %s m from %s. Clock in when you are within %s m.',
            round(greatest(loc.distance_m - loc.radius_m, 0)::numeric, 0), loc.site_name, loc.radius_m));
      end if;
      v_flags := array_append(v_flags, 'outside');
    end if;
  else
    -- Field (OD): no fence. Location is still recorded; a poor reading is
    -- flagged rather than refused, because the field has no window to walk to.
    if p_accuracy > max_acc then
      v_flags := array_append(v_flags, 'low_accuracy');
    end if;
  end if;

  v_review := case when cardinality(v_flags) > 0 then 'flagged' else 'ok' end;

  insert into public.attendance_punches (id, user_id, kind, at, day, client_at, lat, lng, accuracy_m, mocked,
    mode, site_id, site_name, distance_m, inside, note, selfie_path, device, offline, flags, review)
  values (p_id, uid, p_kind, v_at, (v_at at time zone tz)::date, p_client_at, p_lat, p_lng, p_accuracy, false,
    loc.mode, case when loc.mode = 'office' then loc.site_id end, case when loc.mode = 'office' then loc.site_name end,
    loc.distance_m, v_inside, nullif(trim(coalesce(p_note, '')), ''), p_selfie_path, coalesce(p_device, '{}'::jsonb),
    coalesce(p_offline, false), v_flags, v_review);

  return jsonb_build_object(
    'status', case when v_review = 'flagged' then 'flagged' else 'ok' end,
    'id', p_id,
    'kind', p_kind,
    'at', v_at,
    'mode', loc.mode,
    'site', case when loc.mode = 'office' then loc.site_name end,
    'distanceM', round(loc.distance_m::numeric, 0),
    'flags', to_jsonb(v_flags)
  );
end $$;

revoke all on function public.attendance_punch(uuid, text, double precision, double precision, double precision, boolean, timestamptz, text, text, boolean, jsonb) from public, anon;
grant execute on function public.attendance_punch(uuid, text, double precision, double precision, double precision, boolean, timestamptz, text, text, boolean, jsonb) to authenticated;
