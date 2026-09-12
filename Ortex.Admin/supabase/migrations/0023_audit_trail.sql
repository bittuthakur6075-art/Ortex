-- 0023_audit_trail.sql
--
-- Who made this record, who touched it last, and what changed in between.
--
-- Until now a row carried `created_at` / `updated_at` and nothing else: there
-- was no way to answer "who raised this quotation?" or "who changed the rate?".
-- Both clients (the console and the phone) sign in as real Supabase users, so
-- `auth.uid()` is already available on every write — it was simply never
-- recorded.
--
-- Three parts:
--
--   1. `created_by` / `updated_by` columns on the collections a HUMAN edits.
--      They are filled by a trigger from auth.uid(), never by the client, so a
--      forged doc field cannot claim authorship and NO client code has to
--      change: the console, the phone and the Tally connector all get correct
--      attribution the moment this lands.
--
--   2. `audit_log`, an append-only history of every insert / update / delete on
--      those tables, recording the actor, the moment, and a per-key {from, to}
--      diff of the doc. This is what makes "modified at" a list rather than a
--      single timestamp. It is written by a SECURITY DEFINER trigger and has NO
--      insert/update/delete policy, so staff can read the history and nobody —
--      admin included — can rewrite it through PostgREST.
--
--   3. `staff_directory`, a view resolving an actor uuid to a name and avatar.
--      `profiles` is readable only by its owner and by admins (0001/0002), so
--      without this a sales user would see "created by 6f3a…" instead of a
--      colleague's name. The view exposes ONLY id / name / avatar_url / role —
--      never email, modules or active — and, like the public catalogue views in
--      0020, it is an allow-list rebuilt column by column.
--
-- IMPORTANT, and it cannot be worked around: this is not retroactive. Every row
-- that already exists gets created_by = NULL, because the information was never
-- captured and cannot be recovered from anywhere. The UI must render that as
-- "Not recorded", not as an empty name. Attribution starts the moment this
-- migration is applied.

-- ---- 1. actor columns -----------------------------------------------------

-- The collections a person creates and edits. Deliberately EXCLUDES the
-- machine-written, high-volume tables (user_activities, event_logs,
-- whatsapp_logs, ai_messages, notifications, telecaller_calls): auditing those
-- would multiply the row count of the busiest tables in the database to record
-- that a cron job did what a cron job does.
do $$
declare c text;
begin
  foreach c in array array[
    'products','categories','customers','enquiries','leads',
    'quotations','invoices','payments','work','social',
    'automation_rules','message_templates','telecaller_jobs'
  ] loop
    execute format($f$
      alter table public.%1$I
        add column if not exists created_by uuid references auth.users(id) on delete set null,
        add column if not exists updated_by uuid references auth.users(id) on delete set null;
    $f$, c);
  end loop;
end $$;

