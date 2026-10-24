-- 0083_row_metadata.sql
--
-- Who made every record, when, and who changed it last: on EVERY table a
-- person creates or edits, not only the sales collections.
--
-- 0023 did this for the `{ id, doc }` collections (products, categories,
-- customers, enquiries, leads, quotations, invoices, payments, work, social,
-- automation_rules, message_templates, telecaller_jobs) and 0075 for
-- companies: four columns, `stamp_actor` from auth.uid(), and audit_log. The
-- relational tables added since (attendance, leave, payroll, chat, settings,
-- profiles) each carry some subset of created_at / updated_at / created_by /
-- updated_by, filled by whichever RPC remembered to, or by the client.
--
-- This migration gives the tables below all four columns and one trigger,
-- `stamp_row_meta`, that the server fills:
--
--   * INSERT by a signed-in user: created_at = updated_at = now(),
--     created_by = updated_by = auth.uid(). Whatever the client sent is
--     ignored, so a row cannot be backdated or attributed to someone else.
--   * INSERT with no user JWT (service role, pg_cron, a migration): a value
--     the caller supplied is kept (an edge function acting for a person may
--     name them), else now() / NULL. NULL reads as "Automation", as in 0023.
--   * UPDATE by a user: created_at and created_by are carried over from the
--     old row and cannot change; updated_at = now(); updated_by = auth.uid().
--   * UPDATE with no user JWT: updated_at = now(); updated_by is what the
--     caller set explicitly, else NULL; created_at may be corrected (it is
--     the joining date on profiles), created_by is left as sent.
--
-- The trigger is named `zzz_row_meta` so it fires LAST among the BEFORE
-- triggers (Postgres fires them by name). Guards that compare NEW with OLD
-- (profiles_protect's "new is distinct from old") therefore see the caller's
-- change, not the stamp.
--
-- Not retroactive: a row that already exists keeps created_by NULL ("Not
-- recorded"), and a table that had no created_at gets NULL for its old rows
-- rather than this migration's timestamp, which would be a false date.
-- updated_at is backfilled from created_at where it was missing.
--
-- Deliberately NOT covered:
--   * Already stamped: the 0023 collections and companies (stamp_actor), and
--     the four settings singletons with their own stamp triggers
--     (attendance_settings, payroll_settings, module_controls,
--     role_permissions: updated_at + updated_by is all a singleton needs).
--   * Machine-written or high-volume, where the actor is always the system or
--     is already a column of the row: user_activities, event_logs,
--     rate_limits, audit_log, payroll_audit, ai_usage, ai_messages,
--     whatsapp_logs, notifications, telecaller_calls, anu_knowledge,
--     anu_knowledge_version, anu_bot_runs, sequences, push_devices.
--   * Computed or self-identifying: attendance_punches and chat_messages (the
--     row's user_id / sender_id IS the actor, and created_at is server time),
--     attendance_days, attendance_months, attendance_overtime (recomputed by
--     triggers; "updated by" would name whoever's punch caused a recompute),
--     attendance_qr (a token rotated every 30 s), chat_members.

create or replace function public.stamp_row_meta()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_now  timestamptz := now();
  v_uid  uuid := auth.uid();
  -- A signed-in or anonymous API caller. Everything else (service role,
  -- pg_cron, a migration run as postgres) has no user to attribute.
  v_user boolean := coalesce(auth.role(), '') in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if v_user then
      new.created_at := v_now;
      new.created_by := v_uid;
      new.updated_by := v_uid;
    else
      new.created_at := coalesce(new.created_at, v_now);
      new.created_by := coalesce(new.created_by, v_uid);
      new.updated_by := coalesce(new.updated_by, new.created_by);
    end if;
    new.updated_at := v_now;
  else
    new.updated_at := v_now;
    if v_user then
      new.created_at := old.created_at;
      new.created_by := old.created_by;
      new.updated_by := v_uid;
    else
      -- A trusted JWT-less caller may correct created_at: profiles.created_at
      -- is the joining date that attendance, leave accrual and payroll read
      -- (0034, 0036, 0040), and it is fixed by SQL or the service role.
      new.created_at := coalesce(new.created_at, old.created_at);
      if new.updated_by is not distinct from old.updated_by then
        new.updated_by := v_uid;
      end if;
    end if;
  end if;
  return new;
end $$;

revoke all on function public.stamp_row_meta() from public, anon, authenticated;

do $$
declare
  t text;
  had_created boolean;
  had_updated boolean;
begin
  foreach t in array array[
    -- people and access
    'profiles', 'employees', 'attendance_people',
    -- attendance and leave
    'work_sites', 'holidays', 'regularisations',
    'leave_types', 'leave_requests', 'leave_ledger',
    -- payroll
    'salary_components', 'salary_templates', 'salary_revisions',
    'pay_runs', 'payslips', 'loans', 'loan_recoveries', 'reimbursement_claims',
    -- chat, settings, integrations
    'chat_conversations', 'settings', 'anu_bot_settings',
    'marketing', 'social_connections'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice '0083: % does not exist, skipped', t;
      continue;
    end if;

    select exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'created_at'),
           exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'updated_at')
      into had_created, had_updated;

    -- Added without a default first, so existing rows read NULL ("Not
    -- recorded") instead of this migration's timestamp; the default is for
    -- inserts that bypass the trigger's user path.
    execute format($f$
      alter table public.%1$I
        add column if not exists created_at timestamptz,
        add column if not exists updated_at timestamptz,
        add column if not exists created_by uuid references auth.users(id) on delete set null,
        add column if not exists updated_by uuid references auth.users(id) on delete set null;
      alter table public.%1$I alter column created_at set default now();
      alter table public.%1$I alter column updated_at set default now();
    $f$, t);

    if had_created and not had_updated then
      execute format('update public.%I set updated_at = created_at where updated_at is null', t);
    end if;

    execute format($f$
      drop trigger if exists zzz_row_meta on public.%1$I;
      create trigger zzz_row_meta before insert or update on public.%1$I
        for each row execute function public.stamp_row_meta();
    $f$, t);
  end loop;
end $$;

-- The trigger stamps updated_at itself; the old touch triggers on these
-- tables are now redundant but harmless (same value), so they stay.

-- Lists that sort by these columns: the payroll pages read pay runs and
-- payslips newest first, leave and corrections by request date.
create index if not exists pay_runs_created_idx        on public.pay_runs (created_at desc);
create index if not exists leave_requests_created_idx  on public.leave_requests (created_at desc);
create index if not exists regularisations_created_idx on public.regularisations (created_at desc);
