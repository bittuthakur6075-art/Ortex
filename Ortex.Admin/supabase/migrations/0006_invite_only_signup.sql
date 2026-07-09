-- Invite-only accounts: never trust signup metadata for privileges.
--
-- 0002's handle_new_user() copied `role` and `modules` straight out of
-- raw_user_meta_data into public.profiles. That metadata is written by whoever
-- calls auth.signUp() — and the anon key is public (it ships in the admin
-- bundle), so anyone could POST /auth/v1/signup with role:'admin' and land an
-- admin row in profiles, which is_admin() then honours across every RLS policy.
--
-- The trigger now hard-codes the least-privileged defaults. Real role/module
-- grants are applied afterwards by the admin-create-user Edge Function using
-- the service-role key, which it only reaches after verifying the caller is an
-- active admin. `name` stays metadata-sourced — it carries no privilege.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role, modules)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'sales',
    '[]'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end $$;
