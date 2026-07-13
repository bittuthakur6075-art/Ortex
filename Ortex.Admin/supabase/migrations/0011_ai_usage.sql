-- 0011_ai_usage.sql
--
-- Tracks LLM (Gemini) token usage per call so the Admin Settings page can show
-- real usage totals. The Edge Functions (orty-chat, product-copywriter) insert a
-- row after each model call using the service-role key (which bypasses RLS).
-- Active staff can read; nobody else can read, insert, or modify.
-- Depends on 0007 (is_active_staff).

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  doc jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage enable row level security;

-- Active staff may read usage in the console.
drop policy if exists staff_read_ai_usage on public.ai_usage;
create policy staff_read_ai_usage on public.ai_usage
  for select to authenticated
  using (public.is_active_staff());

-- Inserts come from the Edge Functions via the service-role key, which bypasses
-- RLS — so no anon/authenticated insert policy is granted on purpose.

create index if not exists ai_usage_created_at_idx on public.ai_usage (created_at desc);
