-- 0065: attendance fixes from the 2026-10-03 review.
--
-- Every function below is redefined from its LATEST version (named in its
-- section) and changes only what its section says. Plain `create or replace`,
-- `add column if not exists` and `drop ... if exists`: safe to run twice.
--
--   1. attendance_punch (from 0056).
--      a. The per-person advisory lock of 0042 is back. 0043 rewrote the punch
--         and dropped it, so two taps at the same moment could both pass the
--         one-in-one-out-a-day check and both land.
--      b. A retried punch (same id) now answers with its `mode` too, so a field
--         punch replayed after a dropped connection reads as a field punch,
--         and a replay of a punch an admin has since rejected carries a
--         message instead of a bare 'refused'.
--      c. p_note is cut to 500 characters, and a p_device over 2 KB is stored
--         as '{}' rather than refused: the punch is what matters, not the
--         phone's description of itself.
--      d. Which account displayed the code. attendance_qr.shown_by is set by
--         attendance_qr_show (from 0043) the first time a screen fetches a
--         fresh code, and copied onto the punch as qr_shown_by. Audit only: no
--         new refusal (the flag own_code is 21 below). Claimed once per code.
--         The display does NOT hear changes to its row: attendance_qr has RLS
--         and no select policy, so realtime delivers nothing to a browser, and
--         the console re-asks when its countdown runs out. Writing shown_by on
--         every call would only rewrite the row for nothing.
--   2. attendance_recompute_day (from 0056, everything else byte for byte).
--      a. Switching someone off deleted EVERY day recomputed after that,
--         including the months they worked: a leave decision or a correction
--         touching an old day erased it. Now only today and later are cleared;
--         their past days compute as anyone's do (H, WO, A, ...). The joining
--         date check is unchanged. The nightly job and attendance_close_day_all
--         still walk only active people, so nobody switched off collects new
--         absences.
--      b. Every early return also deletes that day's attendance_overtime row.
--         Before, a day that stopped counting (a future day, a day before the
--         joining date) kept whatever overtime it had last been given.
--      The 0058 trigger attendance_days_keep_off_day still has the last word on
--      WO and H, exactly as before.
--   3. attendance_month_summary (from 0034) also answers is_payroll(). A
--      payroll-only person (the `payroll` grant without attendance-register)
--      could not read it, so the pay run had no attendance to work from.
--   4. attendance_check (0033) is dropped. Nothing has called it since the QR
--      code replaced the geofence (0043), it was still granted to every signed
--      in user, and it answered how far they were from the office.
--   5. attendance_overtime is read by whoever may open attendance-register, or
--      by payroll, instead of every admin: an Admin the Super Admin has taken
--      the register from no longer reads it, and Accounts running payroll can.
--   6. Holidays.
--      a. Adding, moving, switching off or removing a holiday recomputes that
--         day (the old day and the new one) for everyone, when it is today or
--         earlier and the month is not locked. Before, a holiday added for last
--         Friday left Friday as A for everyone until someone pressed
--         Recalculate. Later days need nothing: they are computed when they come.
--      b. audit_log (0023) now records holiday changes, attendance_settings
--         changes, and the reason given to attendance_unlock_month, which until
--         now reached only the server log. The shape fits: holidays have a uuid
--         id; attendance_settings is one row with a boolean key, and an
--         unlocked month has no row left, so both get a fixed uuid made from
--         their name (md5). The generic audit_row() reads a `doc` column that
--         holidays do not have, so audit_row_plain() diffs the row itself (the
--         settings row: its doc). audit_can_read: holidays follow
--         attendance-holidays, attendance_months follows attendance-register,
--         attendance_settings stays admins only (the fallback).
--   7. attendance_lock_month (from 0034).
--      a. Refuses while the month still has flagged punches or pending
--         corrections, naming how many. Until now a flagged punch (no code, a
--         field punch) was paid in full by the lock without anyone deciding it.
--      b. Takes a share row exclusive lock on regularisations, leave_requests
--         and attendance_punches, so nothing lands between the refusal counts
--         and the lock row. The 30-day recompute runs BEFORE the lock (23).
--   8. Corrections (from 0034).
--      a. regularise_request refuses a time later than now.
--      b. regularise_decide, on approval, first rejects that day's existing
--         punches of each kind the correction gives (review_note 'Replaced by
--         correction'). The day counts the FIRST in and the FIRST out, so an
--         added punch could move a check-in earlier but never a check-out later.
--         The payroll lock guard (0062) still applies to these updates.
--   9. Races. The same per-person lock in regularise_request, leave_apply,
--      leave_decide (on the requester) and leave_undo_adjust (on the entry's
--      owner). A unique index on leave_ledger(ref_id) for reversals makes "undo
--      twice" and "cancel twice" impossible even outside these functions; it is
--      skipped with a NOTICE if existing rows already break it.
--  10. leave_undo_adjust (from 0059). An undo is a 'reversal' row pointing at
--      the ledger entry it undoes, and both readers counted it as leave:
--      leave_balances (0036) put it in "taken this year", and
--      leave_expire_comp_off (0038) counted it as comp-off used. The undo row
--      keeps its reason (the console's ledger drawer finds undone entries by
--      reason = 'reversal', so changing it would break that screen); instead
--      both readers skip a reversal whose ref_id is a ledger row, and the
--      comp-off expiry skips the undone entry too, so the pair cancels out.
--      The yearly automatic grants (a 'grant' with a period) can no longer be
--      undone, as the function's own refusal message always said.
--  11. Anu's reports (from 0046, never redefined since).
--      anu_daily_update counts each day once, by coalesce(override_status,
--      status): a day overridden from P to A was counted present AND absent.
--      Work on a weekly off or a holiday counts as present, never absent.
--      anu_attendance_report counts autoPresent people as present instead of
--      "not checked in", and never calls someone with half a day of leave late.
--      It already says nothing on a holiday or a weekly off.
--  12. module_access_for(user, module): has_module_access() (0055) for a given
--      person, for the service role only. push-notify uses it so a pending
--      leave or correction reaches only the admins who can open the Team
--      section (attendance-team), honouring module_controls and modules_hidden.
--      leave_requests.cancelled_by records who cancelled, so a person
--      cancelling their own approved leave tells the admins, not themselves.
--  13. payroll_run_transition (from 0040) refuses to submit, approve or pay
--      (24) a REGULAR pay run while its month's attendance is not locked. The
--      console checked this only on screen. Off-cycle runs and settlements are
--      exempt.
--  14. attendance_month_summary's `missed` column also counts a day never
--      checked out (status A flagged no_checkout, no override), as the console
--      now does. Such a day is still in `absent` too. Payable is unchanged: it
--      still gives half a day for an MP only, not for these.
--
-- Second pass, from the security and QA review of this file (2026-10-03):
--
--  15. Leave and the lock. leave_decide refuses when any day of the request
--      is in a locked month (the month loop leave_apply uses), so an approval
--      can no longer write a ledger row for a frozen month. attendance_lock_month
--      also refuses while a pending leave request overlaps the month, counted
--      in its message ("... and 1 leave request is waiting for a decision").
--  16. Deciding needs the Team section. regularise_decide, leave_decide, an
--      admin's leave_cancel of someone else's leave, and attendance_review
--      (from 0033) require is_admin() AND has_module_access('attendance-team'),
--      so an Admin the Super Admin has taken Team from cannot decide through
--      the RPCs either.
--  17. regularise_request's monthly cap counts EVERY correction filed for that
--      month, whatever became of it (pending, approved, rejected, cancelled).
--      Before, re-filing after each rejection or cancel kept one pending
--      forever, and with it the month lock refused for ever. The cap value is
--      unchanged (correctionsPerMonth: 5 since 0056, 3 when the key is absent).
--  18. Free text is cut to 500 characters: the reason in regularise_request and
--      leave_apply, and the note in leave_cancel.
--  19. leave_requests.cancel_note (new) holds the note given when a request is
--      cancelled, by anyone. A person cancelling their own request no longer
--      overwrites decision_note, which stays the approver's. An admin
--      cancelling someone's leave writes cancel_note AND, as before,
--      decision_note. push-notify reads cancel_note for "Leave cancelled" and
--      for "Your leave was cancelled" (falling back to decision_note there).
--  20. push-notify: when module_access_for fails, every admin is told only if
--      the function does not exist yet (PGRST202 / 42883). Any other error
--      drops that admin and is logged.
--  21. A code its own viewer scans is flagged. attendance_qr.viewers (new)
--      lists every account attendance_qr_show handed the current code to (a
--      screen already on the list writes nothing); attendance_qr_next empties
--      it whenever a new code is issued (expiry, burn). attendance_punch adds
--      the flag own_code when the person punching is on that list: accepted,
--      flagged for review, so nobody can open the code on their own console and
--      scan it from their desk unseen. A gate kiosk signed in as a person flags
--      every scan THAT person makes there, so the gate should use an account
--      of its own. shown_by / qr_shown_by are unchanged.
--  22. attendance_punch adds the flag other_site when the person's
--      attendance_people.site_ids is not empty and the scanned station is not
--      in it. Accepted, flagged for review.
--  23. attendance_lock_month brings the month's days up to date BEFORE it takes
--      the table locks; under the lock it only counts what refuses it and
--      inserts the lock row, so punches are not held up for the whole
--      recompute. A punch, decision or leave change landing in between
--      recomputes its own day as always. Lock order unchanged: regularisations,
--      leave_requests, attendance_punches.
--  24. payroll_run_transition also refuses 'pay' for a regular run whose month
--      is not locked: an approved run could otherwise be paid after an unlock.
--  25. leave-documents bucket: a person may delete an object in their own
--      folder (the insert policy's rule, 0036) that no leave request's
--      attachment_path names. The console removes an orphan upload after a
--      refused apply.
--
-- A correction to 0056's header: it says the autoPresent list "inherits the
-- table's rule: admins read". It does not. attendance_settings is readable by
-- every active staff member (attendance_settings_read, 0033), so the list is
-- visible to anyone who signs in. It stays that way: phones on 1.8.x read the
-- settings row directly for the shift and the notice.
--
-- Client changes this needs: none required. New: attendance_qr.shown_by,
-- attendance_punches.qr_shown_by, leave_requests.cancelled_by; a punch replay
-- also returns `mode` and, when refused, `message`; new refusals from
-- attendance_lock_month (flagged punches / pending corrections) and
-- regularise_request (a time in the future) and payroll_run_transition
-- (attendance not locked). From the second pass: leave_requests.cancel_note,
-- attendance_qr.viewers; punch flags own_code and other_site; new refusals
-- from attendance_lock_month (pending leave requests), leave_decide (a locked
-- month), payroll_run_transition 'pay' (attendance not locked), and the four
-- decision RPCs for an admin without the Team section.

-- ---- columns -----------------------------------------------------------------

alter table public.attendance_qr
  add column if not exists shown_by uuid references auth.users (id) on delete set null;
alter table public.attendance_punches
  add column if not exists qr_shown_by uuid references auth.users (id) on delete set null;
alter table public.leave_requests
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;
alter table public.leave_requests
  add column if not exists cancel_note text;
alter table public.attendance_qr
  add column if not exists viewers uuid[] not null default '{}';

-- ---- 1. the punch (from 0056) ----------------------------------------------------

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
  v_shown_by uuid;
  require_code boolean;
  is_open boolean;
  v_today date;
  v_open timestamptz;
  v_close timestamptz;
begin
  if uid is null or not public.is_active_staff() then
    raise exception 'Sign in with an active account to mark attendance.';
  end if;

  -- 0065: one punch at a time per person (0042's lock, lost in 0043). Taken
  -- before every check below, so two taps cannot both pass the once-a-day rule.
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || uid::text, 0));

  -- A retry of a punch that already landed returns what it returned then, so a
  -- dropped connection can never burn a second code or punch twice.
  select * into existing from public.attendance_punches where id = p_id;
  if found then
    if existing.user_id <> uid then
      raise exception 'That punch id is taken.';
    end if;
    return jsonb_build_object(
      'status', case when existing.review = 'rejected' then 'refused' when existing.review = 'flagged' then 'flagged' else 'ok' end,
      'id', existing.id, 'kind', existing.kind, 'at', existing.at, 'mode', existing.mode, 'site', existing.site_name,
      'flags', to_jsonb(existing.flags), 'repeat', true,
      'message', case when existing.review = 'rejected'
                      then 'That punch was not accepted by an admin. Ask an admin for a correction.' end
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
    v_shown_by := code.shown_by;
    select s.name into v_site_name from public.work_sites s where s.id = v_site;
    -- 0065 (21): this account was handed this very code by attendance_qr_show.
    if uid = any (code.viewers) then
      v_flags := array_append(v_flags, 'own_code');
    end if;
    -- 0065 (22): a station outside the person's own list.
    if exists (select 1 from public.attendance_people ap
                where ap.user_id = uid and cardinality(ap.site_ids) > 0 and not (v_site = any (ap.site_ids))) then
      v_flags := array_append(v_flags, 'other_site');
    end if;
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
    mode, site_id, site_name, note, device, offline, flags, review, qr_site_id, qr_at, qr_shown_by)
  values (p_id, uid, p_kind, v_at, (v_at at time zone tz)::date, null, false,
    loc.mode, v_site, v_site_name, left(nullif(trim(coalesce(p_note, '')), ''), 500),
    case when p_device is null or length(p_device::text) > 2048 then '{}'::jsonb else p_device end,
    false, v_flags, v_review, v_site,
    case when v_site is not null then v_at end, v_shown_by);

  -- Burn it, and put the next code on the screen in the same transaction. The
  -- next code has not been shown by anyone yet (0065).
  if v_site is not null then
    update public.attendance_qr
       set last_user_id = uid, last_kind = p_kind, last_at = v_at, shown_by = null
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

-- ---- 1d. the code on the screen (from 0043) ---------------------------------------

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
    -- attendance_qr_next empties viewers (0065, 21).
    v_row := public.attendance_qr_next(v_site, auth.uid());
    update public.attendance_qr set shown_by = auth.uid(), viewers = array[auth.uid()]
     where site_id = v_site returning * into v_row;
  elsif v_row.shown_by is null or not (auth.uid() = any (v_row.viewers)) then
    -- 0065: the first screen to fetch a fresh code claims it (shown_by), and
    -- every account handed it joins viewers (21). A screen already on the list
    -- writes nothing, so polling never rewrites the row.
    update public.attendance_qr
       set shown_by = coalesce(shown_by, auth.uid()),
           viewers = case when auth.uid() = any (viewers) then viewers else array_append(viewers, auth.uid()) end
     where site_id = v_site returning * into v_row;
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

-- ---- 21. a new code starts with no viewers (attendance_qr_next, from 0043) ---------------

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
         viewers = '{}',
         updated_at = now()
  returning * into v_row;
  return v_row;
end $$;

-- ---- 2. the day (from 0056) --------------------------------------------------------

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

-- ---- 3. the payroll summary (from 0034) ---------------------------------------------

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
    select a.user_id, coalesce(a.override_status, a.status) as s, a.late, a.worked_min,
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

-- ---- 4. the old geofence pre-check ------------------------------------------------------

drop function if exists public.attendance_check(double precision, double precision, double precision);

-- ---- 5. overtime, the register and payroll --------------------------------------------

drop policy if exists attendance_overtime_admin_read on public.attendance_overtime;
drop policy if exists attendance_overtime_read on public.attendance_overtime;
create policy attendance_overtime_read on public.attendance_overtime
  for select to authenticated
  using (public.has_module_access('attendance-register') or public.is_payroll());

-- ---- 6a. a holiday change recomputes its days ------------------------------------------

create or replace function public.holidays_recompute()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone coalesce((select doc ->> 'timezone' from public.attendance_settings where id), 'Asia/Kolkata'))::date;
  v_old date;
  v_new date;
  d date;
