-- Migration 0018: telecaller call recordings
--
-- Practice calls (Gemini Live in the console) are recorded in the browser and
-- uploaded here; the path is stored on the telecaller_calls row as
-- doc.recordingPath. Real phone calls keep the provider's recording URL.
--
-- PRIVATE bucket: a recording is a customer conversation. Staff with the
-- telecaller module upload and play back (via short-lived signed URLs); nothing
-- is readable anonymously.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'telecaller-recordings',
  'telecaller-recordings',
  false,
  52428800, -- 50 MB: an hour of Opus is well under this
  array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists telecaller_recordings_read on storage.objects;
create policy telecaller_recordings_read on storage.objects
  for select to authenticated
  using (bucket_id = 'telecaller-recordings' and public.has_module_access('telecaller'));

drop policy if exists telecaller_recordings_insert on storage.objects;
create policy telecaller_recordings_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'telecaller-recordings' and public.has_module_access('telecaller'));

-- No update / delete for staff: a recording is evidence of what was said.
