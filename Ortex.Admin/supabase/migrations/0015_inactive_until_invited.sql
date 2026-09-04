-- Uninvited signups must not become active staff.
--
-- 0006 stopped the signup trigger from honouring role/modules metadata, but
-- profiles.active kept its `default true` (0002). is_active_staff() (0007)
-- checks only `active = true`, and it alone gates the private artwork bucket
-- (0009), the product-images / social-media buckets (0010, 0013),
-- notifications, user_activities, event_logs, ai_usage and next_sequence().
-- The Edge Functions apply the same "active and role in (admin, sales)" test.
--
-- The anon key is public, so anyone who can reach POST /auth/v1/signup got an
-- `active = true, role = 'sales'` profile and passed all of those checks.
--
-- From now on a profile is inactive until an admin activates it. The
-- admin-create-user Edge Function sets active = true with the service role
-- right after creating the auth user, so invited accounts are unaffected.

alter table public.profiles alter column active set default false;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role, modules, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'sales',
    '[]'::jsonb,
    false
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Quarantine any self-registered rows that already exist: sales, no modules,
-- and never granted anything by an admin. Genuine invited accounts always have
-- modules or the admin role, so they are left untouched.
update public.profiles
   set active = false
 where role = 'sales'
   and coalesce(modules, '[]'::jsonb) = '[]'::jsonb
   and active = true;
