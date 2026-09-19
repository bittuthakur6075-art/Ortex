-- 0033_attendance.sql
--
-- ATTENDANCE, phase 1: clock in / out on the phone with a selfie and a
-- geofence, checked and timestamped by the SERVER (docs/pm/ATTENDANCE_LEAVE_PLAN.md).
--
-- The one rule everything here serves: the phone reports what it saw (where it
-- was, how accurate that was, whether Android flagged it as a fake location,
-- which selfie it uploaded) and the DATABASE decides. It computes the distance
-- to the office, stamps its own clock, and writes the punch. Nobody, admins
-- included, can insert or edit a punch directly: there are no insert, update or
-- delete policies on attendance_punches, only the security-definer functions
-- below. That is what makes "attendance is marked only in the phone app"
-- (owner's decision, 2026-09-19) true rather than a screen that hides a button.
--
-- Depends on 0032 (is_admin, is_super_admin, has_module_access, role values).
--
-- What is NOT here yet (phase 2): day statuses (P/HD/A/L/WO/H), late marks,
-- holidays, corrections, the nightly job and the month lock.

-- ---- office locations -----------------------------------------------------------------

create table if not exists public.work_sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 30 and 2000),
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.work_sites enable row level security;

-- Coordinates stay with the admins; the phone learns only "how far am I" from
-- attendance_check() below, and each punch keeps a copy of the site's name.
drop policy if exists work_sites_admin_read on public.work_sites;
create policy work_sites_admin_read on public.work_sites
  for select to authenticated using (public.is_admin());

drop policy if exists work_sites_super_write on public.work_sites;
create policy work_sites_super_write on public.work_sites
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop trigger if exists work_sites_touch on public.work_sites;
create trigger work_sites_touch before update on public.work_sites
  for each row execute function public.set_updated_at();

-- ---- per-person attendance setup ------------------------------------------------------------

-- Office or field, and which sites a person may clock in at. Kept off
-- `profiles` on purpose: it is the Super Admin's to set, and profiles_protect
-- already has enough to guard. A person with no row gets their role's default:
-- a Sales Executive works in the field, everyone else at an office, any site.
create table if not exists public.attendance_people (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mode text check (mode in ('office', 'field')),
  site_ids uuid[],
  updated_at timestamptz not null default now()
);

alter table public.attendance_people enable row level security;

drop policy if exists attendance_people_read on public.attendance_people;
create policy attendance_people_read on public.attendance_people
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists attendance_people_super_write on public.attendance_people;
create policy attendance_people_super_write on public.attendance_people
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ---- settings (Super Admin) -------------------------------------------------------------------

