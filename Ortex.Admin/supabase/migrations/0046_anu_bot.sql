-- 0046_anu_bot.sql
--
-- ANU, THE TEAM BOT: team channels, daily team updates and attendance status,
-- all computed by SQL from the business tables and posted on a schedule by
-- pg_cron. No language model anywhere in this file: every sentence is built
-- from a query, so the same data always gives the same message.
--
--   Team channels   chat_conversations of kind 'team', one per team:
--                   sales, accounts, staff, management, everyone. Members are
--                   SYNCED from profiles.role (a trigger on profiles), and
--                   admins sit in every team so they see everything. A team
--                   channel cannot be left, renamed or edited by hand.
--   Bot messages    chat_messages of kind 'bot', sender NULL, drawn as Anu.
--   Reports         anu_daily_update(team, day) and anu_attendance_report(team,
--                   day, phase) return the text (or NULL when there is nothing
--                   to say, or the day is a holiday or weekly off).
--   Schedule        anu_bot_settings (one row, Super Admin) holds each job's
--                   time; anu_bot_tick() runs every 5 minutes and fires each job
--                   ONCE a day (anu_bot_runs), within two hours of its time, so
--                   a deploy late in the day does not post a stale morning report.
--   People posting  chat_post_to_team(): anyone may post to any team through
--                   Anu ("tell accounts ..."); only admins may post to Everyone.
--   On demand       anu_attendance_now() and anu_team_update() answer the Anu
--                   thread with the same text the schedule posts.
--
-- Money in the reports uses Indian grouping. Times are the company timezone
-- from attendance_settings (Asia/Kolkata).

-- ---- schema changes to chat (0045) --------------------------------------------------

alter table public.chat_conversations drop constraint if exists chat_conversations_kind_check;
alter table public.chat_conversations add constraint chat_conversations_kind_check
  check (kind in ('direct', 'group', 'assistant', 'team'));
alter table public.chat_conversations add column if not exists team text unique;

alter table public.chat_messages drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
  check (kind in ('text', 'system', 'assistant', 'bot'));

-- ---- small helpers -------------------------------------------------------------------

create or replace function public.anu_tz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select doc ->> 'timezone' from public.attendance_settings where id), 'Asia/Kolkata');
$$;

