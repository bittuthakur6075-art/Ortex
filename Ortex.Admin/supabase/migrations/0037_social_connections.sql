-- 0037_social_connections.sql
--
-- Where a connected social account's tokens live: today LinkedIn, whose tokens
-- come from an admin clicking "Connect LinkedIn" (OAuth), expire after 60 days
-- and are renewed with a refresh token that itself lasts a year. Meta needs no
-- row here: its token is a permanent system-user token set as a function secret.
--
-- SERVER ONLY. RLS is on and there is deliberately NO policy, so no browser
-- session, admin or not, can read a token. The `social-accounts` function
-- (OAuth + status) and `social-publish` use the service role. The console learns
-- only what `social-accounts` chooses to say: connected or not, the page name,
-- and when a reconnect will be needed.

create table if not exists public.social_connections (
  platform            text primary key check (platform in ('linkedin')),
  access_token        text not null,
  access_expires_at   timestamptz not null,
  refresh_token       text,
  refresh_expires_at  timestamptz,
  account_urn         text not null,  -- urn:li:organization:<id>, the page posts go to
  account_name        text,
  scope               text,
  connected_by        uuid references auth.users (id) on delete set null,
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.social_connections enable row level security;

-- Belt and braces: no grants to the API roles either, so even a policy added by
-- mistake later would not expose a token through PostgREST.
revoke all on public.social_connections from anon, authenticated;
