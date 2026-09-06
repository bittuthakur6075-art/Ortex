-- 0022_admin_only_quotation_delete.sql
--
-- Deleting a quotation becomes an ADMIN-ONLY act, in the database.
--
-- Until now the phone hid its "Delete quotation" menu item behind
-- `profile.role === "admin"` while the database allowed the delete outright:
-- 0007 replaced 0001's blanket `staff_all` with
--
--   create policy staff_quotations on public.quotations
--     for all to authenticated
--     using (public.has_module_access('quotations'))
--     with check (public.has_module_access('quotations'));
--
-- `for all` includes DELETE, and `has_module_access` is true for any active
-- staff member granted the `quotations` module — which is the default grant for
-- a Sales Executive. So the UI check stopped a tap, not a delete: the same
-- account could remove a quotation through the console's own delete button, or
-- straight through PostgREST with the anon key it already holds.
--
-- A quotation is a sent commercial document with an allocated number from the
-- `sequences` series. Deleting one leaves a hole in that series and takes the
-- history of what was promised with it, which is exactly the kind of act that
-- should need the person who is accountable for it.
--
-- SO: the one `for all` policy becomes four verbs. SELECT / INSERT / UPDATE keep
-- the module rule unchanged — nothing about who may quote is altered here — and
-- DELETE alone narrows to `is_admin()`, which already requires `active` (0002).
--
-- The same split is deliberately NOT applied to invoices or payments. Those are
-- accounting records with their own consequences, and a change to them is the
-- console's decision to make, not a side effect of tightening quotations.
--
-- CONSOLE EFFECT: `Ortex.Admin/src/pages/Quotations.jsx` shows its Delete button
-- to every staff user. After this migration that button will fail for a
-- non-admin with an RLS error instead of deleting. Gating it there is a UI
-- change to make alongside this, not a reason to leave the database open.

drop policy if exists staff_quotations on public.quotations;

create policy staff_quotations_read on public.quotations
  for select to authenticated
  using (public.has_module_access('quotations'));

create policy staff_quotations_insert on public.quotations
  for insert to authenticated
  with check (public.has_module_access('quotations'));

create policy staff_quotations_update on public.quotations
  for update to authenticated
  using (public.has_module_access('quotations'))
  with check (public.has_module_access('quotations'));

-- The narrowing. `is_admin()` is security definer and checks role = 'admin'
-- AND active, so a deactivated admin cannot delete either.
create policy admin_quotations_delete on public.quotations
  for delete to authenticated
  using (public.is_admin());
