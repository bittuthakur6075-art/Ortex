-- 0063: Login sessions. A person sees every device signed in to their account
-- and can sign any of them out (console My Profile, phone Profile -> Login sessions).
--
-- auth.sessions is not exposed to clients, so two security-definer functions
-- read and delete ONLY the caller's own rows. "Log out all other devices" needs
-- no SQL: it is supabase.auth.signOut({ scope: "others" }).
--
-- A session counts as live while it still has an unrevoked refresh token; a
-- signed-out or expired one keeps its row for a while and would only confuse.
-- Deleting the session cascades to its refresh tokens, so that device cannot
-- refresh again. Its current access token stays valid until it expires (the
-- project's JWT expiry, one hour by default): there is no way to recall a JWT.

create or replace function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active timestamptz,
  user_agent text,
  ip text,
  is_current boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.created_at,
    greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'utc') as last_active,
    s.user_agent,
    host(s.ip),
    s.id::text = coalesce(auth.jwt() ->> 'session_id', '') as is_current
  from auth.sessions s
  where s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now())
    and exists (
      select 1 from auth.refresh_tokens r
      where r.session_id = s.id and not coalesce(r.revoked, false)
    )
  order by is_current desc, last_active desc nulls last;
$$;

create or replace function public.revoke_my_session(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_id::text = coalesce(auth.jwt() ->> 'session_id', '') then
    raise exception 'Use Log out to end this session';
  end if;
  delete from auth.sessions where id = p_id and user_id = auth.uid();
  return found;
end;
$$;

revoke all on function public.my_sessions() from public, anon;
revoke all on function public.revoke_my_session(uuid) from public, anon;
grant execute on function public.my_sessions() to authenticated;
grant execute on function public.revoke_my_session(uuid) to authenticated;