begin
  if tg_op <> 'INSERT' then v_old := old.day; end if;
  if tg_op <> 'DELETE' then v_new := new.day; end if;
  if tg_op = 'UPDATE' then
    if old.day = new.day and old.active = new.active and old.kind = new.kind then
      return null;  -- a new name changes no day
    end if;
  end if;
  foreach d in array array[v_old, nullif(v_new, v_old)] loop
    continue when d is null or d > today or public.attendance_month_locked(d);
    perform public.attendance_close_day_all(d);
  end loop;
  return null;
end $$;

revoke all on function public.holidays_recompute() from public, anon, authenticated;

drop trigger if exists holidays_recompute on public.holidays;
create trigger holidays_recompute after insert or update or delete on public.holidays
  for each row execute function public.holidays_recompute();

-- ---- 6b. holidays and attendance settings in the audit log -----------------------------

-- audit_row() (0023) for tables without a `doc`: the row itself is the doc,
-- except attendance_settings, whose rules ARE its doc (updated_at and
-- updated_by would otherwise show up as a change every time).
create or replace function public.audit_row_plain()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  n jsonb;
  d jsonb;
  v_row uuid;
  v_label text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_table_name = 'attendance_settings' then
    o := o -> 'doc';
    n := n -> 'doc';
    v_row := md5('attendance_settings')::uuid;
    v_label := 'Attendance settings';
  else
    v_row := (coalesce(n, o) ->> 'id')::uuid;
    v_label := concat_ws(', ', coalesce(n, o) ->> 'name', coalesce(n, o) ->> 'day');
  end if;
  d := case tg_op when 'UPDATE' then public.audit_diff(o, n) when 'INSERT' then n else o end;
  if tg_op = 'UPDATE' and d = '{}'::jsonb then
    return null;
  end if;
  insert into public.audit_log (table_name, row_id, action, actor, changes, label)
  values (tg_table_name, v_row, lower(tg_op), auth.uid(), coalesce(d, '{}'::jsonb), v_label);
  return null;
