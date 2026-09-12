-- Migration 0025: website voice-call recordings (Anu)
--
-- The website voice assistant records each call in the visitor's browser (both
-- voices mixed into one Opus file) and uploads it here when the call ends, but
-- only when the call produced a lead. Every lead row from that call carries the
-- same path in doc.call.recording (Ortex.Web live-orty/recording.js), and the
-- Voice calls drawer plays it through a short-lived signed URL.
--
-- PRIVATE bucket: a recording is a customer conversation.
-- * Anonymous visitors may INSERT only, and only a file named
--   calls/<year>/<uuid>.<webm|ogg|mp4>. With no anonymous select, update or
--   delete, a visitor can neither read nor overwrite any call, their own included.
-- * Staff with the voice-leads module read it back.
-- * Nobody updates or deletes: a recording is evidence of what was said.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-recordings',
  'voice-recordings',
  false,
  26214400, -- 25 MB: an hour at the 32 kbps the site records at is about 15 MB
  array['audio/webm', 'audio/ogg', 'audio/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists anon_upload_voice_recording on storage.objects;
create policy anon_upload_voice_recording on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'voice-recordings'
    and name ~ '^calls/[0-9]{4}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|mp4)$'
  );

drop policy if exists staff_read_voice_recording on storage.objects;
create policy staff_read_voice_recording on storage.objects
  for select to authenticated
  using (bucket_id = 'voice-recordings' and public.has_module_access('voice-leads'));
