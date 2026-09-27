-- 0052_marketing_feed.sql
--
-- The console's Marketing page (/social) is now a read-only view of what the
-- separate Marketing project (C:\Code\Marketing) has done: posts published or
-- scheduled on Instagram and LinkedIn, DMs, comments and lead follow-ups.
-- That project keeps its records as files on the owner's PC and pushes them
-- here through the `marketing-sync` Edge Function (shared secret, service role).
--
-- The old in-console publisher is retired: its functions are deleted from the
-- repo. The `social` table, its bucket and `social_connections` are LEFT IN
-- PLACE, untouched, because they hold history; nothing reads them any more.

create table if not exists public.marketing (
  id         uuid primary key default gen_random_uuid(),
  -- Stable key from the Marketing project ("post:<id>", "dm:<hash>" ...), so a
  -- re-sync updates a row instead of duplicating it.
  ref        text not null unique,
  doc        jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_created_idx on public.marketing (created_at desc);
drop trigger if exists marketing_touch on public.marketing;
create trigger marketing_touch before update on public.marketing
  for each row execute function set_updated_at();
alter table public.marketing enable row level security;

-- Read: whoever may open the module. Write: only the service role (the sync
-- function), so there is no insert/update/delete policy at all.
drop policy if exists marketing_read on public.marketing;
create policy marketing_read on public.marketing
  for select to authenticated
  using (public.is_active_staff() and public.has_module_access('social'));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'marketing'
  ) then
    alter publication supabase_realtime add table public.marketing;
  end if;
end $$;

-- Stop the retired publish sweep if a cron job still calls it.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where command ilike '%social-publish%';
  end if;
end $$;
