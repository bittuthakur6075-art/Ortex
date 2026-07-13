-- Migration 0012: Work showcase collection
--
-- Backs the website /work page (previously a hardcoded photo list) with an
-- Admin-managed collection. Same {id, doc, timestamps} shape as every other
-- collection; the website reads active items anonymously, staff with the
-- 'work' module manage them.

create table if not exists public.work (
  id         uuid primary key default gen_random_uuid(),
  doc        jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_created_idx on public.work (created_at desc);
create trigger work_touch before update on public.work
  for each row execute function set_updated_at();
alter table public.work enable row level security;

-- Public site may read active work items only.
drop policy if exists anon_select_work on public.work;
create policy anon_select_work on public.work
  for select to anon using (coalesce(doc->>'active','true') <> 'false');

-- Signed-in staff with the 'work' module get full access.
drop policy if exists staff_work on public.work;
create policy staff_work on public.work
  for all to authenticated using (public.has_module_access('work')) with check (public.has_module_access('work'));
