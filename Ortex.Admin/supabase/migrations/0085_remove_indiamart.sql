-- 0085: remove the IndiaMART integration (owner's decision 2026-10-24: not in use).
--
-- The indiamart-lead (push) and indiamart-pull (scheduled) edge functions are
-- deleted from the repo and the project; the console no longer has an
-- IndiaMART card, lead channel, product CSV export or "Listed on IndiaMART"
-- flag. What the database still held:
--
--   * the account keys in the admin-only settings row:
--     integrations.indiamart and integrations.indiamartByCompany.<company>.
--     settings_staff never exposed `integrations` (0024, 0071, 0075), so no
--     view or function changes.
--   * any pg_cron job that pulled IndiaMART (none in production, checked
--     2026-10-24; unscheduled here in case another project has one).
--
-- No other SQL object is IndiaMART's, and production held no IndiaMART lead,
-- customer or product flag, so no row is deleted. Older migrations keep their
-- comments as history. Idempotent: running it again changes nothing.

update public.settings
   set doc = case
               when (doc -> 'integrations') - 'indiamart' - 'indiamartByCompany' = '{}'::jsonb
                 then doc - 'integrations'
               else jsonb_set(doc, '{integrations}', (doc -> 'integrations') - 'indiamart' - 'indiamartByCompany')
             end
 where doc -> 'integrations' ?| array['indiamart', 'indiamartByCompany'];

-- A company doc never held an IndiaMART block (0075 kept the keys in settings),
-- but drop one if a hand edit put it there.
update public.companies
   set doc = doc - 'indiamart'
 where doc ? 'indiamart';

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname ilike '%indiamart%';
  end if;
end $$;