end $$;

revoke all on function public.audit_row_plain() from public, anon, authenticated;

drop trigger if exists holidays_audit on public.holidays;
create trigger holidays_audit after insert or update or delete on public.holidays
  for each row execute function public.audit_row_plain();

drop trigger if exists attendance_settings_audit on public.attendance_settings;
create trigger attendance_settings_audit after update on public.attendance_settings
  for each row execute function public.audit_row_plain();

-- Who reads those entries (from 0053).
create or replace function public.audit_can_read(p_table text)
returns boolean language sql security definer stable set search_path = public as $$
  select case p_table
    when 'products'          then public.has_module_access('products')
    when 'categories'        then public.has_module_access('categories')
    when 'work'              then public.has_module_access('work')
    when 'customers'         then public.has_module_access('customers')
    when 'enquiries'         then public.has_module_access('enquiries') or public.has_module_access('voice-leads')
    when 'leads'             then public.has_module_access('enquiries')
    when 'quotations'        then public.has_module_access('quotations')
    when 'invoices'          then public.has_module_access('invoices')
    when 'payments'          then public.has_module_access('payments')
    when 'social'            then public.has_module_access('social')
    when 'telecaller_jobs'   then public.has_module_access('telecaller')
    -- 0065. attendance_settings has no case of its own: admins, as before.
    when 'holidays'          then public.has_module_access('attendance-holidays')
    when 'attendance_months' then public.has_module_access('attendance-register')
    else public.is_admin()
  end;
