-- 0026_staff_directory_not_public.sql
--
-- Take `staff_directory` away from the anon role.
--
-- 0023 created the view and wrote `grant select on public.staff_directory to
-- authenticated`, which reads like the whole story and is not: Supabase ships
-- default privileges on the public schema that hand anon SELECT on every new
-- table and view, and an explicit grant is additive, it takes nothing away. So
-- the view has been readable with the anon key since the day it landed:
--
--   curl "$URL/rest/v1/staff_directory?select=*" -H "apikey: $ANON_KEY"
--   [{"id":"…","name":"S L Thakur","avatar_url":null,"role":"admin"}, …]
--
-- That key is not a secret. It is compiled into the marketing site's JavaScript
-- bundle and served to every visitor, so this published the staff roster, who
-- works here, who is an admin, and their photos, to anyone who opened the site
-- and looked at the network tab. The names alone are a spear-phishing list, and
-- `role` says which of them to impersonate.
--
-- The public catalogue views (0020) are a deliberate exception and stay as they
-- are: they exist to be read anonymously. This view never did, its whole
-- purpose is letting one signed-in staff member resolve a colleague's uuid.
--
-- Nothing in either client changes: the console and the phone both read it as
-- an authenticated user.

revoke all on public.staff_directory from anon;

-- Same reasoning for the two staff-only views 0023's sibling migrations added.
-- settings_staff carries the company's own details and is already meant to be
-- staff-only (0024); a default grant would hand it to anon just as quietly.
do $$
begin
  if exists (select 1 from pg_views where schemaname = 'public' and viewname = 'settings_staff') then
    execute 'revoke all on public.settings_staff from anon';
  end if;
end $$;

-- Re-state the intended grant, so the view's access is legible in one place.
grant select on public.staff_directory to authenticated;

comment on view public.staff_directory is
  'id -> name/avatar/role for rendering audit attribution. Allow-list: never email, modules or active. authenticated only — anon is revoked in 0026.';
