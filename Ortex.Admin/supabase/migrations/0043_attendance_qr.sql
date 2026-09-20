-- 0043_attendance_qr.sql
--
-- ATTENDANCE by QR CODE. Replaces the selfie and the geofence of 0033/0042 as
-- the proof that someone was at work (owner's decision, 2026-09-20).
--
-- The trust model is unchanged in shape: the phone reports, the DATABASE
-- decides. Only the evidence changes. Instead of "a photo of your face plus a
-- GPS reading inside a circle", a punch now carries a SHORT-LIVED TOKEN that
-- exists only on a screen inside the office, and the database checks it.
--
-- Three rules, and the reason for each:
--
--   1. The code ROTATES every `qrRotateSec` (30s). A photo of the screen sent
--      on WhatsApp is worthless within half a minute. This, not the burn
--      below, is what stops a person marking themselves present from home:
--      burning a code only stops the SAME code being used twice, and the
--      person at home would simply be the one who burns it.
--   2. The code BURNS on a successful punch, and the next one is issued in the
--      same transaction, so the display (which follows this table over
--      realtime) has a fresh code on screen before the next person steps up.
--      That makes a replay impossible even inside the 30s window.
--   3. The code is SHOWN only to the Super Admin and to admins explicitly
--      granted the new `attendance-qr` module. has_module_access() is true for
--      EVERY admin by design (0032), so this file cannot use it: a dedicated
--      attendance_qr_issuer() reads the grant itself. "Selected admins" has to
--      mean selected.
--
-- What this replaces, and what happens to it:
--   * attendance-selfies bucket, selfie_path, attendance_punch's p_selfie_path
--     and the face check: gone from the flow. Existing rows keep their photos
--     and the read policies stay, so the register still shows history.
--   * work_sites keeps its rows but stops being a fence: a site is now the
--     STATION a code is displayed at, which is still worth recording (which
--     gate did they scan). lat, lng and radius_m are left in place, unread.
--   * attendance_locate / attendance_check / attendance_distance_m: no longer
--     called by the phone. Left in place rather than dropped, because
--     attendance_locate still answers "office or field" for a person, which
--     the punch below needs.
--
-- Field staff (a Sales Executive at a customer's site, mode='field') have no
-- screen to scan. They punch with no token; the punch is recorded, flagged
-- `no_code`, and an admin sees it on Corrections. Requiring a code from a rep
-- who starts the day in Noida would simply mean they cannot mark attendance.
--
-- Depends on 0032 (roles), 0033 (punches), 0042 (one a day).

-- ---- the code on the screen -----------------------------------------------------------------

-- One row per station. The station IS a work_site, so a punch keeps naming
-- where it happened without any coordinate being read.
create table if not exists public.attendance_qr (
  site_id uuid primary key references public.work_sites (id) on delete cascade,
  -- The secret itself. Never leaves the server except to an issuer's screen.
  token text not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null,
  -- Who burned the PREVIOUS code, for the display's "last scan" line.
  last_user_id uuid references auth.users (id) on delete set null,
  last_kind text check (last_kind in ('in', 'out')),
  last_at timestamptz,
  rotations bigint not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_qr_token_idx on public.attendance_qr (token);

alter table public.attendance_qr enable row level security;

-- No policy of any kind. The token is a secret: it reaches an issuer's screen
-- only through attendance_qr_show() below, and a phone never reads this table
-- at all, it sends what it scanned and is told yes or no. A select policy
-- here, however narrow, would be a way to read the code currently on screen.

-- The display follows its own row over realtime, so a burn redraws the code on
-- screen at once. Realtime respects RLS, so what arrives is only the fact that
-- the row changed, for a row the client cannot read; the page answers it by
-- calling attendance_qr_show(). That is deliberate: the token itself never
-- travels over the realtime socket.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance_qr'
     ) then
    alter publication supabase_realtime add table public.attendance_qr;
  end if;
end $$;

-- ---- settings ---------------------------------------------------------------------------------

-- Rotation seconds, and the rewritten employee notice: there is no selfie and
-- no location any more, and the notice must not keep saying there is.
update public.attendance_settings
   set doc = doc
     || jsonb_build_object('qrRotateSec', coalesce((doc ->> 'qrRotateSec')::int, 30))
     || jsonb_build_object('requireCode', coalesce((doc ->> 'requireCode')::boolean, true))
     || case
          when doc ->> 'notice' is null or doc ->> 'notice' like '%selfie%'
          then jsonb_build_object('notice',
            'You mark attendance by scanning the code on the office screen. Ortex records the time from our server, which code you scanned and which station it was shown at. No selfie is taken, and your location is not read or stored. Attendance records are kept for your employment plus 3 years. Admins and Accounts can see your attendance. Questions: speak to the Super Admin.')
          else '{}'::jsonb
        end
 where id;

-- ---- who may show a code ------------------------------------------------------------------------

-- NOT has_module_access('attendance-qr'): that is true for every admin (0032),
-- and the owner asked for the Super Admin plus SELECTED admins. A grant here
-- has to be a grant on the person's own profile.
create or replace function public.attendance_qr_issuer()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid()
       and p.active = true
       and (
         p.role = 'super_admin'
         -- An ADMIN who has been given the grant. Both halves matter: the
         -- module alone would let the grant be handed to a Sales Executive,
         -- and the role alone would mean every admin, which is not what was
         -- asked for.
         or (p.role = 'admin' and p.modules @> '["attendance-qr"]'::jsonb)
       )
  );
$$;

-- ---- making a code ------------------------------------------------------------------------------

-- 24 url-safe characters from 18 random bytes: base64 less the three
-- characters a QR scanner or a URL would argue about.
create or replace function public.attendance_qr_token()
returns text language sql volatile as $$
  select translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_.');
$$;

-- The payload a phone actually scans. Prefixed and versioned so the scanner
-- can ignore every other QR code in the world without a round trip.
create or replace function public.attendance_qr_payload(p_token text)
returns text language sql immutable as $$
  select 'ORTEX-ATT1:' || p_token;
$$;

-- Issue the next code for a station, inside whatever transaction calls it.
-- Used by attendance_qr_show() when a code has run out, and by
-- attendance_punch() the moment one is burned.
create or replace function public.attendance_qr_next(p_site uuid, p_by uuid default null)
returns public.attendance_qr language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  v_secs integer;
  v_row public.attendance_qr;
begin
  select doc into cfg from public.attendance_settings where id;
  v_secs := greatest(10, least(300, coalesce((cfg ->> 'qrRotateSec')::int, 30)));
  insert into public.attendance_qr (site_id, token, issued_at, issued_by, expires_at, rotations)
  values (p_site, public.attendance_qr_token(), now(), p_by, now() + make_interval(secs => v_secs), 1)
  on conflict (site_id) do update
     set token = public.attendance_qr_token(),
         issued_at = now(),
         issued_by = coalesce(p_by, attendance_qr.issued_by),
         expires_at = now() + make_interval(secs => v_secs),
         rotations = attendance_qr.rotations + 1,
         updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

-- ---- the display ---------------------------------------------------------------------------------

-- "What should my screen show right now?" Rotates the code if it has run out,
-- and hands back the seconds left so the page can count down and re-ask. The
-- ONLY way a token reaches a browser.
create or replace function public.attendance_qr_show(p_site uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb;
  tz text;
  v_site uuid;
  v_name text;
  v_row public.attendance_qr;
  v_last_name text;
begin
  if not public.attendance_qr_issuer() then
    raise exception 'Only the Super Admin and admins given the attendance code can show it.';
  end if;
  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');

  select s.id, s.name into v_site, v_name
    from public.work_sites s
   where s.active and (p_site is null or s.id = p_site)
   order by case when s.id = p_site then 0 else 1 end, s.name
   limit 1;
  if v_site is null then
    return jsonb_build_object('status', 'no_site',
      'message', 'No office or station has been added yet. Add one in Attendance, Settings.');
  end if;

  select * into v_row from public.attendance_qr where site_id = v_site for update;
  if not found or v_row.expires_at <= now() then
    v_row := public.attendance_qr_next(v_site, auth.uid());
  end if;

  select d.name into v_last_name from public.staff_directory d where d.id = v_row.last_user_id;

  return jsonb_build_object(
    'status', 'ok',
    'siteId', v_site,
    'siteName', v_name,
    'payload', public.attendance_qr_payload(v_row.token),
    'expiresAt', v_row.expires_at,
    'secondsLeft', greatest(0, ceil(extract(epoch from (v_row.expires_at - now()))))::int,
    'rotateSec', greatest(10, least(300, coalesce((cfg ->> 'qrRotateSec')::int, 30))),
    'rotations', v_row.rotations,
    'day', (now() at time zone tz)::date,
    'lastScan', case when v_row.last_at is null then null else jsonb_build_object(
      'name', coalesce(v_last_name, 'A colleague'),
      'kind', v_row.last_kind,
      'at', v_row.last_at
    ) end,
    'serverNow', now()
  );
end $$;

-- Every station an issuer may drive, for the picker on the display page.
create or replace function public.attendance_qr_sites()
returns table (id uuid, name text) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.attendance_qr_issuer() then
    raise exception 'Only the Super Admin and admins given the attendance code can show it.';
  end if;
  return query select s.id, s.name from public.work_sites s where s.active order by s.name;
end $$;

-- ---- punching by code ---------------------------------------------------------------------------

alter table public.attendance_punches
  add column if not exists qr_site_id uuid references public.work_sites (id) on delete set null,
  add column if not exists qr_at timestamptz;

-- Replaces 0042's attendance_punch. Same id-idempotence, same in/out order,
-- same one-a-day rule; the selfie and the three location arguments are gone,
-- and a scanned token takes their place.
drop function if exists public.attendance_punch(uuid, text, double precision, double precision, double precision, boolean, timestamptz, text, text, boolean, jsonb);

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

-- ---- grants ----------------------------------------------------------------------------------------

revoke all on function public.attendance_qr_token() from public, anon, authenticated;
revoke all on function public.attendance_qr_next(uuid, uuid) from public, anon, authenticated;
revoke all on function public.attendance_qr_issuer() from public, anon;
revoke all on function public.attendance_qr_show(uuid) from public, anon;
revoke all on function public.attendance_qr_sites() from public, anon;
revoke all on function public.attendance_punch(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.attendance_qr_issuer() to authenticated;
grant execute on function public.attendance_qr_show(uuid) to authenticated;
grant execute on function public.attendance_qr_sites() to authenticated;
grant execute on function public.attendance_punch(uuid, text, text, text, jsonb) to authenticated;
