-- 0058: work on a weekly off or a holiday is extra time, never a shortfall.
--
-- Owner's decision 2026-09-30: Sunday stays the default weekend (weeklyOff
-- [0], 0033), and someone who comes in on a Sunday or a holiday because work
-- is heavy has their check-in, check-out and hours recorded, but the day is
-- NOT marked absent or half day for leaving before a shift's length: that time
-- is extra for the company, not a working day falling short.
--
-- So a day whose punches fall on a day off keeps the day-off status: WO on a
-- weekly off, H on a holiday. first_in, last_out, worked_min and the flags
-- (`worked_off_day`, and `no_checkout` / `short_hours` where they apply) stay
-- exactly as computed, so both clients still show the times and "Worked on a
-- day off", and 0056's overtime (every minute on a day off, admins only)
-- still counts the hours.
--
-- Done as a guard on attendance_days rather than inside
-- attendance_recompute_day(), so it holds for whichever version of that
-- function is live (0036, or 0056's rewrite) and for any later one. The
-- Super Admin's override_status is a separate column and still wins.

create or replace function public.attendance_days_keep_off_day()
returns trigger language plpgsql as $$
declare
  is_holiday boolean;
begin
  if 'worked_off_day' = any (new.flags) and new.status in ('P', 'OD', 'HD', 'A', 'MP') then
    is_holiday := exists (
      select 1 from public.holidays h
       where h.day = new.day and h.active and h.kind <> 'optional'
    );
    new.status := case when is_holiday then 'H' else 'WO' end;
  end if;
  return new;
end $$;

drop trigger if exists attendance_days_keep_off_day on public.attendance_days;
create trigger attendance_days_keep_off_day
  before insert or update on public.attendance_days
  for each row execute function public.attendance_days_keep_off_day();

-- Days already computed: re-save the ones worked on a day off so the guard
-- applies to them. Locked (paid) months are left exactly as they were.
update public.attendance_days d
   set status = d.status
 where 'worked_off_day' = any (d.flags)
   and d.status in ('P', 'OD', 'HD', 'A', 'MP')
   and not public.attendance_month_locked(d.day);
