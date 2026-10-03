-- 0078: a logo per company (multi-company, phase 2).
--
-- Every printed quotation, tax invoice and receipt carries its company's logo
-- and name (Control centre -> Companies). The file lives in the public bucket
-- `company-logos` at `<company id>/<timestamp>-logo.<ext>`, so a new upload is
-- a NEW URL (phones cache by URL), and its public URL is saved as
-- companies.doc.company.logoUrl. Same pattern as the public buckets in 0050:
-- anyone with the URL can fetch a file (a customer's PDF needs it), nobody can
-- LIST the bucket anonymously, and only a Super Admin writes, as only a Super
-- Admin edits companies (0075). PNG, JPEG, SVG or WebP, up to 1 MB.
-- Safe to run twice.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-logos', 'company-logos', true, 1048576,
        array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_logos_read on storage.objects;
create policy company_logos_read on storage.objects
  for select to authenticated using (bucket_id = 'company-logos');

drop policy if exists company_logos_insert on storage.objects;
create policy company_logos_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'company-logos' and public.is_super_admin());

drop policy if exists company_logos_update on storage.objects;
create policy company_logos_update on storage.objects
  for update to authenticated using (bucket_id = 'company-logos' and public.is_super_admin());

drop policy if exists company_logos_delete on storage.objects;
create policy company_logos_delete on storage.objects
  for delete to authenticated using (bucket_id = 'company-logos' and public.is_super_admin());
