-- 0069: Team chat and Anu fixes from the 2026-10-03 audit.
--
-- Every function below is redefined from its LATEST version (named in its
-- section) and changes only what its section says. Plain `create or replace`,
-- `drop ... if exists` and `if not exists`: safe to run twice.
--
--   1. chat_send (from 0045). Only admins post into the Everyone channel (Anu's
--      chat_post_to_team already said so; a plain send did not). The meta keys
--      `sender_name` and `via` are dropped from a person's message: chat_inbox
--      shows `sender_name` in the preview, so anyone could post under another
--      name. Only chat_post_to_team (0046) writes them, straight into the table.
--   2. anu_bot_tick (from 0046). A job whose time is not HH:MM is skipped
--      instead of failing the cast and stopping every job of the tick. A run
--      that ended in an error is tried again on the next tick (still within the
--      two hours); only a run with an outcome other than an error blocks it.
--   3. anu_bot_run_now (from 0046) records today's run, so the schedule does not
--      post the same job to the same team again later that day.
--   4. anu_daily_update (from 0066) gains p_enquiries, p_quotations and
--      p_approvals (default true, as the schedule posts to the whole channel),
--      and anu_team_update (from 0066) passes the asker's module access: lead
--      counts need `enquiries`, quotation figures `quotations`, the leave and
--      correction counts `attendance-team`, as invoices and payments did in 0066.
--   5. enquiries: someone with only the `voice-leads` module reads and updates
--      the Anu voice rows (source 'Voice assistant (Anu)'), and only those. The
--      0007 policy (enquiries module, every row) stays.
--   6. voice-recordings upload (from 0025). The anonymous insert also needs a
--      voice enquiry created in the last 2 hours whose doc.call.recording is this
--      exact path, and no file there yet. The website saves the lead during the
--      call and uploads only when the call ends with one (Ortex.Web
--      live-orty/useLiveSession.js), so the row is already there.

-- ---- 1. chat_send (from 0045) ------------------------------------------------------

create or replace function public.chat_send(
  p_id uuid,
  p_conversation uuid,
  p_body text,
  p_attachment jsonb default null,
  p_reply_to uuid default null,
  p_kind text default 'text',
  p_meta jsonb default null
)
returns public.chat_messages language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_kind text := coalesce(p_kind, 'text');
  v_conv_kind text;
  v_team text;
  v_body text := left(coalesce(p_body, ''), 8000);
  v_row public.chat_messages;
begin
  if not public.chat_is_member(p_conversation) then raise exception 'not_member'; end if;
  select kind, team into v_conv_kind, v_team from public.chat_conversations where id = p_conversation;
  if v_conv_kind = 'team' and v_team = 'everyone' and not public.is_admin() then raise exception 'admins_only'; end if;

  if v_kind not in ('text', 'assistant') then raise exception 'bad_kind'; end if;
  if v_kind = 'assistant' and v_conv_kind <> 'assistant' then raise exception 'bad_kind'; end if;
  if trim(v_body) = '' and p_attachment is null then raise exception 'empty'; end if;
  if p_meta is not null and length(p_meta::text) > 20000 then raise exception 'meta_too_large'; end if;
  -- A meta that is not an object cannot carry the keys, and `-` would raise on a scalar.
  if jsonb_typeof(p_meta) = 'object' then p_meta := p_meta - 'sender_name' - 'via'; end if;

  -- An attachment must live in THIS conversation's folder of the chat bucket.
  if p_attachment is not null then
    if coalesce(p_attachment ->> 'path', '') not like p_conversation::text || '/%' then
      raise exception 'bad_attachment';
    end if;
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.chat_messages where id = p_reply_to and conversation_id = p_conversation
  ) then
    p_reply_to := null;
  end if;

  insert into public.chat_messages (id, conversation_id, sender_id, kind, body, attachment, reply_to, meta)
  values (coalesce(p_id, gen_random_uuid()), p_conversation, v_me, v_kind, nullif(v_body, ''), p_attachment, p_reply_to, p_meta)
  on conflict (id) do nothing
  returning * into v_row;

  -- A retried send: hand back the row it already wrote (never one from another conversation).
  if v_row.id is null then
    select * into v_row from public.chat_messages where id = p_id and conversation_id = p_conversation;
    if v_row.id is null then raise exception 'bad_id'; end if;
  end if;

  update public.chat_conversations set updated_at = now() where id = p_conversation;
  update public.chat_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = v_me;
  return v_row;
end;
$$;

