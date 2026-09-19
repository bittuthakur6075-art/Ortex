-- 0038_attendance_hardening.sql
--
-- ATTENDANCE & LEAVE, phase 4: the loose ends (docs/pm/ATTENDANCE_LEAVE_PLAN.md).
--
--   1. Comp-off expires. A CO day unused `leave_types.expires_days` (60) after
--      it was granted lapses, oldest grants first: the nightly job lapses
--      whatever part of the grants older than that has not been taken.
--   2. Approvals reach the right phone. A new leave request or correction tells
--      the admins; a decision tells the person who asked. The rows go to the
--      push-notify Edge Function through pg_net with the same Vault secrets as
--      new leads (0031), so, like leads, it stays inert until Firebase and those
--      secrets are set up (docs/guides/PUSH_SETUP.md). The phone app also shows
--      these while it is open, from realtime, with the same notification ids.

-- ---- 1. comp-off expiry -----------------------------------------------------------------------

create or replace function public.leave_expire_comp_off()
returns int language plpgsql security definer set search_path = public as $$
declare
  t record;
  r record;
  n int := 0;
  v_expire numeric;
  period text := 'expire-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM-DD');
begin
  for t in select code, expires_days from public.leave_types where expires_days is not null and active loop
    for r in
      select l.user_id,
             -- Granted long enough ago to have expired.
             coalesce(sum(l.delta) filter (where l.delta > 0 and l.reason in ('grant', 'adjust', 'accrual')
                                            and l.at < now() - make_interval(days => t.expires_days)), 0) as old_grants,
             -- Everything that has already used or removed days: taken (net of
             -- give-backs), lapsed, and negative adjustments.
             coalesce(-sum(l.delta) filter (where l.reason in ('taken', 'reversal')), 0)
               + coalesce(-sum(l.delta) filter (where l.reason = 'lapse'), 0)
               + coalesce(-sum(l.delta) filter (where l.reason = 'adjust' and l.delta < 0), 0) as used
        from public.leave_ledger l
       where l.type_code = t.code
       group by l.user_id
    loop
      v_expire := r.old_grants - r.used;
      if v_expire > 0 then
        insert into public.leave_ledger (user_id, type_code, delta, reason, period, note)
        values (r.user_id, t.code, -v_expire, 'lapse', period,
                'Unused for ' || t.expires_days || ' days, expired')
        on conflict do nothing;
        n := n + 1;
      end if;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.leave_expire_comp_off() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'leave-expire-comp-off';
  -- 00:30 IST daily.
  perform cron.schedule('leave-expire-comp-off', '0 19 * * *', $job$ select public.leave_expire_comp_off() $job$);
exception when others then
  raise warning 'leave: comp-off expiry not scheduled (%).', sqlerrm;
end $$;

-- ---- 2. approvals to the right phone ------------------------------------------------------------

/**
 * Hand a row to push-notify, the same way new leads go (0031). A no-op until
 * the push_notify_url / push_notify_secret Vault secrets exist, and it never
 * blocks the write that fired it.
 */
create or replace function public.attendance_push_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_notify_url' limit 1;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_notify_secret' limit 1;
    if v_url is null or v_secret is null then
      return new;
    end if;
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('table', tg_table_name, 'id', new.id, 'op', lower(tg_op), 'status', new.status)
    );
  exception when others then
    raise warning 'attendance_push_notify: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists leave_requests_push_notify on public.leave_requests;
create trigger leave_requests_push_notify after insert or update of status on public.leave_requests
  for each row execute function public.attendance_push_notify();

drop trigger if exists regularisations_push_notify on public.regularisations;
create trigger regularisations_push_notify after insert or update of status on public.regularisations
  for each row execute function public.attendance_push_notify();
