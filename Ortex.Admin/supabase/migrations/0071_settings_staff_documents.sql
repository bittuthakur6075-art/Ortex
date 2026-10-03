-- 0071: staff read the printed wording of documents.
--
-- Settings gained a `documents` block (Control centre -> Documents): invoice
-- terms and the closing line of quotations, invoices and receipts. Accounts
-- and Sales print those documents, so settings_staff (0024) shows it beside
-- company, tax, numbering and quotation. Still an allow-list: never
-- notifications, integrations or telecaller.

create or replace view public.settings_staff as
  select
    s.id,
    jsonb_build_object(
      'company',   coalesce(s.doc->'company',   '{}'::jsonb),
      'tax',       coalesce(s.doc->'tax',       '{}'::jsonb),
      'numbering', coalesce(s.doc->'numbering', '{}'::jsonb),
      'quotation', coalesce(s.doc->'quotation', '{}'::jsonb),
      'documents', coalesce(s.doc->'documents', '{}'::jsonb)
    ) as doc,
    s.updated_at
  from public.settings s
  where public.is_active_staff();

revoke all on public.settings_staff from anon;
grant select on public.settings_staff to authenticated;

comment on view public.settings_staff is
  'The document blocks of settings (company, tax, numbering, quotation, documents) for any active staff member. Allow-list: never notifications, integrations or telecaller.';
