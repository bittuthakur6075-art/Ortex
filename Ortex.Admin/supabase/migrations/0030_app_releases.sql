-- 0030_app_releases.sql
--
-- Where the field-sales app's APK updates live.
--
-- The team installs Ortex.Mobile from an APK, not from a store, so nothing
-- updates it for them. Ortex.Mobile/scripts/release-android.mjs uploads each
-- signed build here as android/ortex-sales-<version>.apk and rewrites
-- android/latest.json:
--
--   { "version": "1.3.0", "minVersion": "1.2.0", "apk": "android/ortex-sales-1.3.0.apk",
--     "size": 41234567, "notes": "...", "publishedAt": "..." }
--
-- The app reads that manifest on launch and on every return to the foreground
-- (features/update/UpdateGate.tsx). Below `minVersion` it shows nothing but the
-- update screen; below `version` it offers the update.
--
-- PUBLIC bucket, read by URL only: an out-of-date phone must be able to update
-- from the sign-in screen, before anyone has a session. The APK carries nothing
-- the website does not already publish (the project URL and the anon key); every
-- row it can reach is still behind sign-in and RLS. There is deliberately NO
-- select policy on storage.objects, so the bucket cannot be LISTED through the
-- API; a file is reachable only by its exact public URL.
--
-- Writes: only the release script, with the service_role key, which bypasses
-- RLS. No staff upload policy, so a signed-in account cannot swap the APK the
-- whole team installs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-releases',
  'app-releases',
  true,
  -- 200 MB. The project's own global upload limit still applies on top (50 MB
  -- on the free plan); the release script checks the APK against it.
  209715200,
  array['application/vnd.android.package-archive', 'application/json']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