$$;

-- ---- 7. the payroll lock (from 0034); 6b. the unlock reason ------------------------------

create or replace function public.attendance_lock_month(p_month date, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  d date;
  n_flagged int;
  n_pending int;
  n_leave int;
begin
  if not public.has_module_access('attendance-register') then
    raise exception 'You cannot lock attendance.';
  end if;
  if m >= date_trunc('month', now() at time zone 'Asia/Kolkata')::date then
    raise exception 'A month can be locked once it is over.';
  end if;
  -- Bring every day up to date first: the lock freezes what is there. 0065
  -- (23): before the table locks, so punches are not held up for the whole
  -- recompute; anything landing meanwhile recomputes its own day.
  d := m;
  while d < (m + interval '1 month')::date loop
    perform public.attendance_close_day_all(d);
    d := d + 1;
  end loop;
  -- 0065: nothing that changes the month may land between the counts below
  -- and the lock row. Waits for writes already in flight, then holds new ones
  -- until this transaction ends. Same order as regularise_decide writes them
  -- (corrections, then punches), so the two cannot deadlock.
  lock table public.regularisations, public.leave_requests, public.attendance_punches in share row exclusive mode;
  -- 0065: a flagged punch, a pending correction or a pending leave request
  -- (15) is a decision nobody has made yet. Locking over it would pay (or
  -- dock) the day without anyone having looked, so they are decided first.
  select count(*) into n_flagged from public.attendance_punches
   where review = 'flagged' and day >= m and day < (m + interval '1 month')::date;
  select count(*) into n_pending from public.regularisations
   where status = 'pending' and day >= m and day < (m + interval '1 month')::date;
  select count(*) into n_leave from public.leave_requests
   where status = 'pending' and from_day < (m + interval '1 month')::date and to_day >= m;
  if n_flagged + n_pending + n_leave > 0 then
    raise exception '% cannot be locked yet: %. Decide them on Attendance (Corrections, Leave requests), then lock the month.',
      to_char(m, 'FMMonth YYYY'),
      concat_ws(' and ',
        case when n_flagged > 0 then n_flagged || ' flagged ' || case when n_flagged = 1 then 'punch is' else 'punches are' end || ' waiting for review' end,
        case when n_pending > 0 then n_pending || ' ' || case when n_pending = 1 then 'correction is' else 'corrections are' end || ' waiting for a decision' end,
        case when n_leave > 0 then n_leave || ' leave ' || case when n_leave = 1 then 'request is' else 'requests are' end || ' waiting for a decision' end);
  end if;
  insert into public.attendance_months (month, locked_by, note) values (m, auth.uid(), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (month) do nothing;
end $$;

/** Only the Super Admin unlocks, and only with a reason (kept in the audit trail). */
create or replace function public.attendance_unlock_month(p_month date, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  gone record;
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can unlock a month.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason for unlocking.';
  end if;
  delete from public.attendance_months where month = date_trunc('month', p_month)::date
  returning * into gone;
  -- 0065: the reason goes into audit_log, not only the server log. The month
  -- row is gone, so the entry keeps who locked it, when, and why it was opened.
  if found then
    insert into public.audit_log (table_name, row_id, action, actor, changes, label)
    values ('attendance_months', md5('attendance_months:' || gone.month::text)::uuid, 'delete', auth.uid(),
            jsonb_build_object('month', gone.month, 'lockedBy', gone.locked_by, 'lockedAt', gone.locked_at,
                               'note', gone.note, 'reason', trim(p_reason)),
            'Attendance for ' || to_char(gone.month, 'FMMonth YYYY') || ' unlocked');
  end if;
  raise log 'attendance month % unlocked by %: %', p_month, auth.uid(), p_reason;
end $$;

-- ---- 8. corrections (from 0034) ---------------------------------------------------------

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
  -- 0065: one request at a time per person, so two cannot both fit under the
  -- monthly cap or both be "the" pending one for a day.
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || uid::text, 0));
  select doc into cfg from public.attendance_settings where id;
  tz := coalesce(cfg ->> 'timezone', 'Asia/Kolkata');
  if p_day > (now() at time zone tz)::date then
    raise exception 'You can only correct a day that has started.';
  end if;
  if p_in_at > now() or p_out_at > now() then
    raise exception 'A correction can only give a time that has already passed.';
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
  -- 0065 (17): every correction filed for the month counts, whatever became of
  -- it, so re-filing after a rejection or a cancel cannot go on for ever.
  select count(*) into used from public.regularisations
   where user_id = uid
     and date_trunc('month', day) = date_trunc('month', p_day);
  if used >= cap then
    raise exception 'You have used all % corrections for this month (rejected and cancelled ones count too).', cap;
  end if;
  insert into public.regularisations (user_id, day, in_at, out_at, reason)
  values (uid, p_day, p_in_at, p_out_at, left(trim(p_reason), 500))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.regularise_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  cfg jsonb;
  tz text;
  v_mode text;
begin
  -- 0065 (16): the Team section too, as the console shows it.
  if not (public.is_admin() and public.has_module_access('attendance-team')) then
    raise exception 'Only an admin with the Team section can decide a correction.';
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
    -- 0065: a correction REPLACES the punches of each kind it gives. The day
    -- counts from the first in and the first out, so a corrected time only
    -- added beside the old ones could never move a check-out later. The old
    -- punches stay on the record, rejected, with the reason.
    update public.attendance_punches
       set review = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
           review_note = 'Replaced by correction'
     where user_id = r.user_id and day = r.day and review <> 'rejected'
       and ((kind = 'in' and r.in_at is not null) or (kind = 'out' and r.out_at is not null));
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

-- ---- 9, 10, 12. leave (leave_balances, leave_apply, leave_decide, leave_cancel from
-- 0036; leave_undo_adjust from 0059; leave_expire_comp_off from 0038) ----------------------

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
                      and l.at >= date_trunc('year', now() at time zone 'Asia/Kolkata')
                      -- 0065: an undone adjustment is not leave given back.
                      and not exists (select 1 from public.leave_ledger o where o.id = l.ref_id)), 0),
         t.paid, t.half_day, t.accrual, t.annual, t.sort
    from public.leave_types t
   where t.active
   order by t.sort;