-- One row. Every rule the module needs, with the plan's defaults (§3b), so
-- nothing waits on the owner's answers. Readable by all active staff (the phone
-- shows the shift and the notice), changed only by the Super Admin.
create table if not exists public.attendance_settings (
  id boolean primary key default true check (id),
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.attendance_settings (id, doc) values (true, jsonb_build_object(
  'timezone', 'Asia/Kolkata',
  'shift', jsonb_build_object('start', '09:30', 'end', '18:30'),
  'weeklyOff', jsonb_build_array(0),
  'saturday', 'full',
  'graceMin', 15,
  'lateRule', jsonb_build_object('count', 3, 'deductDays', 0.5),
  'halfDayBelowMin', 270,
  'absentBelowMin', 120,
  'autoCloseAfterMin', 240,
  'correctionsPerMonth', 3,
  'mustBeInside', true,
  'defaultRadiusM', 150,
  'maxAccuracyM', 100,
  'clockSkewMin', 5,
  'selfieRetentionDays', 90,
  'notice', 'When you clock in or out, Ortex records a selfie, your location at that moment, and the time from our server. We use it only to keep attendance for pay. Your location is never tracked at other times. Selfies are deleted after 90 days; attendance records are kept for your employment plus 3 years. Admins and Accounts can see your attendance. Questions: speak to the Super Admin.'
)) on conflict (id) do nothing;

alter table public.attendance_settings enable row level security;

drop policy if exists attendance_settings_read on public.attendance_settings;
create policy attendance_settings_read on public.attendance_settings
  for select to authenticated using (public.is_active_staff());

drop policy if exists attendance_settings_super_write on public.attendance_settings;
create policy attendance_settings_super_write on public.attendance_settings
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.attendance_settings_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists attendance_settings_stamp on public.attendance_settings;
create trigger attendance_settings_stamp before update on public.attendance_settings
  for each row execute function public.attendance_settings_stamp();

-- ---- punches -------------------------------------------------------------------------------

create table if not exists public.attendance_punches (
  -- Made by the phone, so a retry or an offline sync can never punch twice.
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  -- The time of record: the server's clock, never the phone's.
  at timestamptz not null default now(),
  -- The day it counts for, in the company's timezone.
  day date not null,
  client_at timestamptz,
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  mocked boolean not null default false,
  mode text not null check (mode in ('office', 'field')),
  site_id uuid references public.work_sites (id) on delete set null,
  site_name text,
  distance_m double precision,
  inside boolean,
  note text,
  selfie_path text,
  device jsonb not null default '{}'::jsonb,
  offline boolean not null default false,
  flags text[] not null default '{}',
  -- ok: nothing unusual. flagged: needs a look. accepted / rejected: an admin decided.
  review text not null default 'ok' check (review in ('ok', 'flagged', 'accepted', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists attendance_punches_user_day_idx on public.attendance_punches (user_id, day desc, at desc);
create index if not exists attendance_punches_day_idx on public.attendance_punches (day desc, at desc);
create index if not exists attendance_punches_review_idx on public.attendance_punches (review) where review = 'flagged';

alter table public.attendance_punches enable row level security;

-- Read: your own, or everyone's with the attendance-team grant (Accounts by
-- default) or as an admin. Write: nobody. Only the functions below.
drop policy if exists attendance_punches_read on public.attendance_punches;
create policy attendance_punches_read on public.attendance_punches
  for select to authenticated
  using (user_id = auth.uid() or public.has_module_access('attendance-team'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_punches'
     ) then
    alter publication supabase_realtime add table public.attendance_punches;
  end if;
end $$;

-- ---- selfies ---------------------------------------------------------------------------------

-- Private. <uid>/<yyyy>/<mm>/<punch-id>.jpg. You upload only into your own
-- folder; you and the attendance readers can view; nobody can replace or delete
-- a selfie through the API, so a photo cannot be swapped after the punch. The
-- retention purge (phase 2) runs with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-selfies', 'attendance-selfies', false, 2097152, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg'];

drop policy if exists attendance_selfies_insert on storage.objects;
create policy attendance_selfies_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attendance-selfies'
    and public.is_active_staff()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists attendance_selfies_read on storage.objects;
create policy attendance_selfies_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attendance-selfies'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.has_module_access('attendance-team'))
  );

-- ---- helpers --------------------------------------------------------------------------------------

create or replace function public.attendance_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  -- Haversine on a 6,371 km sphere: a few metres out at worst, far inside any
  -- GPS reading's own error.
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- The caller's mode and nearest allowed site for a reading. Shared by the
-- pre-check and the punch so the two can never disagree.
create or replace function public.attendance_locate(p_uid uuid, p_lat double precision, p_lng double precision)
returns table (mode text, site_id uuid, site_name text, radius_m integer, distance_m double precision, sites_configured boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  v_mode text;
  v_sites uuid[];
  v_role text;
begin
  select ap.mode, ap.site_ids into v_mode, v_sites from public.attendance_people ap where ap.user_id = p_uid;
  select p.role into v_role from public.profiles p where p.id = p_uid;
  v_mode := coalesce(v_mode, case when v_role = 'sales' then 'field' else 'office' end);

  return query
  with allowed as (
    select s.* from public.work_sites s
     where s.active and (v_sites is null or s.id = any (v_sites))
  )
  select v_mode,
         a.id, a.name, a.radius_m,
         case when p_lat is null or p_lng is null then null
              else public.attendance_distance_m(p_lat, p_lng, a.lat, a.lng) end,
         exists (select 1 from allowed)
    from (select 1) one
    left join lateral (
      select * from allowed
       order by case when p_lat is null or p_lng is null then 0
                     else public.attendance_distance_m(p_lat, p_lng, allowed.lat, allowed.lng) end
       limit 1
    ) a on true;
end $$;

-- ---- the pre-check (no punch) -------------------------------------------------------------------

-- "How far am I, and would a punch here be accepted?" The phone calls this as
-- soon as it has a reading, so the answer is on screen before anyone slides.
create or replace function public.attendance_check(p_lat double precision, p_lng double precision, p_accuracy double precision)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cfg jsonb;
  loc record;
  max_acc double precision;
  must_inside boolean;
  inside boolean;
  open_in timestamptz;
begin
  if uid is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account to mark attendance.';
  end if;
  select doc into cfg from public.attendance_settings where id;
  max_acc := coalesce((cfg ->> 'maxAccuracyM')::double precision, 100);
  must_inside := coalesce((cfg ->> 'mustBeInside')::boolean, true);
  select * into loc from public.attendance_locate(uid, p_lat, p_lng);
  inside := loc.distance_m is not null and (loc.distance_m - coalesce(p_accuracy, 0)) <= loc.radius_m;

  select p.at into open_in
    from public.attendance_punches p
   where p.user_id = uid and p.review <> 'rejected'
   order by p.at desc limit 1;
  -- open_in holds the latest punch; it is "open" only if that punch was an in.
  if not exists (
    select 1 from public.attendance_punches p
     where p.user_id = uid and p.review <> 'rejected' and p.at = open_in and p.kind = 'in'
       and p.at > now() - interval '20 hours'
  ) then
    open_in := null;
  end if;

  return jsonb_build_object(
    'mode', loc.mode,
    'sitesConfigured', loc.sites_configured,
    'site', loc.site_name,
    'radiusM', loc.radius_m,
    'distanceM', round(loc.distance_m::numeric, 0),
    'accuracyM', round(p_accuracy::numeric, 0),
    'accuracyOk', p_accuracy is not null and p_accuracy <= max_acc,
    'maxAccuracyM', max_acc,
    'inside', inside,
    'mustBeInside', must_inside,
    'openSince', open_in,
    'serverNow', now()
  );
end $$;

-- ---- the punch --------------------------------------------------------------------------------------

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

-- ---- review (admins) --------------------------------------------------------------------------------

create or replace function public.attendance_review(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can review attendance.';
  end if;
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Accept or reject.';
  end if;
  if exists (select 1 from public.attendance_punches where id = p_id and user_id = auth.uid()) then
    raise exception 'You cannot review your own attendance.';
  end if;
  update public.attendance_punches
     set review = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_id;
  if not found then
    raise exception 'That punch no longer exists.';
  end if;
end $$;

revoke all on function public.attendance_check(double precision, double precision, double precision) from public, anon;
revoke all on function public.attendance_punch(uuid, text, double precision, double precision, double precision, boolean, timestamptz, text, text, boolean, jsonb) from public, anon;
revoke all on function public.attendance_review(uuid, text, text) from public, anon;
revoke all on function public.attendance_locate(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.attendance_check(double precision, double precision, double precision) to authenticated;
grant execute on function public.attendance_punch(uuid, text, double precision, double precision, double precision, boolean, timestamptz, text, text, boolean, jsonb) to authenticated;
grant execute on function public.attendance_review(uuid, text, text) to authenticated;
