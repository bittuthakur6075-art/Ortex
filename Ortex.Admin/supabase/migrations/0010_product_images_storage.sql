-- 0010_product_images_storage.sql
--
-- Product photos used to be stored as base64 data-URLs inside each product's
-- JSONB doc. That bloats every row, is capped by JSON/localStorage size, and
-- ships megabytes of duplicated bytes to the public website on every catalogue
-- read. Give product images a real home.
--
-- PUBLIC bucket: unlike customer artwork (private, 0009), product photos are
-- marketing assets meant to be shown on the website, so anyone may read them via
-- the public object URL. Only active staff may upload, replace, or delete.
-- Depends on 0007 (is_active_staff).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB; images are compressed client-side well below this
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone (incl. anonymous website visitors) may read product images.
drop policy if exists public_read_product_images on storage.objects;
create policy public_read_product_images on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'product-images');

-- Only signed-in, active staff may upload.
drop policy if exists staff_upload_product_images on storage.objects;
create policy staff_upload_product_images on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_active_staff());

-- Only active staff may replace/overwrite.
drop policy if exists staff_update_product_images on storage.objects;
create policy staff_update_product_images on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and public.is_active_staff());

-- Only active staff may delete.
drop policy if exists staff_delete_product_images on storage.objects;
create policy staff_delete_product_images on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and public.is_active_staff());