-- ---- 2. anu_bot_tick (from 0046) ---------------------------------------------------

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
    continue when v_cfg is null or jsonb_typeof(v_cfg) <> 'object'
      or coalesce((v_cfg ->> 'enabled')::boolean, false) = false;
    -- A missing or broken time skips this job only; the cast below cannot fail.
    continue when coalesce(v_cfg ->> 'time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    -- Due from its time for two hours, never earlier and never much later.
    continue when v_hhmm < (v_cfg ->> 'time')
      or v_local > (v_today + (v_cfg ->> 'time')::time + interval '2 hours');
    for v_team in select jsonb_array_elements_text(case when jsonb_typeof(v_cfg -> 'teams') = 'array' then v_cfg -> 'teams' else '[]'::jsonb end) loop
      -- Done for today unless the last attempt failed; a failed one is tried again.
      continue when exists (
        select 1 from public.anu_bot_runs
         where job = v_job and team = v_team and day = v_today and outcome not like 'error%'
      );
      begin
        v_outcome := public.anu_bot_run(v_job, v_team, v_today);
      exception when others then
        v_outcome := 'error: ' || left(sqlerrm, 200);
      end;
      insert into public.anu_bot_runs (job, team, day, outcome) values (v_job, v_team, v_today, v_outcome)
      on conflict (job, team, day) do update set outcome = excluded.outcome, ran_at = now();
    end loop;
  end loop;
end;
$$;

-- ---- 3. anu_bot_run_now (from 0046) ------------------------------------------------

-- An admin sending a job now (the Automations panel), whatever the run log says.
-- The run is logged for today, so the schedule does not post it a second time.
create or replace function public.anu_bot_run_now(p_job text, p_team text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_day date := public.anu_day(now());
  v_outcome text;
begin
  if not public.is_admin() or not public.is_active_staff() then raise exception 'admins_only'; end if;
  if p_job not in ('dailyUpdate', 'attendanceMorning', 'attendanceEvening') then raise exception 'bad_job'; end if;
  if not exists (select 1 from public.anu_teams() where key = p_team) then raise exception 'no_team'; end if;
  v_outcome := public.anu_bot_run(p_job, p_team, v_day);
  insert into public.anu_bot_runs (job, team, day, outcome) values (p_job, p_team, v_day, v_outcome)
  on conflict (job, team, day) do update set outcome = excluded.outcome, ran_at = now();
  return v_outcome;
end;
$$;

-- ---- 4. anu_daily_update and anu_team_update (from 0066) ---------------------------

drop function if exists public.anu_daily_update(text, date, boolean, boolean);

create or replace function public.anu_daily_update(p_team text, p_day date,
  p_invoices boolean default true, p_payments boolean default true,
  p_enquiries boolean default true, p_quotations boolean default true, p_approvals boolean default true)
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

  if p_team in ('sales', 'management') and p_enquiries then
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
  end if;

  if p_team in ('sales', 'management') and p_quotations then
    select count(*), coalesce(sum(public.safe_num(doc #>> '{totals,grandTotal}')), 0) into n1, m1
      from public.quotations
     where coalesce(doc ->> 'status', 'draft') <> 'draft' and public.anu_day(coalesce(public.anu_ts(doc -> 'issueDate'), created_at)) = v_yday;
    select count(*), coalesce(sum(public.safe_num(doc #>> '{totals,grandTotal}')), 0) into n2, m2
      from public.quotations
     where doc ->> 'status' in ('accepted', 'invoiced') and public.anu_day(updated_at) = v_yday;
    v_lines := v_lines || ('Quotations yesterday: ' || n1 || ' sent (' || public.anu_money(m1) || '), '
      || n2 || ' won (' || public.anu_money(m2) || ').');

    select array_agg(line order by until) into v_list from (
      select coalesce(doc ->> 'number', 'Quotation') || ', ' || public.anu_party(doc -> 'customer') || ', '
             || public.anu_money(public.safe_num(doc #>> '{totals,grandTotal}')) || ', valid till '
             || to_char(public.anu_ts(doc -> 'validUntil') at time zone v_tz, 'FMDD FMMon') as line,
             public.anu_ts(doc -> 'validUntil') as until
        from public.quotations
       where doc ->> 'status' = 'sent'
         and public.anu_ts(doc -> 'validUntil') between v_now and v_now + interval '3 days'
       order by 2 limit 5) x;
    if v_list is not null then
      v_lines := v_lines || ('Expiring in 3 days, follow up:' || E'\n- ' || array_to_string(v_list, E'\n- '));
    end if;

    select count(*), coalesce(sum(public.safe_num(doc #>> '{totals,grandTotal}')), 0) into n1, m1
      from public.quotations where doc ->> 'status' = 'sent';
    v_lines := v_lines || ('Open pipeline: ' || n1 || ' sent ' || case when n1 = 1 then 'quotation' else 'quotations' end
      || ' worth ' || public.anu_money(m1) || '.');
  end if;

  if p_team in ('accounts', 'management') and p_invoices then
    with inv as (
      select i.id, i.doc,
             coalesce(public.safe_num(i.doc #>> '{totals,grandTotal}'), 0)
               - coalesce((select sum(public.safe_num(p.doc ->> 'amount')) from public.payments p
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
          select i.*, coalesce(public.safe_num(i.doc #>> '{totals,grandTotal}'), 0)
                 - coalesce((select sum(public.safe_num(p.doc ->> 'amount')) from public.payments p
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
  end if;

  if p_team in ('accounts', 'management') and p_payments then
    select count(*), coalesce(sum(public.safe_num(doc ->> 'amount')), 0) into n1, m1
      from public.payments
     where doc ->> 'type' = 'inflow' and public.anu_day(coalesce(public.anu_ts(doc -> 'date'), created_at)) = v_yday;
    v_lines := v_lines || ('Payments received yesterday: ' || n1 || ' (' || public.anu_money(m1) || ').');
  end if;

  if p_team in ('accounts', 'management') and p_approvals then
    select count(*) into n1 from public.leave_requests where status = 'pending';
    select count(*) into n2 from public.regularisations where status = 'pending';
    if n1 + n2 > 0 then
      v_lines := v_lines || ('Waiting for approval: ' || n1 || ' leave ' || case when n1 = 1 then 'request' else 'requests' end
        || ', ' || n2 || ' attendance ' || case when n2 = 1 then 'correction' else 'corrections' end || '.');
    end if;
  end if;

  if p_team in ('staff', 'management', 'accounts') then
    -- 0065: one verdict per day, the override's when there is one, so a day
    -- overridden from P to A is no longer counted present AND absent. Work on a
    -- weekly off or a holiday counts as present, never as absent.
    select count(*) filter (where coalesce(d.override_status, d.status) in ('P', 'HD', 'OD')
                               or (d.override_status is null and 'worked_off_day' = any (d.flags))),
           count(*) filter (where coalesce(d.override_status, d.status) = 'A'
                               and not (d.override_status is null and 'worked_off_day' = any (d.flags))),
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
revoke execute on function public.anu_daily_update(text, date, boolean, boolean, boolean, boolean, boolean) from public, anon, authenticated;

create or replace function public.anu_team_update(p_team text default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_team text := coalesce(p_team, case when public.is_admin() then 'management' else public.anu_team_of(auth.uid()) end);
begin
  if v_team is null or not public.is_active_staff() or not (public.is_admin() or public.anu_team_of(auth.uid()) = v_team) then
    raise exception 'not_allowed';
  end if;
  return coalesce(public.anu_daily_update(v_team, public.anu_day(now()),
                    public.has_module_access('invoices'), public.has_module_access('payments'),
                    public.has_module_access('enquiries'), public.has_module_access('quotations'),
                    public.has_module_access('attendance-team')),
                  'Today is a holiday or weekly off, so there is no update.');
end;
$$;

-- ---- 5. enquiries: the voice-leads module reads and updates voice rows ------------

drop policy if exists voice_leads_enquiries_read on public.enquiries;
create policy voice_leads_enquiries_read on public.enquiries
  for select to authenticated
  using (doc ->> 'source' = 'Voice assistant (Anu)' and public.has_module_access('voice-leads'));

drop policy if exists voice_leads_enquiries_update on public.enquiries;
create policy voice_leads_enquiries_update on public.enquiries
  for update to authenticated
  using (doc ->> 'source' = 'Voice assistant (Anu)' and public.has_module_access('voice-leads'))
  with check (doc ->> 'source' = 'Voice assistant (Anu)' and public.has_module_access('voice-leads'));

-- ---- 6. voice-recordings anonymous upload (from 0025) ------------------------------

create index if not exists enquiries_call_recording_idx
  on public.enquiries ((doc #>> '{call,recording}'))
  where doc #>> '{call,recording}' is not null;

-- SECURITY DEFINER: the anonymous uploader cannot read enquiries or list the bucket.
create or replace function public.voice_recording_expected(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.enquiries e
       where e.doc #>> '{call,recording}' = p_name
         and e.doc ->> 'source' = 'Voice assistant (Anu)'
         and e.created_at > now() - interval '2 hours'
    )
    and not exists (
      select 1 from storage.objects o where o.bucket_id = 'voice-recordings' and o.name = p_name
    );
$$;
revoke execute on function public.voice_recording_expected(text) from public;
grant execute on function public.voice_recording_expected(text) to anon, authenticated;

drop policy if exists anon_upload_voice_recording on storage.objects;
create policy anon_upload_voice_recording on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'voice-recordings'
    and name ~ '^calls/[0-9]{4}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|mp4)$'
    and public.voice_recording_expected(name)
  );