end $$;

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
  -- 0065: one request at a time per person, so two cannot both spend the same
  -- balance or both pass the overlap check.
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || uid::text, 0));
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
          left(trim(p_reason), 500), nullif(trim(coalesce(p_attachment, '')), ''))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'days', v_days);
end $$;

create or replace function public.leave_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  t record;
  avail numeric;
  d date;
begin
  -- 0065 (16): the Team section too, as the console shows it.
  if not (public.is_admin() and public.has_module_access('attendance-team')) then
    raise exception 'Only an admin with the Team section can decide leave.';
  end if;
  select * into r from public.leave_requests where id = p_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'That request has already been decided.';
  end if;
  if r.user_id = auth.uid() then
    raise exception 'Another admin must decide your own leave.';
  end if;
  -- 0065 (15): a locked month is frozen, so its leave is not decided either
  -- (the same month walk as leave_apply).
  d := r.from_day;
  while d <= r.to_day loop
    if public.attendance_month_locked(d) then
      raise exception 'Attendance for % is locked for payroll.', to_char(d, 'FMMonth YYYY');
    end if;
    d := (date_trunc('month', d) + interval '1 month')::date;
  end loop;
  -- 0065: the requester's lock, so two admins approving two of their requests
  -- at once read the balance one after the other.
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || r.user_id::text, 0));
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