-- A doc date is an ISO string (console) or epoch milliseconds (older rows).
create or replace function public.anu_ts(p jsonb)
returns timestamptz language plpgsql immutable as $$
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;
  if jsonb_typeof(p) = 'number' then return to_timestamp((p #>> '{}')::numeric / 1000); end if;
  return (p #>> '{}')::timestamptz;
exception when others then
  return null;
end;
$$;

-- The local calendar day of a timestamp.
create or replace function public.anu_day(p timestamptz)
returns date language sql stable as $$
  select (p at time zone public.anu_tz())::date;
$$;

-- Rs 1,23,456 (Indian grouping, no paise).
create or replace function public.anu_money(p numeric)
returns text language plpgsql immutable as $$
declare
  s text := abs(round(coalesce(p, 0)))::bigint::text;
  head text;
begin
  if length(s) > 3 then
    head := left(s, length(s) - 3);
    head := regexp_replace(head, '(\d)(?=(\d{2})+$)', '\1,', 'g');
    s := head || ',' || right(s, 3);
  end if;
  return case when p < 0 then '-' else '' end || E'₹' || s;
end;
$$;

create or replace function public.anu_first(p_name text)
returns text language sql immutable as $$
  select coalesce(nullif(split_part(trim(coalesce(p_name, '')), ' ', 1), ''), 'Someone');
$$;

create or replace function public.anu_party(p_customer jsonb)
returns text language sql immutable as $$
  select coalesce(nullif(trim(p_customer ->> 'company'), ''), nullif(trim(p_customer ->> 'name'), ''), 'a customer');
$$;

-- ---- teams ------------------------------------------------------------------------------

-- key, title, the roles whose people ARE the team. Admins also sit in every team
-- channel (as observers), but are only counted in Management's reports.
create or replace function public.anu_teams()
returns table (key text, title text, roles text[])
language sql immutable as $$
  values
    ('sales', 'Sales team', array['sales']),
    ('accounts', 'Accounts team', array['accounts']),
    ('staff', 'Staff', array['staff']),
    ('management', 'Management', array['admin', 'super_admin']),
    ('everyone', 'Everyone', array['sales', 'accounts', 'staff', 'admin', 'super_admin']);
$$;

-- The team's own people (active), whose attendance and work the reports describe.
create or replace function public.anu_team_people(p_team text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p
  where p.active = true and p.role = any ((select t.roles from public.anu_teams() t where t.key = p_team)::text[]);
$$;

-- Which team a person belongs to (their role's team).
create or replace function public.anu_team_of(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.key from public.anu_teams() t join public.profiles p on p.role = any (t.roles)
  where p.id = p_user and t.key <> 'everyone' limit 1;
$$;

create or replace function public.anu_team_conversation(p_team text)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.chat_conversations where kind = 'team' and team = p_team;
$$;

-- Create the channels and make each one's members exactly its people plus the admins.
create or replace function public.anu_sync_teams()
returns void language plpgsql security definer set search_path = public as $$
declare
  t record;
  v_conv uuid;
begin
  for t in select * from public.anu_teams() loop
    insert into public.chat_conversations (kind, team, title, direct_key)
    values ('team', t.key, t.title, 'team:' || t.key)
    on conflict (direct_key) do update set title = excluded.title, kind = 'team', team = excluded.team;
    v_conv := public.anu_team_conversation(t.key);

    insert into public.chat_members (conversation_id, user_id, role)
    select v_conv, p.id, 'member' from public.profiles p
    where p.active = true and (p.role = any (t.roles) or p.role in ('admin', 'super_admin'))
    on conflict do nothing;

    delete from public.chat_members m
    where m.conversation_id = v_conv
      and not exists (
        select 1 from public.profiles p
        where p.id = m.user_id and p.active = true and (p.role = any (t.roles) or p.role in ('admin', 'super_admin'))
      );
  end loop;
end;
$$;

create or replace function public.anu_sync_teams_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.anu_sync_teams();
  exception when others then
    raise warning 'anu_sync_teams failed: %', sqlerrm; -- never block a profile change
  end;
  return null;
end;
$$;

drop trigger if exists anu_sync_teams on public.profiles;
create trigger anu_sync_teams after insert or delete or update of role, active on public.profiles
  for each statement execute function public.anu_sync_teams_trigger();

-- ---- settings and run log -------------------------------------------------------------

create table if not exists public.anu_bot_settings (
  id boolean primary key default true check (id),
  doc jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.anu_bot_settings (id, doc) values (true, jsonb_build_object(
  'dailyUpdate', jsonb_build_object('enabled', true, 'time', '09:45', 'teams', jsonb_build_array('sales', 'accounts', 'staff', 'management')),
  'attendanceMorning', jsonb_build_object('enabled', true, 'time', '10:15', 'teams', jsonb_build_array('sales', 'accounts', 'staff', 'management')),
  'attendanceEvening', jsonb_build_object('enabled', true, 'time', '19:00', 'teams', jsonb_build_array('sales', 'accounts', 'staff', 'management'))
)) on conflict (id) do nothing;

alter table public.anu_bot_settings enable row level security;
drop policy if exists anu_bot_settings_read on public.anu_bot_settings;
create policy anu_bot_settings_read on public.anu_bot_settings for select to authenticated using (public.is_admin());
drop policy if exists anu_bot_settings_write on public.anu_bot_settings;
create policy anu_bot_settings_write on public.anu_bot_settings for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select, update on public.anu_bot_settings to authenticated;

create table if not exists public.anu_bot_runs (
  job text not null,
  team text not null,
  day date not null,
  outcome text not null,
  ran_at timestamptz not null default now(),
  primary key (job, team, day)
);
alter table public.anu_bot_runs enable row level security;
drop policy if exists anu_bot_runs_read on public.anu_bot_runs;
create policy anu_bot_runs_read on public.anu_bot_runs for select to authenticated using (public.is_admin());
grant select on public.anu_bot_runs to authenticated;

-- ---- posting ---------------------------------------------------------------------------

create or replace function public.anu_bot_post(p_team text, p_body text, p_meta jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_conv uuid := public.anu_team_conversation(p_team);
  v_id uuid;
begin
  if v_conv is null or coalesce(trim(p_body), '') = '' then return null; end if;
  insert into public.chat_messages (conversation_id, sender_id, kind, body, meta)
  values (v_conv, null, 'bot', left(p_body, 8000), p_meta)
  returning id into v_id;
  update public.chat_conversations set updated_at = now() where id = v_conv;
  return v_id;
end;
$$;

-- A person posting to a team through Anu. Anyone may reach any team; only
-- admins may post to Everyone. The sender's name rides in meta, because a
-- sender outside the team is not in its member list.
create or replace function public.chat_post_to_team(p_team text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_conv uuid := public.anu_team_conversation(p_team);
  v_body text := left(trim(coalesce(p_body, '')), 4000);
  v_id uuid;
begin
  if v_me is null or not public.is_active_staff() then raise exception 'not_staff'; end if;
  if v_conv is null then raise exception 'no_team'; end if;
  if p_team = 'everyone' and not public.is_admin() then raise exception 'admins_only'; end if;
  if v_body = '' then raise exception 'empty'; end if;
  insert into public.chat_messages (conversation_id, sender_id, kind, body, meta)
  values (v_conv, v_me, 'text', v_body, jsonb_build_object('via', 'anu', 'sender_name', (select name from public.profiles where id = v_me)))
  returning id into v_id;
  update public.chat_conversations set updated_at = now() where id = v_conv;
  return v_id;
end;
$$;

-- ---- attendance report -------------------------------------------------------------------

-- phase 'morning': who is in, who is late, who is not in yet, who is on leave.
-- phase 'evening': present / absent / on leave, and who has not checked out.
-- phase 'now':     the morning shape at any hour (the on-demand answer).
create or replace function public.anu_attendance_report(p_team text, p_day date, p_phase text default 'now')
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.anu_tz();
  v_set jsonb := coalesce((select doc from public.attendance_settings where id), '{}'::jsonb);
  v_start timestamptz := public.attendance_at(p_day, coalesce(v_set #>> '{shift,start}', '09:30'), v_tz);
  v_grace int := coalesce((v_set ->> 'graceMin')::int, 15);
  v_title text := (select title from public.anu_teams() where key = p_team);
  v_total int := 0;
  v_in int := 0;
  v_lines text[] := '{}';
  v_in_list text[] := '{}';
  v_late text[] := '{}';
  v_missing text[] := '{}';
  v_leave text[] := '{}';
  v_open text[] := '{}';
  r record;
begin
  if public.attendance_is_off_day(p_day) then return null; end if;

  for r in
    select p.id, public.anu_first(p.name) as first,
      (select min(a.at) from public.attendance_punches a where a.user_id = p.id and a.day = p_day and a.kind = 'in' and a.review <> 'rejected') as first_in,
      (select max(a.at) from public.attendance_punches a where a.user_id = p.id and a.day = p_day and a.kind = 'out' and a.review <> 'rejected') as last_out,
      (select l.type_code || case when l.from_day = p_day and l.from_half = 'second' then ', from lunch'
                                  when l.to_day = p_day and l.to_half = 'first' then ', till lunch' else '' end
         from public.leave_requests l
        where l.user_id = p.id and l.status = 'approved' and p_day between l.from_day and l.to_day limit 1) as leave
    from public.profiles p
    where p.id in (select public.anu_team_people(p_team))
    order by p.name
  loop
    v_total := v_total + 1;
    if r.leave is not null and r.first_in is null then
      v_leave := v_leave || (r.first || ' (' || r.leave || ')');
      continue;
    end if;
    if r.first_in is null then
      v_missing := v_missing || r.first;
      continue;
    end if;
    v_in := v_in + 1;
    if r.first_in > v_start + make_interval(mins => v_grace) then
      v_late := v_late || (r.first || ' ' || to_char(r.first_in at time zone v_tz, 'HH24:MI') || ', '
        || (extract(epoch from (r.first_in - v_start)) / 60)::int || ' min late');
    else
      v_in_list := v_in_list || (r.first || ' ' || to_char(r.first_in at time zone v_tz, 'HH24:MI'));
    end if;
    if r.last_out is null or r.last_out < r.first_in then
      v_open := v_open || (r.first || ', in since ' || to_char(r.first_in at time zone v_tz, 'HH24:MI'));
    end if;
  end loop;

  if v_total = 0 then return null; end if;

  if p_phase = 'evening' then
    v_lines := v_lines || ('Attendance summary, ' || v_title || ', ' || to_char(p_day, 'FMDay, FMDD FMMonth'));
    v_lines := v_lines || ('Present: ' || v_in || ' of ' || v_total
      || case when cardinality(v_leave) > 0 then ', on leave: ' || cardinality(v_leave) else '' end
      || case when cardinality(v_missing) > 0 then ', absent: ' || cardinality(v_missing) else '' end);
    if cardinality(v_missing) > 0 then v_lines := v_lines || ('Absent (no check-in): ' || array_to_string(v_missing, ', ')); end if;
    if cardinality(v_leave) > 0 then v_lines := v_lines || ('On leave: ' || array_to_string(v_leave, ', ')); end if;
    if cardinality(v_late) > 0 then v_lines := v_lines || ('Came late: ' || array_to_string(v_late, '; ')); end if;
    if cardinality(v_open) > 0 then
      v_lines := v_lines || ('Not checked out yet: ' || array_to_string(v_open, '; ') || '. Please check out in the Ortex app.');
    end if;
  else
    v_lines := v_lines || ('Attendance, ' || v_title || ', ' || to_char(p_day, 'FMDay, FMDD FMMonth')
      || ' at ' || to_char(now() at time zone v_tz, 'HH24:MI'));
    v_lines := v_lines || ('Checked in: ' || v_in || ' of ' || v_total);
    if cardinality(v_in_list) > 0 then v_lines := v_lines || ('On time: ' || array_to_string(v_in_list, ', ')); end if;
    if cardinality(v_late) > 0 then v_lines := v_lines || ('Late: ' || array_to_string(v_late, '; ')); end if;
    if cardinality(v_missing) > 0 then
      v_lines := v_lines || ('Not checked in yet: ' || array_to_string(v_missing, ', ')
        || case when p_phase = 'morning' then '. If you are working today, please scan the QR code in the Ortex app.' else '' end);
    end if;
    if cardinality(v_leave) > 0 then v_lines := v_lines || ('On leave: ' || array_to_string(v_leave, ', ')); end if;
    if cardinality(v_missing) = 0 and v_in = v_total - cardinality(v_leave) then
      v_lines := v_lines || 'Everyone expected today has checked in.'::text;
    end if;
  end if;
  return array_to_string(v_lines, E'\n');
end;
$$;

-- ---- daily team update -------------------------------------------------------------------

create or replace function public.anu_daily_update(p_team text, p_day date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.anu_tz();
  v_yday date := p_day - 1;
  v_now timestamptz := now();
  v_lines text[] := '{}';
  v_list text[];
  n1 int; n2 int; n3 int;
  m1 numeric; m2 numeric;
  v_voice constant text := 'Voice assistant (Anu)';
  v_holiday record;
begin
  if public.attendance_is_off_day(p_day) then return null; end if;
  v_lines := v_lines || ('Good morning, ' || (select title from public.anu_teams() where key = p_team)
    || '. Your update for ' || to_char(p_day, 'FMDay, FMDD FMMonth') || '.');

  if p_team in ('sales', 'management') then
    select count(*) filter (where coalesce(doc ->> 'source', '') <> v_voice and public.anu_day(created_at) = v_yday),
           count(distinct coalesce(doc #>> '{call,id}', id::text)) filter (where doc ->> 'source' = v_voice and public.anu_day(created_at) = v_yday),
           count(*) filter (where coalesce(doc ->> 'source', '') <> v_voice and coalesce(doc ->> 'status', 'new') = 'new')
      into n1, n2, n3
      from public.enquiries;
    v_lines := v_lines || ('Leads yesterday: ' || n1 || ' website ' || case when n1 = 1 then 'enquiry' else 'enquiries' end
      || ', ' || n2 || ' Anu ' || case when n2 = 1 then 'call' else 'calls' end || '.');
    if n3 > 0 then
      select count(*) into n1 from public.enquiries
       where coalesce(doc ->> 'source', '') <> v_voice and coalesce(doc ->> 'status', 'new') = 'new' and created_at < v_now - interval '2 days';
      v_lines := v_lines || ('Still new, not contacted: ' || n3 || case when n1 > 0 then ' (' || n1 || ' waiting over 2 days)' else '' end || '.');
    end if;

    select count(*), coalesce(sum((doc #>> '{totals,grandTotal}')::numeric), 0) into n1, m1
      from public.quotations
     where coalesce(doc ->> 'status', 'draft') <> 'draft' and public.anu_day(coalesce(public.anu_ts(doc -> 'issueDate'), created_at)) = v_yday;
    select count(*), coalesce(sum((doc #>> '{totals,grandTotal}')::numeric), 0) into n2, m2
      from public.quotations
     where doc ->> 'status' in ('accepted', 'invoiced') and public.anu_day(updated_at) = v_yday;
    v_lines := v_lines || ('Quotations yesterday: ' || n1 || ' sent (' || public.anu_money(m1) || '), '
      || n2 || ' won (' || public.anu_money(m2) || ').');

    select array_agg(line order by until) into v_list from (
      select coalesce(doc ->> 'number', 'Quotation') || ', ' || public.anu_party(doc -> 'customer') || ', '
             || public.anu_money((doc #>> '{totals,grandTotal}')::numeric) || ', valid till '
             || to_char(public.anu_ts(doc -> 'validUntil') at time zone v_tz, 'FMDD FMMon') as line,
             public.anu_ts(doc -> 'validUntil') as until
        from public.quotations
       where doc ->> 'status' = 'sent'
         and public.anu_ts(doc -> 'validUntil') between v_now and v_now + interval '3 days'
       order by 2 limit 5) x;
    if v_list is not null then
      v_lines := v_lines || ('Expiring in 3 days, follow up:' || E'\n- ' || array_to_string(v_list, E'\n- '));
    end if;

    select count(*), coalesce(sum((doc #>> '{totals,grandTotal}')::numeric), 0) into n1, m1
      from public.quotations where doc ->> 'status' = 'sent';
    v_lines := v_lines || ('Open pipeline: ' || n1 || ' sent ' || case when n1 = 1 then 'quotation' else 'quotations' end
      || ' worth ' || public.anu_money(m1) || '.');
  end if;

  if p_team in ('accounts', 'management') then
    with inv as (
      select i.id, i.doc,
             coalesce((i.doc #>> '{totals,grandTotal}')::numeric, 0)
               - coalesce((select sum((p.doc ->> 'amount')::numeric) from public.payments p
                            where p.doc ->> 'invoiceId' = i.id::text and p.doc ->> 'type' = 'inflow'), 0) as balance,
             public.anu_ts(i.doc -> 'dueDate') as due
        from public.invoices i
       where coalesce(i.doc ->> 'status', '') not in ('paid', 'cancelled', 'draft')
    )
    select count(*) filter (where balance > 0.5 and due < v_now),
           coalesce(sum(balance) filter (where balance > 0.5 and due < v_now), 0),
           count(*) filter (where balance > 0.5 and due between v_now and v_now + interval '3 days'),
           coalesce(sum(balance) filter (where balance > 0.5 and due between v_now and v_now + interval '3 days'), 0)
      into n1, m1, n2, m2
      from inv;
    v_lines := v_lines || ('Overdue invoices: ' || n1 || ' (' || public.anu_money(m1) || ').'
      || case when n2 > 0 then ' Due in the next 3 days: ' || n2 || ' (' || public.anu_money(m2) || ').' else '' end);

    select array_agg(line) into v_list from (
      select coalesce(i.doc ->> 'number', 'Invoice') || ', ' || public.anu_party(i.doc -> 'customer') || ', '
             || public.anu_money(bal) || ', ' || (p_day - public.anu_day(public.anu_ts(i.doc -> 'dueDate'))) || ' days late' as line
        from (
          select i.*, coalesce((i.doc #>> '{totals,grandTotal}')::numeric, 0)
                 - coalesce((select sum((p.doc ->> 'amount')::numeric) from public.payments p
                              where p.doc ->> 'invoiceId' = i.id::text and p.doc ->> 'type' = 'inflow'), 0) as bal
            from public.invoices i
           where coalesce(i.doc ->> 'status', '') not in ('paid', 'cancelled', 'draft')
             and public.anu_ts(i.doc -> 'dueDate') < v_now
        ) i
       where bal > 0.5
       order by bal desc limit 3) x;
    if v_list is not null then
      v_lines := v_lines || ('Biggest overdue:' || E'\n- ' || array_to_string(v_list, E'\n- '));
    end if;

    select count(*), coalesce(sum((doc ->> 'amount')::numeric), 0) into n1, m1
      from public.payments
     where doc ->> 'type' = 'inflow' and public.anu_day(coalesce(public.anu_ts(doc -> 'date'), created_at)) = v_yday;
    v_lines := v_lines || ('Payments received yesterday: ' || n1 || ' (' || public.anu_money(m1) || ').');
  end if;

  if p_team in ('accounts', 'management') then
    select count(*) into n1 from public.leave_requests where status = 'pending';
    select count(*) into n2 from public.regularisations where status = 'pending';
    if n1 + n2 > 0 then
      v_lines := v_lines || ('Waiting for approval: ' || n1 || ' leave ' || case when n1 = 1 then 'request' else 'requests' end
        || ', ' || n2 || ' attendance ' || case when n2 = 1 then 'correction' else 'corrections' end || '.');
    end if;
  end if;

  if p_team in ('staff', 'management', 'accounts') then
    select count(*) filter (where d.status in ('P', 'HD', 'OD') or d.override_status in ('P', 'HD', 'OD')),
           count(*) filter (where coalesce(d.override_status, d.status) = 'A'),
           count(*) filter (where d.late)
      into n1, n2, n3
      from public.attendance_days d
     where d.day = v_yday
       and d.user_id in (select public.anu_team_people(case when p_team = 'staff' then 'staff' else 'everyone' end));
    if n1 + n2 > 0 then
      v_lines := v_lines || ('Attendance yesterday' || case when p_team = 'staff' then '' else ' (whole company)' end || ': '
        || n1 || ' present, ' || n2 || ' absent, ' || n3 || ' late.');
    end if;
  end if;

  select h.day, h.name into v_holiday from public.holidays h
   where h.active and h.kind <> 'optional' and h.day > p_day and h.day <= p_day + 14
   order by h.day limit 1;
  if found then
    v_lines := v_lines || ('Coming up: ' || v_holiday.name || ' holiday on ' || to_char(v_holiday.day, 'FMDay, FMDD FMMonth') || '.');
  end if;

  return array_to_string(v_lines, E'\n');
end;
$$;

-- ---- the scheduler ----------------------------------------------------------------------

create or replace function public.anu_bot_run(p_job text, p_team text, p_day date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_body text;
begin
  v_body := case p_job
    when 'dailyUpdate' then public.anu_daily_update(p_team, p_day)
    when 'attendanceMorning' then public.anu_attendance_report(p_team, p_day, 'morning')
    when 'attendanceEvening' then public.anu_attendance_report(p_team, p_day, 'evening')
  end;
  if v_body is null then return 'nothing'; end if;
  perform public.anu_bot_post(p_team, v_body, jsonb_build_object('job', p_job, 'day', p_day));
  return 'posted';
end;
$$;

create or replace function public.anu_bot_tick()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_local timestamp := now() at time zone public.anu_tz();
  v_today date := v_local::date;
  v_hhmm text := to_char(v_local, 'HH24:MI');
  v_doc jsonb := coalesce((select doc from public.anu_bot_settings where id), '{}'::jsonb);
  v_job text;
  v_cfg jsonb;
  v_team text;
  v_outcome text;
begin
  foreach v_job in array array['dailyUpdate', 'attendanceMorning', 'attendanceEvening'] loop
    v_cfg := v_doc -> v_job;
    continue when v_cfg is null or coalesce((v_cfg ->> 'enabled')::boolean, false) = false;
    -- Due from its time for two hours, never earlier and never much later.
    continue when v_hhmm < (v_cfg ->> 'time')
      or v_local > (v_today + (v_cfg ->> 'time')::time + interval '2 hours');
    for v_team in select jsonb_array_elements_text(coalesce(v_cfg -> 'teams', '[]'::jsonb)) loop
      continue when exists (select 1 from public.anu_bot_runs where job = v_job and team = v_team and day = v_today);
      begin
        v_outcome := public.anu_bot_run(v_job, v_team, v_today);
      exception when others then
        v_outcome := 'error: ' || left(sqlerrm, 200);
      end;
      insert into public.anu_bot_runs (job, team, day, outcome) values (v_job, v_team, v_today, v_outcome)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

-- ---- on demand (the Anu thread) --------------------------------------------------------------

-- Who may see a team's attendance: admins and the attendance-team grant see
-- any team; everyone else sees their own team.
create or replace function public.anu_can_see_team(p_team text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_staff() and (
    public.is_admin() or public.has_module_access('attendance-team') or public.anu_team_of(auth.uid()) = p_team
  );
$$;

create or replace function public.anu_attendance_now(p_team text default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_team text := coalesce(p_team,
    case when public.is_admin() or public.has_module_access('attendance-team') then 'everyone' else public.anu_team_of(auth.uid()) end);
  v_day date := public.anu_day(now());
  v_text text;
begin
  if v_team is null or not public.anu_can_see_team(v_team) then raise exception 'not_allowed'; end if;
  v_text := public.anu_attendance_report(v_team, v_day, case when to_char(now() at time zone public.anu_tz(), 'HH24:MI') >= '18:30' then 'evening' else 'now' end);
  return coalesce(v_text, 'Today is a holiday or weekly off, so there is no attendance to report.');
end;
$$;

create or replace function public.anu_team_update(p_team text default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_team text := coalesce(p_team, case when public.is_admin() then 'management' else public.anu_team_of(auth.uid()) end);
begin
  if v_team is null or not public.is_active_staff() or not (public.is_admin() or public.anu_team_of(auth.uid()) = v_team) then
    raise exception 'not_allowed';
  end if;
  return coalesce(public.anu_daily_update(v_team, public.anu_day(now())), 'Today is a holiday or weekly off, so there is no update.');
end;
$$;

create or replace function public.anu_my_team()
returns text language sql stable security definer set search_path = public as $$
  select public.anu_team_of(auth.uid());
$$;

-- An admin sending a job now (the Automations panel), whatever the run log says.
create or replace function public.anu_bot_run_now(p_job text, p_team text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() or not public.is_active_staff() then raise exception 'admins_only'; end if;
  if p_job not in ('dailyUpdate', 'attendanceMorning', 'attendanceEvening') then raise exception 'bad_job'; end if;
  if not exists (select 1 from public.anu_teams() where key = p_team) then raise exception 'no_team'; end if;
  return public.anu_bot_run(p_job, p_team, public.anu_day(now()));
end;
$$;

-- ---- the inbox now carries each conversation's team -------------------------------------------

create or replace function public.chat_inbox()
returns jsonb language sql security definer stable set search_path = public as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.activity_at desc), '[]'::jsonb)
  from (
    select
      c.id, c.kind, c.title, c.team, c.created_at,
      me.muted, me.role as my_role, me.last_read_at,
      coalesce(last.created_at, c.updated_at) as activity_at,
      case when last.id is null then null else jsonb_build_object(
        'id', last.id, 'sender_id', last.sender_id, 'kind', last.kind, 'body', left(last.body, 200),
        'attachment', last.attachment, 'deleted', last.deleted_at is not null, 'created_at', last.created_at,
        'sender_name', last.meta ->> 'sender_name'
      ) end as last_message,
      (
        select count(*) from public.chat_messages u
        where u.conversation_id = c.id
          and u.created_at > coalesce(me.last_read_at, '-infinity'::timestamptz)
          and u.sender_id is distinct from auth.uid()
          and u.kind <> 'system'
      ) as unread,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id, 'name', p.name, 'avatar_url', p.avatar_url, 'role', p.role,
          'active', p.active, 'member_role', m.role, 'last_read_at', m.last_read_at
        ) order by p.name), '[]'::jsonb)
        from public.chat_members m join public.profiles p on p.id = m.user_id
        where m.conversation_id = c.id
      ) as members
    from public.chat_conversations c
    join public.chat_members me on me.conversation_id = c.id and me.user_id = auth.uid()
    left join lateral (
      select * from public.chat_messages l
      where l.conversation_id = c.id order by l.created_at desc limit 1
    ) last on true
    where public.is_active_staff()
  ) x;
$$;

-- ---- grants --------------------------------------------------------------------------------

revoke execute on function public.anu_bot_post(text, text, jsonb), public.anu_bot_run(text, text, date),
  public.anu_bot_tick(), public.anu_sync_teams(), public.anu_daily_update(text, date),
  public.anu_attendance_report(text, date, text), public.anu_team_people(text)
  from public, anon, authenticated;

revoke execute on function public.chat_post_to_team(text, text), public.anu_attendance_now(text),
  public.anu_team_update(text), public.anu_my_team(), public.anu_bot_run_now(text, text),
  public.anu_can_see_team(text)
  from public, anon;
grant execute on function public.chat_post_to_team(text, text), public.anu_attendance_now(text),
  public.anu_team_update(text), public.anu_my_team(), public.anu_bot_run_now(text, text),
  public.anu_can_see_team(text)
  to authenticated;

-- ---- create the channels now, and schedule the tick ---------------------------------------------

select public.anu_sync_teams();

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'anu-bot-tick';
  perform cron.schedule('anu-bot-tick', '*/5 * * * *', $job$ select public.anu_bot_tick() $job$);
exception when others then
  raise warning 'pg_cron is not available, so Anu''s scheduled posts will not run: %', sqlerrm;
end $$;
