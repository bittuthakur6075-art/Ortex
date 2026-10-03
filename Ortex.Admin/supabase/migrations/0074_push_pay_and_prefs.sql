-- 0074_push_pay_and_prefs.sql
--
-- Server push (push-notify, Firebase) for the phone app, two additions:
--
--   1. push_devices.muted: the push categories a phone has switched off in its
--      Notification settings ('enquiries', 'voice', 'chat', 'requests', 'pay',
--      or 'all' for the master switch). The prefs live on the handset; the phone
--      sends them with its token (register_push_device) so a CLOSED app is not
--      rung for something its owner turned off. A phone on an older app version
--      sends no list and keeps whatever its row had.
--
--   2. Three new alerts, same Vault-gated wiring as 0031 / 0038 / 0047: a no-op
--      until `push_notify_url` and `push_notify_secret` exist, and the write
--      that fires it never fails because of it.
--        * payslips: an employee's payslip is released (paid). The message says
--          only the month, never an amount (it shows on a locked phone).
--        * reimbursement_claims: the claimant's claim is approved or rejected.
--        * attendance_punches: a punch flagged own_code or other_site, to the
--          admins who review punches.

alter table public.push_devices add column if not exists muted text[] not null default '{}';

-- The 3-argument version is replaced, not overloaded: PostgREST cannot choose
-- between two candidates for a 3-argument call, so old phones would fail.
drop function if exists public.register_push_device(text, text, text);

create or replace function public.register_push_device(p_token text, p_platform text, p_app_version text, p_muted text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if coalesce(length(p_token), 0) < 20 or length(p_token) > 4096 then
    raise exception 'invalid token';
  end if;
  if coalesce(array_length(p_muted, 1), 0) > 10 then
    raise exception 'too many muted categories';
  end if;
  insert into public.push_devices (token, user_id, platform, app_version, muted)
  values (p_token, auth.uid(), coalesce(p_platform, 'android'), p_app_version, coalesce(p_muted, '{}'))
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        -- A token moving to another person starts with nothing muted.
        muted = case
          when p_muted is not null then p_muted
          when push_devices.user_id = excluded.user_id then push_devices.muted
          else '{}'
        end,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_device(text, text, text, text[]) from public, anon;
grant execute on function public.register_push_device(text, text, text, text[]) to authenticated;

-- ---- payslips, claims and flagged punches ---------------------------------------------------

create or replace function public.row_push_notify()
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
      body := jsonb_build_object('table', tg_table_name, 'id', new.id)
    );
  exception when others then
    -- Never block paying a run, deciding a claim or a punch.
    raise warning 'row_push_notify: %', sqlerrm;
  end;
  return new;
end $$;

revoke all on function public.row_push_notify() from public, anon, authenticated;

-- Released by payroll_run_transition('pay') or the release of a withheld slip.
drop trigger if exists payslips_push_notify on public.payslips;
create trigger payslips_push_notify after update of released_at on public.payslips
  for each row when (old.released_at is null and new.released_at is not null and new.status = 'included')
  execute function public.row_push_notify();

-- Decided by claim_decide (a claimant's own cancel is not announced).
drop trigger if exists reimbursement_claims_push_notify on public.reimbursement_claims;
create trigger reimbursement_claims_push_notify after update of status on public.reimbursement_claims
  for each row when (new.status in ('approved', 'rejected') and old.status is distinct from new.status)
  execute function public.row_push_notify();

-- A punch flagged as suspicious goes to the admins who review punches (the
-- phone's AttendanceApprovals). Only own_code and other_site: a field rep's
-- no_code punch is routine and would ring every admin twice a day per rep.
drop trigger if exists attendance_punches_push_notify on public.attendance_punches;
create trigger attendance_punches_push_notify after insert on public.attendance_punches
  for each row when (new.review = 'flagged' and new.flags && array['own_code', 'other_site'])
  execute function public.row_push_notify();
