-- 0031_push_devices.sql
--
-- REMOTE PUSH for the field-sales app (Ortex.Mobile), so a new lead reaches a
-- rep's phone when the app is closed. Until now the phone posted every alert
-- itself from rows it heard over realtime, which only works while the app is
-- alive, and Samsung/Xiaomi battery managers freeze it within minutes of the
-- screen going off.
--
-- Two pieces:
--
--   1. push_devices: one row per signed-in phone (its FCM registration token).
--      Each person manages only their own rows; the push-notify function reads
--      them with the service role.
--
--   2. enquiries_push_notify: an AFTER INSERT trigger on `enquiries` that hands
--      the new row's id to the `push-notify` edge function through pg_net. It
--      reads the function URL and a shared secret from Supabase Vault:
--
--        select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-notify', 'push_notify_url');
--        select vault.create_secret('<random secret>', 'push_notify_secret');
--
--      and the function is given the same secret (supabase secrets set
--      PUSH_NOTIFY_SECRET=<random secret>). Until both Vault secrets exist the
--      trigger does nothing. It also swallows its own errors: an enquiry from
--      the website must never fail to save because a notification could not be
--      sent. pg_net is asynchronous, so the insert does not wait on the call.

create extension if not exists pg_net;

create table if not exists public.push_devices (
  token text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null default 'android' check (platform in ('android', 'ios')),
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_devices_user_idx on public.push_devices (user_id);

alter table public.push_devices enable row level security;

-- A phone registers, refreshes and removes only its own person's tokens. A
-- token moving to another account (a shared handset, a new login) is an update
-- of user_id, which the WITH CHECK allows only onto the caller themselves.
drop policy if exists push_devices_own_select on public.push_devices;
create policy push_devices_own_select on public.push_devices
  for select to authenticated using (user_id = auth.uid());

drop policy if exists push_devices_own_insert on public.push_devices;
create policy push_devices_own_insert on public.push_devices
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_devices_own_update on public.push_devices;
create policy push_devices_own_update on public.push_devices
  for update to authenticated using (true) with check (user_id = auth.uid());

drop policy if exists push_devices_own_delete on public.push_devices;
create policy push_devices_own_delete on public.push_devices
  for delete to authenticated using (user_id = auth.uid());

-- Registration is an upsert on the token, so a token that last belonged to a
-- colleague on the same handset must be claimable. The UPDATE policy above uses
-- `true` for that reason; the function below is what a phone actually calls, so
-- the rule "a token belongs to whoever registered it last" is one statement.
create or replace function public.register_push_device(p_token text, p_platform text, p_app_version text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if coalesce(length(p_token), 0) < 20 or length(p_token) > 4096 then
    raise exception 'invalid token';
  end if;
  insert into public.push_devices (token, user_id, platform, app_version)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'), p_app_version)
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated;

-- The trigger.
create or replace function public.enquiries_push_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_notify_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret' limit 1;
    if v_url is null or v_secret is null then
      return new;
    end if;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('table', 'enquiries', 'id', new.id)
    );
  exception when others then
    -- Never block the insert. The phone's own realtime alert still covers a
    -- rep whose app is open.
    raise warning 'enquiries_push_notify: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists enquiries_push_notify on public.enquiries;
create trigger enquiries_push_notify
  after insert on public.enquiries
  for each row execute function public.enquiries_push_notify();
