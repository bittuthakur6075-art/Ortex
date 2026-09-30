-- 0060: selfie attendance is gone.
--
-- Selfies stopped being TAKEN in 0043, when the rotating QR code replaced the
-- selfie and the geofence. Everything since has existed only to display and
-- purge what was captured before that: four punches, the newest from 19 Sep
-- 2026. The console drew an empty camera placeholder on every row to say so.
--
-- Owner's decision, 2026-09-30: remove the feature and the photos together.
--
-- This migration:
--   * unschedules the `attendance-housekeeping` pg_cron job, whose only work
--     was deleting old selfies. The Edge Function it called is deleted from the
--     repo; undeploy it with `supabase functions delete attendance-housekeeping`
--     (a deploy is not something a migration can undo).
--   * deletes every object in the `attendance-selfies` bucket, then the bucket.
--   * drops attendance_punches.selfie_path. Both clients read punches with
--     `select *`, so nothing installed breaks: the field simply stops arriving.
--   * leaves the Vault secret alone. It also authorises attendance-close-day.
--
-- The retention setting goes with it. mustBeInside, defaultRadiusM and
-- maxAccuracyM stay in the doc: they are unread, and stripping keys from a
-- jsonb document nobody queries buys nothing.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'attendance-housekeeping';
  end if;
exception when others then
  -- A database without pg_cron, or without the job, is not a failure.
  null;
end $$;

-- The photos themselves are NOT deleted here. Supabase refuses a direct delete
-- from storage.objects ("Direct deletion from storage tables is not allowed.
-- Use the Storage API instead.", SQLSTATE 42501), which is why the housekeeping
-- job was an Edge Function in the first place. They are removed with
-- `supabase storage rm -r ss:///attendance-selfies`, then the bucket is dropped
-- from the dashboard. Doing it any other way would fail this migration for
-- everyone who runs it.

alter table public.attendance_punches drop column if exists selfie_path;

update public.attendance_settings
   set doc = doc - 'selfieRetentionDays',
       updated_at = now()
 where id and doc ? 'selfieRetentionDays';
