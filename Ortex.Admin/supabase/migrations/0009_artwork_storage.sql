-- 0009_artwork_storage.sql
--
-- The website quote builder promised artwork upload but only ever transmitted
-- the file name. Give the bytes somewhere to land.
--
-- Private bucket: customer logos and vector art are their intellectual property.
-- Anonymous visitors may INSERT (upload) only -- nothing anonymous can read,
-- list, update, or delete. Active staff read it from the admin console via a
-- signed URL. Depends on 0007 (is_active_staff).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artwork',
  'artwork',
  false,
  10485760, -- 10 MB, mirrors MAX_ARTWORK_BYTES in Ortex.Web/src/lib/uploads.js
  array[
    'application/pdf',
    'application/postscript',   -- .ai, .eps
    'application/illustrator',
    'application/x-coreldraw',  -- .cdr
    'image/x-coreldraw',
    'application/dxf',
    'image/vnd.dxf',
    'image/svg+xml',
    'image/png',
    'image/jpeg',
    -- Browsers report an empty MIME type for .cdr/.dxf, so the client sends
    -- octet-stream. The extension whitelist in uploads.js is the real gate.
    'application/octet-stream'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload-only for the public site. No select/update/delete grant to anon.
drop policy if exists anon_upload_artwork on storage.objects;
create policy anon_upload_artwork on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'artwork');

-- Only signed-in, active staff can read customer artwork back.
drop policy if exists staff_read_artwork on storage.objects;
create policy staff_read_artwork on storage.objects
  for select to authenticated
  using (bucket_id = 'artwork' and public.is_active_staff());

drop policy if exists staff_manage_artwork on storage.objects;
create policy staff_manage_artwork on storage.objects
  for delete to authenticated
  using (bucket_id = 'artwork' and public.is_active_staff());
