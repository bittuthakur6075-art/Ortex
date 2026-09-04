-- Re-run the 0015 quarantine so it actually takes effect.
--
-- 0015 ended with `update public.profiles set active = false where ...`, but
-- profiles carries the BEFORE UPDATE trigger profiles_protect (0008). A
-- migration runs with no JWT, so inside protect_profile_privileges()
-- auth.jwt()->>'role' is not 'service_role' and is_admin() is false; the
-- trigger therefore restored `new.active := old.active` and silently undid
-- every row. Self-registered accounts created before 0015 stayed active.
--
-- Disable the trigger for the duration of this statement only. Migrations run
-- as the database owner, which is allowed to do this; nothing else changes.
--
-- Predicate: sales role with no modules. An admin-invited sales user saved with
-- zero modules is caught as well; that account can be re-enabled from
-- Users -> Edit -> "Account active" once its modules are set. Uninvited
-- signups have no admin to vouch for them and stay disabled.

alter table public.profiles disable trigger profiles_protect;

update public.profiles
   set active = false
 where role = 'sales'
   and coalesce(modules, '[]'::jsonb) = '[]'::jsonb
   and active = true;

alter table public.profiles enable trigger profiles_protect;