create or replace function public.leave_cancel(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r record;
  t record;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  v_note text := left(nullif(trim(coalesce(p_note, '')), ''), 500);
begin
  select * into r from public.leave_requests where id = p_id for update;
  if not found or r.status not in ('pending', 'approved') then
    raise exception 'That request can no longer be cancelled.';
  end if;
  if r.user_id = auth.uid() then
    if r.status = 'approved' and r.from_day <= today then
      raise exception 'Leave that has started can only be cancelled by an admin.';
    end if;
  -- 0065 (16): the Team section too, as the console shows it.
  elsif not (public.is_admin() and public.has_module_access('attendance-team')) then
    raise exception 'You cannot cancel someone else''s leave.';
  end if;
  if exists (select 1 from public.attendance_months m
              where m.month between date_trunc('month', r.from_day)::date and date_trunc('month', r.to_day)::date) then
    raise exception 'Some of that leave is in a month locked for payroll.';
  end if;
  update public.leave_requests
     set status = 'cancelled', decided_by = coalesce(decided_by, auth.uid()), decided_at = coalesce(decided_at, now()),
         -- 0065 (19): the person's own note never replaces the approver's.
         decision_note = case when r.user_id = auth.uid() then decision_note else coalesce(v_note, decision_note) end,
         cancel_note = v_note,
         cancelled_by = auth.uid()
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

create or replace function public.leave_undo_adjust(p_entry uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
begin
  if not public.has_module_access('leave-balances') then
    raise exception 'You do not have access to manage leave balances. The Super Admin can give it on the Modules page.';
  end if;
  select * into e from public.leave_ledger where id = p_entry;
  if not found then
    raise exception 'That ledger entry no longer exists.';
  end if;
  -- 0065: the owner's lock, so two clicks cannot both pass "already undone".
  perform pg_advisory_xact_lock(hashtextextended('attendance:' || e.user_id::text, 0));
  -- 0065: a grant with a period is the yearly automatic one (leave_grant_year,
  -- the opening grant), not a manual adjustment, so this message covers it.
  if e.reason not in ('adjust', 'grant') or e.period is not null then
    raise exception 'Only a manual adjustment can be undone. Accruals and leave taken follow their own rules.';
  end if;
  if e.user_id = auth.uid() and not public.is_super_admin() then
    raise exception 'Ask the Super Admin to change your own leave balance.';
  end if;
  if exists (select 1 from public.leave_ledger where ref_id = p_entry and reason = 'reversal') then
    raise exception 'That adjustment has already been undone.';
  end if;
  insert into public.leave_ledger (user_id, type_code, delta, reason, ref_id, note, by_user)
  values (e.user_id, e.type_code, -e.delta, 'reversal', e.id,
          'Undone: ' || coalesce(nullif(trim(coalesce(p_note, '')), ''), coalesce(e.note, 'adjustment')), auth.uid());
end $$;

create or replace function public.leave_expire_comp_off()
returns int language plpgsql security definer set search_path = public as $$
declare
  t record;
  r record;
  n int := 0;
  v_expire numeric;
  period text := 'expire-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  for t in select code, expires_days from public.leave_types where expires_days is not null and active loop
    for r in
      select l.user_id,
             -- Granted long enough ago to have expired.
             coalesce(sum(l.delta) filter (where l.delta > 0 and l.reason in ('grant', 'adjust', 'accrual')
                                            and l.at < now() - make_interval(days => t.expires_days)), 0) as old_grants,
             -- Everything that has already used or removed days: taken (net of
             -- give-backs), lapsed, and negative adjustments.
             coalesce(-sum(l.delta) filter (where l.reason in ('taken', 'reversal')), 0)
               + coalesce(-sum(l.delta) filter (where l.reason = 'lapse'), 0)
               + coalesce(-sum(l.delta) filter (where l.reason = 'adjust' and l.delta < 0), 0) as used
        from public.leave_ledger l
       where l.type_code = t.code
         -- 0065: an undone entry and its undo cancel out, so neither counts:
         -- an undone grant is not an old grant, and its undo is not days used.
         and not exists (select 1 from public.leave_ledger o where o.id = l.ref_id)
         and not exists (select 1 from public.leave_ledger u where u.ref_id = l.id and u.reason = 'reversal')
       group by l.user_id
    loop
      v_expire := r.old_grants - r.used;
      if v_expire > 0 then
        insert into public.leave_ledger (user_id, type_code, delta, reason, period, note)
        values (r.user_id, t.code, -v_expire, 'lapse', period,
                'Unused for ' || t.expires_days || ' days, expired')
        on conflict do nothing;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

-- One reversal per thing reversed: a leave request (leave_cancel) or a ledger
-- entry (leave_undo_adjust). Created only if the data already agrees.
do $$
begin
  if exists (select 1 from public.leave_ledger
              where reason = 'reversal' and ref_id is not null
              group by ref_id having count(*) > 1) then
    raise notice '0065: leave_ledger has more than one reversal for the same ref_id; leave_ledger_reversal_once was NOT created. Remove the duplicates, then create it by hand.';
  else
    create unique index if not exists leave_ledger_reversal_once
      on public.leave_ledger (ref_id) where reason = 'reversal';
  end if;
end $$;

-- ---- 11. Anu's reports (from 0046) -------------------------------------------------------

create or replace function public.anu_attendance_report(p_team text, p_day date, p_phase text default 'now')
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.anu_tz();
  v_set jsonb := coalesce((select doc from public.attendance_settings where id), '{}'::jsonb);
  v_start timestamptz := public.attendance_at(p_day, coalesce(v_set #>> '{shift,start}', '09:30'), v_tz);
  v_grace int := coalesce((v_set ->> 'graceMin')::int, 15);
  v_title text := (select title from public.anu_teams() where key = p_team);
  v_total int := 0;
  v_in int := 0;
  v_lines text[] := '{}';
  v_in_list text[] := '{}';
  v_late text[] := '{}';
  v_missing text[] := '{}';
  v_leave text[] := '{}';
  v_open text[] := '{}';
  r record;
begin
  if public.attendance_is_off_day(p_day) then return null; end if;

  for r in
    select p.id, public.anu_first(p.name) as first,
      (select min(a.at) from public.attendance_punches a where a.user_id = p.id and a.day = p_day and a.kind = 'in' and a.review <> 'rejected') as first_in,
      (select max(a.at) from public.attendance_punches a where a.user_id = p.id and a.day = p_day and a.kind = 'out' and a.review <> 'rejected') as last_out,
      (select l.type_code || case when l.from_day = p_day and l.from_half = 'second' then ', from lunch'
                                  when l.to_day = p_day and l.to_half = 'first' then ', till lunch' else '' end
         from public.leave_requests l
        where l.user_id = p.id and l.status = 'approved' and p_day between l.from_day and l.to_day limit 1) as leave,
      -- 0065: present on every working day without punching (0056).
      coalesce(v_set -> 'autoPresent' @> to_jsonb(p.id::text), false) as auto
    from public.profiles p
    where p.id in (select public.anu_team_people(p_team))
    order by p.name
  loop
    v_total := v_total + 1;
    if r.leave is not null and r.first_in is null then
      v_leave := v_leave || (r.first || ' (' || r.leave || ')');
      continue;
    end if;
    if r.first_in is null and r.auto then
      -- 0065: marked present by standing instruction, never "not checked in".
      v_in := v_in + 1;
      v_in_list := v_in_list || (r.first || ' (present, no scan needed)');
      continue;
    end if;
    if r.first_in is null then
      v_missing := v_missing || r.first;
      continue;
    end if;
    v_in := v_in + 1;
    -- 0065: half a day of leave moves the start, so it is never late (the day
    -- itself is not marked late either, attendance_recompute_day).
    if r.leave is null and r.first_in > v_start + make_interval(mins => v_grace) then
      v_late := v_late || (r.first || ' ' || to_char(r.first_in at time zone v_tz, 'HH24:MI') || ', '
        || (extract(epoch from (r.first_in - v_start)) / 60)::int || ' min late');
    else
      v_in_list := v_in_list || (r.first || ' ' || to_char(r.first_in at time zone v_tz, 'HH24:MI'));
    end if;
    if r.last_out is null or r.last_out < r.first_in then
      v_open := v_open || (r.first || ', in since ' || to_char(r.first_in at time zone v_tz, 'HH24:MI'));
    end if;
  end loop;

  if v_total = 0 then return null; end if;

  if p_phase = 'evening' then
    v_lines := v_lines || ('Attendance summary, ' || v_title || ', ' || to_char(p_day, 'FMDay, FMDD FMMonth'));
    v_lines := v_lines || ('Present: ' || v_in || ' of ' || v_total
      || case when cardinality(v_leave) > 0 then ', on leave: ' || cardinality(v_leave) else '' end
      || case when cardinality(v_missing) > 0 then ', absent: ' || cardinality(v_missing) else '' end);
    if cardinality(v_missing) > 0 then v_lines := v_lines || ('Absent (no check-in): ' || array_to_string(v_missing, ', ')); end if;
    if cardinality(v_leave) > 0 then v_lines := v_lines || ('On leave: ' || array_to_string(v_leave, ', ')); end if;
    if cardinality(v_late) > 0 then v_lines := v_lines || ('Came late: ' || array_to_string(v_late, '; ')); end if;
    if cardinality(v_open) > 0 then
      v_lines := v_lines || ('Not checked out yet: ' || array_to_string(v_open, '; ') || '. Please check out in the Ortex app.');
    end if;
  else
    v_lines := v_lines || ('Attendance, ' || v_title || ', ' || to_char(p_day, 'FMDay, FMDD FMMonth')
      || ' at ' || to_char(now() at time zone v_tz, 'HH24:MI'));
    v_lines := v_lines || ('Checked in: ' || v_in || ' of ' || v_total);
    if cardinality(v_in_list) > 0 then v_lines := v_lines || ('On time: ' || array_to_string(v_in_list, ', ')); end if;
    if cardinality(v_late) > 0 then v_lines := v_lines || ('Late: ' || array_to_string(v_late, '; ')); end if;
    if cardinality(v_missing) > 0 then
      v_lines := v_lines || ('Not checked in yet: ' || array_to_string(v_missing, ', ')
        || case when p_phase = 'morning' then '. If you are working today, please scan the QR code in the Ortex app.' else '' end);
    end if;
    if cardinality(v_leave) > 0 then v_lines := v_lines || ('On leave: ' || array_to_string(v_leave, ', ')); end if;
    if cardinality(v_missing) = 0 and v_in = v_total - cardinality(v_leave) then
      v_lines := v_lines || 'Everyone expected today has checked in.'::text;
    end if;
  end if;
  return array_to_string(v_lines, E'\n');
end;
$$;

create or replace function public.anu_daily_update(p_team text, p_day date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.anu_tz();
  v_yday date := p_day - 1;
  v_now timestamptz := now();
  v_lines text[] := '{}';
  v_list text[];
  n1 int; n2 int; n3 int;
  m1 numeric; m2 numeric;
  v_voice constant text := 'Voice assistant (Anu)';
  v_holiday record;
begin
  if public.attendance_is_off_day(p_day) then return null; end if;
  v_lines := v_lines || ('Good morning, ' || (select title from public.anu_teams() where key = p_team)
    || '. Your update for ' || to_char(p_day, 'FMDay, FMDD FMMonth') || '.');

  if p_team in ('sales', 'management') then
    select count(*) filter (where coalesce(doc ->> 'source', '') <> v_voice and public.anu_day(created_at) = v_yday),
           count(distinct coalesce(doc #>> '{call,id}', id::text)) filter (where doc ->> 'source' = v_voice and public.anu_day(created_at) = v_yday),
           count(*) filter (where coalesce(doc ->> 'source', '') <> v_voice and coalesce(doc ->> 'status', 'new') = 'new')
      into n1, n2, n3
      from public.enquiries;
    v_lines := v_lines || ('Leads yesterday: ' || n1 || ' website ' || case when n1 = 1 then 'enquiry' else 'enquiries' end
      || ', ' || n2 || ' Anu ' || case when n2 = 1 then 'call' else 'calls' end || '.');
    if n3 > 0 then
      select count(*) into n1 from public.enquiries
       where coalesce(doc ->> 'source', '') <> v_voice and coalesce(doc ->> 'status', 'new') = 'new' and created_at < v_now - interval '2 days';
      v_lines := v_lines || ('Still new, not contacted: ' || n3 || case when n1 > 0 then ' (' || n1 || ' waiting over 2 days)' else '' end || '.');
    end if;

    select count(*), coalesce(sum((doc #>> '{totals,grandTotal}')::numeric), 0) into n1, m1
      from public.quotations
     where coalesce(doc ->> 'status', 'draft') <> 'draft' and public.anu_day(coalesce(public.anu_ts(doc -> 'issueDate'), created_at)) = v_yday;
    select count(*), coalesce(sum((doc #>> '{totals,grandTotal}')::numeric), 0) into n2, m2
      from public.quotations
     where doc ->> 'status' in ('accepted', 'invoiced') and public.anu_day(updated_at) = v_yday;
    v_lines := v_lines || ('Quotations yesterday: ' || n1 || ' sent (' || public.anu_money(m1) || '), '
      || n2 || ' won (' || public.anu_money(m2) || ').');

    select array_agg(line order by until) into v_list from (
      select coalesce(doc ->> 'number', 'Quotation') || ', ' || public.anu_party(doc -> 'customer') || ', '
             || public.anu_money((doc #>> '{totals,grandTotal}')::numeric) || ', valid till '
             || to_char(public.anu_ts(doc -> 'validUntil') at time zone v_tz, 'FMDD FMMon') as line,
             public.anu_ts(doc -> 'validUntil') as until
        from public.quotations
       where doc ->> 'status' = 'sent'
         and public.anu_ts(doc -> 'validUntil') between v_now and v_now + interval '3 days'
       order by 2 limit 5) x;
    if v_list is not null then
      v_lines := v_lines || ('Expiring in 3 days, follow up:' || E'\n- ' || array_to_string(v_list, E'\n- '));
    end if;

    select count(*), coalesce(sum((doc #>> '{totals,grandTotal}')::numeric), 0) into n1, m1
      from public.quotations where doc ->> 'status' = 'sent';
    v_lines := v_lines || ('Open pipeline: ' || n1 || ' sent ' || case when n1 = 1 then 'quotation' else 'quotations' end
      || ' worth ' || public.anu_money(m1) || '.');
  end if;

  if p_team in ('accounts', 'management') then
    with inv as (
      select i.id, i.doc,
             coalesce((i.doc #>> '{totals,grandTotal}')::numeric, 0)
               - coalesce((select sum((p.doc ->> 'amount')::numeric) from public.payments p
                            where p.doc ->> 'invoiceId' = i.id::text and p.doc ->> 'type' = 'inflow'), 0) as balance,
             public.anu_ts(i.doc -> 'dueDate') as due
        from public.invoices i
       where coalesce(i.doc ->> 'status', '') not in ('paid', 'cancelled', 'draft')
    )
    select count(*) filter (where balance > 0.5 and due < v_now),
           coalesce(sum(balance) filter (where balance > 0.5 and due < v_now), 0),
           count(*) filter (where balance > 0.5 and due between v_now and v_now + interval '3 days'),
           coalesce(sum(balance) filter (where balance > 0.5 and due between v_now and v_now + interval '3 days'), 0)
      into n1, m1, n2, m2
      from inv;
    v_lines := v_lines || ('Overdue invoices: ' || n1 || ' (' || public.anu_money(m1) || ').'
      || case when n2 > 0 then ' Due in the next 3 days: ' || n2 || ' (' || public.anu_money(m2) || ').' else '' end);

    select array_agg(line) into v_list from (
      select coalesce(i.doc ->> 'number', 'Invoice') || ', ' || public.anu_party(i.doc -> 'customer') || ', '
             || public.anu_money(bal) || ', ' || (p_day - public.anu_day(public.anu_ts(i.doc -> 'dueDate'))) || ' days late' as line
        from (
          select i.*, coalesce((i.doc #>> '{totals,grandTotal}')::numeric, 0)
                 - coalesce((select sum((p.doc ->> 'amount')::numeric) from public.payments p
                              where p.doc ->> 'invoiceId' = i.id::text and p.doc ->> 'type' = 'inflow'), 0) as bal
            from public.invoices i
           where coalesce(i.doc ->> 'status', '') not in ('paid', 'cancelled', 'draft')
             and public.anu_ts(i.doc -> 'dueDate') < v_now
        ) i
       where bal > 0.5
       order by bal desc limit 3) x;
    if v_list is not null then
      v_lines := v_lines || ('Biggest overdue:' || E'\n- ' || array_to_string(v_list, E'\n- '));
    end if;

    select count(*), coalesce(sum((doc ->> 'amount')::numeric), 0) into n1, m1
      from public.payments
     where doc ->> 'type' = 'inflow' and public.anu_day(coalesce(public.anu_ts(doc -> 'date'), created_at)) = v_yday;
    v_lines := v_lines || ('Payments received yesterday: ' || n1 || ' (' || public.anu_money(m1) || ').');
  end if;

  if p_team in ('accounts', 'management') then
    select count(*) into n1 from public.leave_requests where status = 'pending';
    select count(*) into n2 from public.regularisations where status = 'pending';
    if n1 + n2 > 0 then
      v_lines := v_lines || ('Waiting for approval: ' || n1 || ' leave ' || case when n1 = 1 then 'request' else 'requests' end
        || ', ' || n2 || ' attendance ' || case when n2 = 1 then 'correction' else 'corrections' end || '.');
    end if;
  end if;

  if p_team in ('staff', 'management', 'accounts') then
    -- 0065: one verdict per day, the override's when there is one, so a day
    -- overridden from P to A is no longer counted present AND absent. Work on a
    -- weekly off or a holiday counts as present, never as absent.
    select count(*) filter (where coalesce(d.override_status, d.status) in ('P', 'HD', 'OD')
                               or (d.override_status is null and 'worked_off_day' = any (d.flags))),
           count(*) filter (where coalesce(d.override_status, d.status) = 'A'
                               and not (d.override_status is null and 'worked_off_day' = any (d.flags))),
           count(*) filter (where d.late)
      into n1, n2, n3
      from public.attendance_days d
     where d.day = v_yday
       and d.user_id in (select public.anu_team_people(case when p_team = 'staff' then 'staff' else 'everyone' end));
    if n1 + n2 > 0 then
      v_lines := v_lines || ('Attendance yesterday' || case when p_team = 'staff' then '' else ' (whole company)' end || ': '
        || n1 || ' present, ' || n2 || ' absent, ' || n3 || ' late.');
    end if;
  end if;

  select h.day, h.name into v_holiday from public.holidays h
   where h.active and h.kind <> 'optional' and h.day > p_day and h.day <= p_day + 14
   order by h.day limit 1;
  if found then
    v_lines := v_lines || ('Coming up: ' || v_holiday.name || ' holiday on ' || to_char(v_holiday.day, 'FMDay, FMDD FMMonth') || '.');
  end if;

  return array_to_string(v_lines, E'\n');
end;
$$;


-- ---- 12. module access for someone else, for push-notify ----------------------------------

-- has_module_access() (0055) with the person as an argument instead of
-- auth.uid(). Keep the two in step. Service role only: it would otherwise let
-- anyone ask what a colleague can open.
create or replace function public.module_access_for(p_user uuid, p_module text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
      from public.profiles p
      left join public.role_permissions r on r.role = p.role
      left join public.module_controls c on c.key = p_module
     where p.id = p_user
       and p.active = true
       and (
         p.role = 'super_admin'
         or (
           coalesce(c.enabled, true)
           and not coalesce(p.modules_hidden, '[]'::jsonb) @> jsonb_build_array(p_module)
           and (
             (p.role = 'admin' and coalesce(c.admin_access, true))
             or p.modules @> jsonb_build_array(p_module)
             or coalesce(r.modules, '[]'::jsonb) @> jsonb_build_array(p_module)
           )
         )
       )
  );
$$;

revoke all on function public.module_access_for(uuid, text) from public, anon, authenticated;
grant execute on function public.module_access_for(uuid, text) to service_role;

-- ---- 13. a regular pay run waits for locked attendance (payroll_run_transition, from 0040) ----

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
  -- 0065: a regular run pays the month's attendance, so it goes forward only
  -- once that attendance is locked and can no longer change under it. Off-cycle
  -- runs and settlements are not tied to a month's register. Paying too (24):
  -- an approved run would otherwise be paid after its month was unlocked.
  if p_action in ('submit', 'approve', 'pay') and r.kind = 'regular' and not public.attendance_month_locked(r.month) then
    raise exception 'Lock attendance for % first (Attendance, Register), then submit, approve or pay this pay run.',
      to_char(r.month, 'FMMonth YYYY');
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

-- ---- 16. reviewing a punch needs the Team section (attendance_review, from 0033) ----------

create or replace function public.attendance_review(p_id uuid, p_decision text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 0065 (16): the Team section too, as the console shows it.
  if not (public.is_admin() and public.has_module_access('attendance-team')) then
    raise exception 'Only an admin with the Team section can review attendance.';
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

-- ---- 25. a person removes their own unused leave document (from 0036) --------------------

drop policy if exists leave_documents_delete on storage.objects;
create policy leave_documents_delete on storage.objects for delete to authenticated
  using (bucket_id = 'leave-documents' and public.is_active_staff()
         and (storage.foldername(name))[1] = auth.uid()::text
         and not exists (select 1 from public.leave_requests r where r.attachment_path = objects.name));
