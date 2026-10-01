-- 0064: Team contacts for everyone. `profiles_self_read` (0002) lets a non-admin
-- read only their own row, so the phone's Staff Team tab reads colleagues
-- through this: name, role, photo, email and phone of ACTIVE people, nothing
-- else (no modules, no activity, no standing). Same gate as chat_people (0045).

create or replace function public.team_contacts()
returns table (id uuid, name text, email text, phone text, avatar_url text, role text)
language sql security definer stable set search_path = public as $$
  select p.id, p.name, p.email, p.phone, p.avatar_url, p.role from public.profiles p
  where p.active = true and public.is_active_staff()
  order by p.name;
$$;

revoke execute on function public.team_contacts() from public, anon;
grant execute on function public.team_contacts() to authenticated;
