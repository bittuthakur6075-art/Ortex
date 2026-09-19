-- 0039_social_realtime.sql
--
-- Live updates for social posts, so the phone's Social screen (and the console)
-- see a post move to "Publishing", "Published" or "Failed" without a refresh:
-- the publish sweep runs on the server every 15 minutes, and nobody is looking
-- at the post when it fires. Realtime applies the table's RLS, so a change only
-- reaches staff who can already read `social` (has_module_access('social')).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'social'
  ) then
    alter publication supabase_realtime add table public.social;
  end if;
end $$;
