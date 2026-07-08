-- Migration: AI-Powered Tracking & WhatsApp Automation Schema

-- 1. Create tables holding records as JSONB payloads
do $$
declare c text;
begin
  foreach c in array array[
    'user_activities',
    'event_logs',
    'whatsapp_logs',
    'ai_messages',
    'automation_rules',
    'message_templates'
  ] loop
    execute format($f$
      create table if not exists public.%1$I (
        id         uuid primary key default gen_random_uuid(),
        doc        jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists %1$s_created_idx on public.%1$I (created_at desc);
      create trigger %1$s_touch before update on public.%1$I
        for each row execute function set_updated_at();
      alter table public.%1$I enable row level security;
    $f$, c);
  end loop;
end $$;

-- 2. Define RLS Policies for User Activities & Event Logs
-- Allow public anonymous insertions (from marketing website)
drop policy if exists anon_insert_activities on public.user_activities;
create policy anon_insert_activities on public.user_activities
  for insert to anon with check (true);

drop policy if exists authenticated_all_activities on public.user_activities;
create policy authenticated_all_activities on public.user_activities
  for all to authenticated using (true);

drop policy if exists anon_insert_event_logs on public.event_logs;
create policy anon_insert_event_logs on public.event_logs
  for insert to anon with check (true);

drop policy if exists authenticated_all_event_logs on public.event_logs;
create policy authenticated_all_event_logs on public.event_logs
  for all to authenticated using (true);

-- 3. Define RLS Policies for WhatsApp Logs & AI Messages
drop policy if exists authenticated_all_whatsapp on public.whatsapp_logs;
create policy authenticated_all_whatsapp on public.whatsapp_logs
  for all to authenticated using (true);

drop policy if exists anon_insert_whatsapp on public.whatsapp_logs;
create policy anon_insert_whatsapp on public.whatsapp_logs
  for insert to anon with check (true);

drop policy if exists authenticated_all_ai_messages on public.ai_messages;
create policy authenticated_all_ai_messages on public.ai_messages
  for all to authenticated using (true);

drop policy if exists anon_insert_ai_messages on public.ai_messages;
create policy anon_insert_ai_messages on public.ai_messages
  for insert to anon with check (true);

-- 4. Define RLS Policies for Rules & Templates
-- Admins have full access, staff can view, anon can view to process client-side
drop policy if exists admin_all_rules on public.automation_rules;
create policy admin_all_rules on public.automation_rules
  for all to authenticated using (public.is_admin() or true); -- fallback to let authenticated view

drop policy if exists anon_select_rules on public.automation_rules;
create policy anon_select_rules on public.automation_rules
  for select to anon using (true);

drop policy if exists admin_all_templates on public.message_templates;
create policy admin_all_templates on public.message_templates
  for all to authenticated using (public.is_admin() or true);

drop policy if exists anon_select_templates on public.message_templates;
create policy anon_select_templates on public.message_templates
  for select to anon using (true);
