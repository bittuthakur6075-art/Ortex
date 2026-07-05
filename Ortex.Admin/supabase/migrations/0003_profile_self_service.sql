-- Let users manage their own profile (name) without being able to escalate
-- their own role / module access. A self-update RLS policy opens UPDATE for the
-- owner; a BEFORE UPDATE trigger forces role/modules/active/email back to their
-- previous values unless the caller is an admin.

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid());

create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.role    := old.role;
    new.modules := old.modules;
    new.active  := old.active;
    new.email   := old.email;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect on public.profiles;
create trigger profiles_protect
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();
