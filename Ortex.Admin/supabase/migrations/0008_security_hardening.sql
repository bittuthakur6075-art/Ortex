-- 0008_security_hardening.sql
--
-- Follow-up hardening from the codebase audit. Depends on:
--   0002 (is_admin), 0003 (protect_profile_privileges), 0007 (has_module_access,
--   is_active_staff).
--
-- Two things:
--  1) Let the service-role key set role/modules on profiles, so the invite-only
--     admin-create-user flow (0006) actually works.
--  2) Close the automation-subsystem RLS holes (the accidental "or true" that
--     voided the admin gate, and the public anon grants on log/rule tables).

-- 1) --------------------------------------------------------------------------
-- admin-create-user (already gated to admin callers) creates the auth user,
-- then UPDATEs public.profiles to grant role/modules using the service-role key.
-- That UPDATE fires protect_profile_privileges(), which resets role/modules for
-- any caller that isn't an admin. A service-role request has no auth.uid(), so
-- is_admin() is false and the grant was being silently reverted -- every
-- console-created user got stuck as sales/no-modules. Trust the service role
-- (reachable only from server-side Edge Functions holding the secret key).
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted server-side caller (Edge Function using the service-role key).
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if not public.is_admin() then
    new.role    := old.role;
    new.modules := old.modules;
    new.active  := old.active;
    new.email   := old.email;
  end if;
  return new;
end $$;

-- 2) --------------------------------------------------------------------------
-- Automation rules & templates: drop the "or true" admin gate and the anon
-- read grant; scope to the 'automation' module (admins pass automatically).
drop policy if exists admin_all_rules   on public.automation_rules;
drop policy if exists anon_select_rules on public.automation_rules;
create policy staff_automation_rules on public.automation_rules
  for all to authenticated
  using (public.has_module_access('automation'))
  with check (public.has_module_access('automation'));

drop policy if exists admin_all_templates   on public.message_templates;
drop policy if exists anon_select_templates on public.message_templates;
create policy staff_message_templates on public.message_templates
  for all to authenticated
  using (public.has_module_access('automation'))
  with check (public.has_module_access('automation'));

-- Generated message logs: written by the automation-engine Edge Function
-- (service role -- bypasses RLS) and read/updated by staff in the console.
-- No anonymous access; the previous authenticated "using (true)" is replaced
-- with an active-staff + module scope.
drop policy if exists anon_insert_whatsapp       on public.whatsapp_logs;
drop policy if exists authenticated_all_whatsapp on public.whatsapp_logs;
create policy staff_whatsapp_logs on public.whatsapp_logs
  for all to authenticated
  using (public.has_module_access('automation'))
  with check (public.has_module_access('automation'));

drop policy if exists anon_insert_ai_messages       on public.ai_messages;
drop policy if exists authenticated_all_ai_messages on public.ai_messages;
create policy staff_ai_messages on public.ai_messages
  for all to authenticated
  using (public.has_module_access('automation'))
  with check (public.has_module_access('automation'));

-- Website analytics ingestion: anon may still INSERT (tracker.js runs on the
-- public marketing site), but only active staff may read/manage. The anon
-- insert policies from 0005_automation are left in place.
drop policy if exists authenticated_all_activities on public.user_activities;
create policy staff_all_activities on public.user_activities
  for all to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());

drop policy if exists authenticated_all_event_logs on public.event_logs;
create policy staff_all_event_logs on public.event_logs
  for all to authenticated
  using (public.is_active_staff())
  with check (public.is_active_staff());
