-- 0057: managing holidays becomes a module, `attendance-holidays`.
--
-- Until now only the Super Admin could add, change or remove a holiday (0034).
-- Owner's decision 2026-09-30: Admins manage them too, and the Super Admin
-- decides who else may, on the Modules page like any other module (the Admin
-- column is on by default; role ticks, personal ticks, hiding and the company
-- switch all apply through has_module_access()). Everyone active still READS
-- holidays (holidays_read, 0034).

drop policy if exists holidays_super_write on public.holidays;
drop policy if exists holidays_manage on public.holidays;
create policy holidays_manage on public.holidays for all to authenticated
  using (public.has_module_access('attendance-holidays'))
  with check (public.has_module_access('attendance-holidays'));