-- Stamp the actor. auth.uid() is NULL for a service_role caller (the Tally
-- connector, the edge functions' cron sweeps); that NULL is meaningful and is
-- stored as-is — the UI reads it as "Automation", which is exactly what it was.
-- created_by is immutable after insert: an update carries the OLD value
-- forward, so nobody can reassign authorship by patching the row.
create or replace function public.stamp_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by = auth.uid();
    new.updated_by = auth.uid();
  else
    new.created_by = old.created_by;
    new.updated_by = auth.uid();
  end if;
  return new;
end $$;

-- ---- 2. the log ------------------------------------------------------------

create table if not exists public.audit_log (
  id         bigserial primary key,
  table_name text        not null,
  row_id     uuid        not null,
  action     text        not null check (action in ('insert','update','delete')),
  actor      uuid        references auth.users(id) on delete set null,
  at         timestamptz not null default now(),
  -- {key: {from, to}} for an update; the full doc for an insert or a delete.
  changes    jsonb       not null default '{}'::jsonb,
  -- A human handle for the row (quotation number, product name, customer name)
  -- resolved at write time. Kept so a deleted record's history still says WHAT
  -- was deleted after the row itself is gone.
  label      text
);

create index if not exists audit_log_row_idx on public.audit_log (table_name, row_id, at desc);
create index if not exists audit_log_at_idx  on public.audit_log (at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor, at desc);

alter table public.audit_log enable row level security;

-- Read-only to staff. There is deliberately no insert/update/delete policy:
-- the only writer is the SECURITY DEFINER trigger below, which bypasses RLS.
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (public.is_active_staff());

-- Best-effort human label for a row, so history survives the record.
create or replace function public.audit_label(p_table text, p_doc jsonb)
returns text language sql immutable set search_path = public as $$
  select nullif(trim(coalesce(
    p_doc->>'number',
    p_doc->>'name',
    p_doc->>'reference',
    p_doc->>'title',
    p_doc->'customer'->>'name',
    ''
  )), '');
$$;

-- Per-key diff of two docs, values over 500 characters replaced by a marker so
-- one pasted base64 image cannot turn the history table into the largest thing
-- in the database.
create or replace function public.audit_diff(p_old jsonb, p_new jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  k text;
  res jsonb := '{}'::jsonb;
  ov jsonb;
  nv jsonb;
  cap constant int := 500;
begin
  for k in
    select jsonb_object_keys from jsonb_object_keys(coalesce(p_old,'{}'::jsonb) || coalesce(p_new,'{}'::jsonb))
  loop
    ov := p_old -> k;
    nv := p_new -> k;
    if ov is distinct from nv then
      res := res || jsonb_build_object(k, jsonb_build_object(
        'from', case when length(coalesce(ov::text,'')) > cap then to_jsonb('…'::text) else ov end,
        'to',   case when length(coalesce(nv::text,'')) > cap then to_jsonb('…'::text) else nv end
      ));
    end if;
  end loop;
  return res;
end $$;

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (table_name, row_id, action, actor, changes, label)
    values (tg_table_name, new.id, 'insert', auth.uid(), coalesce(new.doc,'{}'::jsonb),
            public.audit_label(tg_table_name, new.doc));
    return new;
  elsif tg_op = 'UPDATE' then
    d := public.audit_diff(old.doc, new.doc);
    -- A no-op write (the app re-saving an unchanged record) is not history.
    if d = '{}'::jsonb then return new; end if;
    insert into public.audit_log (table_name, row_id, action, actor, changes, label)
    values (tg_table_name, new.id, 'update', auth.uid(), d,
            public.audit_label(tg_table_name, new.doc));
    return new;
  else
    insert into public.audit_log (table_name, row_id, action, actor, changes, label)
    values (tg_table_name, old.id, 'delete', auth.uid(), coalesce(old.doc,'{}'::jsonb),
            public.audit_label(tg_table_name, old.doc));
    return old;
  end if;
end $$;

-- Wire both triggers onto every audited table.
do $$
declare c text;
begin
  foreach c in array array[
    'products','categories','customers','enquiries','leads',
    'quotations','invoices','payments','work','social',
    'automation_rules','message_templates','telecaller_jobs'
  ] loop
    execute format($f$
      drop trigger if exists %1$s_stamp_actor on public.%1$I;
      create trigger %1$s_stamp_actor
        before insert or update on public.%1$I
        for each row execute function public.stamp_actor();

      drop trigger if exists %1$s_audit on public.%1$I;
      create trigger %1$s_audit
        after insert or update or delete on public.%1$I
        for each row execute function public.audit_row();
    $f$, c);
  end loop;
end $$;

-- ---- 3. resolving an actor to a person ------------------------------------

-- profiles is owner-or-admin readable, so a sales user joining audit_log.actor
-- against it would get nothing back and every entry would read as an unknown
-- uuid. This view is the allow-list that makes a colleague's NAME visible
-- without exposing their email, module grants or active flag. security_invoker
-- is left off (the default) precisely so it runs as the owner and bypasses the
-- profiles policies, the same trick 0020 uses for the public catalogue.
drop view if exists public.staff_directory;
create view public.staff_directory as
  select
    p.id,
    p.name,
    p.avatar_url,
    p.role
  from public.profiles p;

grant select on public.staff_directory to authenticated;

comment on view public.staff_directory is
  'id -> name/avatar/role for rendering audit attribution. Allow-list: never email, modules or active.';
