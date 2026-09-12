-- ============================================================================
-- Remove development traffic from the analytics tables, keeping real visits
--
-- The console's Insights -> Web events reads user_activities / event_logs, and
-- every `npm run dev` session on the marketing site writes to the SAME tables
-- the live site does: there is no separate analytics environment. So a few
-- afternoons of local testing become thousands of "visits" from one office IP,
-- and the funnel on the Growth tab counts them.
--
-- This is NOT a migration. Like remove-demo-data.sql it lives outside
-- supabase/migrations/ on purpose, so `supabase db push` never runs it.
--
--
-- TAKE A BACKUP FIRST
--   cd Ortex.Admin && npm run backup
-- There is no undo.
--
--
-- HOW A DEV ROW IS IDENTIFIED
--
-- By the referrer the browser reported, which for a Vite session is
-- http://localhost:5173/ (or 127.0.0.1, or a LAN address when the dev server is
-- opened from a phone). A real visitor's referrer is a search engine, an ad, a
-- social app or "Direct" -- never a loopback address. Nothing here matches on
-- IP: the office IP is also the IP of a genuine enquiry typed at that desk.
--
-- event_logs carries no referrer of its own, so its dev rows are found through
-- the visitor ids that only appear on dev activities. Check the STEP 1 preview
-- of those ids before deleting: a visitor id that also has non-local rows is
-- deliberately left alone.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1 - PREVIEW. Read-only.
-- ---------------------------------------------------------------------------

with local_activity as (
  select id, doc->>'userId' as user_id
  from public.user_activities
  where doc->>'referrer' ~* '^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)'
     or doc->>'pageUrl'  ~* '^https?://(localhost|127\.0\.0\.1)'
),
-- Only ids whose every row is local. A visitor who tested locally and later
-- browsed the live site keeps their real rows.
local_only_visitor as (
  select user_id as v
  from local_activity
  where user_id is not null
  group by user_id
  having count(*) = (
    select count(*) from public.user_activities ua where ua.doc->>'userId' = local_activity.user_id
  )
)
select 'user_activities (local)' as what, count(*) as rows from local_activity
union all
select 'visitor ids that are local-only', count(*) from local_only_visitor
union all
select 'event_logs for those ids', count(*) from public.event_logs
  where doc->>'userId' in (select v from local_only_visitor)
union all
select 'user_activities kept (real traffic)', count(*) from public.user_activities
  where id not in (select id from local_activity);


-- ---------------------------------------------------------------------------
-- STEP 2 - DELETE. Uncomment and run once the preview looks right.
-- ---------------------------------------------------------------------------

-- create temp table _local_activity as
--   select id, doc->>'userId' as user_id
--   from public.user_activities
--   where doc->>'referrer' ~* '^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)'
--      or doc->>'pageUrl'  ~* '^https?://(localhost|127\.0\.0\.1)';
--
-- create temp table _local_visitor as
--   select user_id as v from _local_activity
--   where user_id is not null
--   group by user_id
--   having count(*) = (
--     select count(*) from public.user_activities ua where ua.doc->>'userId' = _local_activity.user_id
--   );
--
-- -- Events first: they point at activities, not the other way round.
-- delete from public.event_logs      where doc->>'userId' in (select v from _local_visitor);
-- delete from public.user_activities where id in (select id from _local_activity);
--
-- drop table _local_activity;
-- drop table _local_visitor;


-- ---------------------------------------------------------------------------
-- STEP 3 - VERIFY. Re-run STEP 1; the two "local" counts should be zero and
-- the kept count unchanged.
-- ---------------------------------------------------------------------------
