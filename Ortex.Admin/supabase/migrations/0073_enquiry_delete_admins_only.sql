-- 0073: deleting a lead is for admins only, in the database as in the console.
--
-- staff_enquiries (0007) was one FOR ALL policy, so anyone with the Leads
-- module could DELETE enquiries straight through the API, while the console
-- offers Delete (lead page, bulk delete, Voice calls) only to admins. A lead
-- is the sales history of a customer, and a delete cannot be undone from the
-- database, so the delete moves to its own policy: an admin who can also open
-- Leads or Voice calls. Reading, adding and editing are unchanged. The service
-- role (edge functions, maintenance scripts) bypasses RLS as before.

drop policy if exists staff_enquiries on public.enquiries;

create policy staff_enquiries_read on public.enquiries
  for select to authenticated using (public.has_module_access('enquiries'));

create policy staff_enquiries_insert on public.enquiries
  for insert to authenticated with check (public.has_module_access('enquiries'));

create policy staff_enquiries_update on public.enquiries
  for update to authenticated
  using (public.has_module_access('enquiries')) with check (public.has_module_access('enquiries'));

create policy staff_enquiries_delete on public.enquiries
  for delete to authenticated
  using (public.is_admin() and (public.has_module_access('enquiries') or public.has_module_access('voice-leads')));
