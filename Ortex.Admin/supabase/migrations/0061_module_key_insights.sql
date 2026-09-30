-- 0061: two module keys renamed so a key says what the feature is.
--
--   * `growth` + `automation` → `insights`. They were two keys for two tabs of
--     ONE page, both adminOnly, so nobody held either as a grant. One page, one
--     key.
--
-- `social` → `marketing` was planned with it and DROPPED: the key is mirrored
-- by the phone app (Ortex.Mobile/src/domain/modules.ts), which is not being
-- touched, and renaming it on one side only would take the module away from
-- whoever holds it. The page and the route say Marketing; the stored key stays
-- `social` until both clients can move together.
--
-- A key is stored in four places, and every one has to move in the same
-- transaction or somebody loses a module silently:
--   role_permissions.modules   a role's grants          (jsonb array)
--   profiles.modules           one person's extras      (jsonb array)
--   profiles.modules_hidden    one person's exclusions  (jsonb array, 0055)
--   module_controls.key        the company switches     (primary key, 0053)
--
-- has_module_access() reads those same arrays by name, so nothing in the
-- function needs editing: renaming the values is the whole job. Both clients
-- are updated in the same release (Ortex.Admin/src/data/domain/modules.js and
-- its mirror Ortex.Mobile/src/domain/modules.ts).
--
-- Idempotent: running it twice finds nothing left to rename.

-- ---- the arrays -------------------------------------------------------------
-- One helper rather than six near-identical updates. Rewrites an array of keys,
-- mapping old to new and dropping the duplicate that a merge creates.
create or replace function public.module_keys_renamed(p_keys jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
  from (
    select case value #>> '{}'
             when 'growth' then 'insights'
             when 'automation' then 'insights'
             else value #>> '{}'
           end as k
      from jsonb_array_elements(coalesce(p_keys, '[]'::jsonb))
  ) t;
$$;

update public.role_permissions
   set modules = public.module_keys_renamed(modules),
       updated_at = now()
 where modules ?| array['growth', 'automation'];

update public.profiles
   set modules = public.module_keys_renamed(modules)
 where modules ?| array['growth', 'automation'];

update public.profiles
   set modules_hidden = public.module_keys_renamed(modules_hidden)
 where modules_hidden ?| array['growth', 'automation'];

-- ---- the company switches ---------------------------------------------------
-- `insights` takes the STRICTER of the two rows it replaces: a module switched
-- off, or kept from Admins, must not come back on through a rename.
insert into public.module_controls (key, enabled, admin_access, updated_at)
select 'insights', bool_and(enabled), bool_and(admin_access), now()
  from public.module_controls
 where key in ('growth', 'automation')
having count(*) > 0
on conflict (key) do update
  set enabled = least(public.module_controls.enabled::int, excluded.enabled::int)::boolean,
      admin_access = least(public.module_controls.admin_access::int, excluded.admin_access::int)::boolean,
      updated_at = now();

delete from public.module_controls where key in ('growth', 'automation');

drop function if exists public.module_keys_renamed(jsonb);
