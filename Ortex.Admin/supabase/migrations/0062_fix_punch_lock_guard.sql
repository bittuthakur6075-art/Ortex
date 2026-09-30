-- 0062: URGENT. Clocking in and out was broken by 0060.
--
-- 0060 dropped attendance_punches.selfie_path. attendance_punches_lock_guard()
-- is a BEFORE INSERT OR UPDATE trigger on that table and still read
-- `new.selfie_path`, so PL/pgSQL raised
--
--     record "new" has no field "selfie_path"
--
-- on EVERY punch. Nobody could clock in or out from the moment 0060 landed
-- (2026-09-30, about 22:00 IST) until this ran. Found from a phone screenshot,
-- not from a test: dropping a column is not a local change, and I did not look
-- for the triggers reading it.
--
-- The clause existed only for the selfie purge, which cleared selfie_path on
-- old punches inside locked months and needed a way past the payroll lock.
-- There is no purge and no column any more, so the exemption goes with them and
-- the guard does the one thing it is for: refuse a write to a locked month.
--
-- Nothing else changes. The exemption never covered a review or a time change
-- (it required every one of those to be unchanged), so no write that used to be
-- refused is now allowed, and none that used to pass is now refused.

create or replace function public.attendance_punches_lock_guard()
returns trigger language plpgsql as $$
begin
  if public.attendance_month_locked(new.day) then
    raise exception 'Attendance for % is locked for payroll.', to_char(new.day, 'FMMonth YYYY');
  end if;
  return new;
end $$;

-- The two helpers the purge used. Nothing calls them: the Edge Function and its
-- cron job were deleted in 0060, and both read the column that no longer exists.
drop function if exists public.attendance_expired_selfies(integer);
drop function if exists public.attendance_selfies_purged(uuid[]);
