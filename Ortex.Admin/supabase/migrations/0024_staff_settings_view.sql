-- 0024_staff_settings_view.sql
--
-- Every quotation is priced and numbered from the settings singleton: the
-- company's GSTIN and home state (CGST/SGST vs IGST), the number prefix, the
-- default validity and terms. But `settings` is admin-only (0007's
-- `admin_settings` policy), and rightly so: the same row carries the
-- integration and telecaller blocks with their keys.
--
-- The result for a Sales Executive was silent and wrong. Both clients read the
-- row, got back NOTHING (RLS filters rows, it does not error), merged that over
-- the built-in defaults, and cached them. Their PDFs went out with the
-- placeholder GSTIN 07ABCDE1234F1Z5 and "New Delhi, India" as the seller, and
-- every quotation was taxed as if the company sat in Delhi. Admins never saw it.
--
-- Same shape as 0020 and 0023: a view that rebuilds the doc as an ALLOW-LIST of
-- the four document blocks, owned by postgres and run with the owner's rights
-- (security_invoker off), so it bypasses the table policy and can hand out only
-- what it names. The table itself stays admin-only; a key added to `company`
-- later is visible to staff automatically, a new top-level block is not until
-- it is named here.

drop view if exists public.settings_staff;
create view public.settings_staff as
  select
    s.id,
    jsonb_build_object(
      'company',   coalesce(s.doc->'company',   '{}'::jsonb),
      'tax',       coalesce(s.doc->'tax',       '{}'::jsonb),
      'numbering', coalesce(s.doc->'numbering', '{}'::jsonb),
      'quotation', coalesce(s.doc->'quotation', '{}'::jsonb)
    ) as doc,
    s.updated_at
  from public.settings s
  where public.is_active_staff();

grant select on public.settings_staff to authenticated;

comment on view public.settings_staff is
  'The document blocks of settings (company, tax, numbering, quotation) for any active staff member. Allow-list: never notifications, integrations or telecaller.';
