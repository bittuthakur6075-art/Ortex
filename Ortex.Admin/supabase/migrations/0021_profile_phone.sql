-- 0021_profile_phone.sql
--
-- A contact number on a staff account.
--
-- The field-sales app's Account details page lets a user add and update their
-- own phone number, the same way it already edits `name`. There was nowhere to
-- put it: `profiles` carries email (owned by an admin), name, role, modules,
-- active and avatar_url, and nothing else.
--
-- This is DELIBERATELY NOT auth.users.phone. That column belongs to Supabase's
-- SMS identity: writing it starts a verification flow, makes the number a
-- sign-in credential, and needs an SMS provider configured. What is wanted here
-- is a fact about a colleague — the number a teammate rings — so it lives beside
-- their name.
--
-- Like avatar_url (0019), `phone` is NOT in the list that
-- protect_profile_privileges() (0003/0008) forces back to its old value, so the
-- existing profiles_self_update policy already lets a user set their own, and
-- only their own. An admin can set anyone's through profiles_admin_write.

alter table public.profiles
  add column if not exists phone text;
