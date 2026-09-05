-- 0019_profile_avatars.sql
--
-- Profile photos. Each staff account may upload one avatar; it shows in the
-- header account button, the account popover and on /profile.
--
-- PUBLIC bucket (like product-images, 0010): the object URL is embedded in an
-- <img> and needs no signing. Writes are scoped to the owner's own folder, so
-- one user can never replace or delete another user's photo.
--
-- profiles.avatar_url holds the public URL. It is NOT in the list that
-- protect_profile_privileges() (0003/0008) forces back to its old value, so the
-- existing profiles_self_update policy already lets a user set their own.

alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152, -- 2 MB; the browser crops to a 256px square well below this
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read an avatar (the URL is public and unguessable).
drop policy if exists public_read_avatars on storage.objects;
create policy public_read_avatars on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Write access is owner-only: the first path segment must be the caller's uid,
-- so avatars are stored as `<uid>/<random>.jpg`.
drop policy if exists own_upload_avatar on storage.objects;
create policy own_upload_avatar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists own_update_avatar on storage.objects;
create policy own_update_avatar on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists own_delete_avatar on storage.objects;
create policy own_delete_avatar on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
