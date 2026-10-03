-- 0076: company access in RLS, customer matching and Anu (multi-company phase 1).
--
--   1. Every policy for signed-in people on enquiries, leads, customers,
--      quotations, invoices and payments (0007, 0022, 0069, 0073: whatever is
--      live when this runs) keeps its rule AND has_company_access(company_id),
--      in USING and in WITH CHECK. Done by ALTER POLICY over pg_policies, so a
--      policy is never retyped by hand; the block ends by refusing to finish if
--      any such policy is left without the company check.
--   2. The website's anonymous enquiry (from 0050) may only go to Ortex.
--   3. audit_log (from 0050): an entry of a company record is read only by
--      people who work in that company.
--   4. upsert_customer_from (from 0050) takes the company: a lead matches and
--      creates customers only within its own company, so one person may be a
--      customer of several companies as separate records. lead_to_customer
--      (from 0029) passes new.company_id.
--   5. anu_daily_update (from 0069) builds its sales and money lines per
--      company: one block per company, headed by its name, when it covers more
--      than one; exactly today's text when it covers one. The scheduled post
--      (anu_bot_tick -> anu_bot_run, unchanged) covers every active company;
--      anu_team_update (from 0069), on demand, only the asker's companies.
--
-- Not here: the telecaller planner is TypeScript (_shared/telecaller.ts) and
-- reads the tables with the service role; phase 2 limits it to company_id =
-- 'ortex'. Safe to run twice.

-- ---- 1. the six tables -----------------------------------------------------------------

do $$
declare
  p record;
  v_using text;
  v_check text;
  c constant text := 'public.has_company_access(company_id)';
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and tablename in ('enquiries', 'leads', 'customers', 'quotations', 'invoices', 'payments')
       and 'authenticated' = any (roles)
  loop
    continue when coalesce(p.qual, '') ~ 'has_company_access' or coalesce(p.with_check, '') ~ 'has_company_access';
    v_using := case when p.qual is not null then format(' using ((%s) and %s)', p.qual, c) else '' end;
    v_check := case when p.with_check is not null then format(' with check ((%s) and %s)', p.with_check, c) else '' end;
    execute format('alter policy %I on public.%I', p.policyname, p.tablename) || v_using || v_check;
  end loop;

  if exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename in ('enquiries', 'leads', 'customers', 'quotations', 'invoices', 'payments')
       and 'authenticated' = any (roles)
       and ((qual is not null and qual !~ 'has_company_access')
            or (with_check is not null and with_check !~ 'has_company_access'))
  ) then
    raise exception '0076: a policy on a company table has no company check';
  end if;
end $$;

-- ---- 2. the website's enquiry goes to Ortex (from 0050) --------------------------------

drop policy if exists anon_insert_enquiries on public.enquiries;
create policy anon_insert_enquiries on public.enquiries
  for insert to anon
  with check (
    company_id = 'ortex' and
    (doc->>'status' = 'new') and
    (doc->'starred' is null or doc->>'starred' = 'false') and
    (doc->>'owner' is null or doc->>'owner' = '') and
    (doc->>'quotationId' is null) and
    pg_column_size(doc) < 32768 and
    length(coalesce(doc->'customer'->>'name', '')) <= 200 and
    length(coalesce(doc->'customer'->>'email', '')) <= 254 and
    length(coalesce(doc->'customer'->>'phone', '')) <= 40 and
    length(coalesce(doc->>'message', '')) <= 8000
  );

-- ---- 3. the audit log (from 0050) ------------------------------------------------------

drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select to authenticated
  using (public.is_active_staff() and public.audit_can_read(table_name)
         and (company_id is null or public.has_company_access(company_id)));

-- ---- 4. customers per company (from 0050 and 0029) -------------------------------------

drop function if exists public.upsert_customer_from(jsonb, text);

create or replace function public.upsert_customer_from(c jsonb, origin text default '', p_company text default 'ortex')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_name    text := trim(coalesce(c->>'name', ''));
  v_company text := trim(coalesce(c->>'company', ''));
  v_email   text := lower(trim(coalesce(c->>'email', '')));
  v_phone   text := public.national_digits(c->>'phone');
  v_address text := trim(coalesce(c->>'address', c->>'city', ''));
  v_gstin   text := upper(trim(coalesce(c->>'gstin', '')));
  v_state   text := trim(coalesce(c->>'stateCode', ''));
  v_trusted boolean := auth.uid() is not null or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_co      text := coalesce(nullif(p_company, ''), 'ortex');
  m_id  uuid;
  m_doc jsonb;
  patch jsonb := '{}'::jsonb;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return null; end if;
  -- Filler Anu uses when a caller never gives a name. A copy of
  -- PLACEHOLDER_NAMES in Ortex.Mobile/src/domain/voice.ts: keep them in step.
  if lower(v_name) in ('customer','grahak','sir','madam','unknown','caller','test','testing',
                       'na','n/a','none','anonymous','user','client','aap','ji') then
    v_name := '';
  end if;
  -- A number shorter than a landline is a typo or a placeholder, not a key.
  if length(v_phone) < 8 then v_phone := ''; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := ''; end if;
  if v_name = '' and v_company = '' then return null; end if;
  if v_email = '' and v_phone = '' then return null; end if;

  perform pg_advisory_xact_lock(hashtext('ortex.upsert_customer_from'));

  if v_email <> '' then
    select id, doc into m_id, m_doc from public.customers
     where company_id = v_co and lower(trim(doc->>'email')) = v_email
     order by created_at limit 1;
  end if;
  if m_id is null and v_phone <> '' then
    select id, doc into m_id, m_doc from public.customers
     where company_id = v_co and public.national_digits(doc->>'phone') = v_phone
     order by created_at limit 1;
  end if;

  if m_id is not null then
    -- Fill blanks only. Tax and address details only from a signed-in source.
    if coalesce(trim(m_doc->>'name'), '')      = '' and v_name    <> '' then patch := patch || jsonb_build_object('name', v_name); end if;
    if coalesce(trim(m_doc->>'company'), '')   = '' and v_company <> '' then patch := patch || jsonb_build_object('company', v_company); end if;
    if coalesce(trim(m_doc->>'email'), '')     = '' and v_email   <> '' then patch := patch || jsonb_build_object('email', v_email); end if;
    if coalesce(trim(m_doc->>'phone'), '')     = '' and v_phone   <> '' then patch := patch || jsonb_build_object('phone', v_phone); end if;
    if v_trusted then
      if coalesce(trim(m_doc->>'address'), '')   = '' and v_address <> '' then patch := patch || jsonb_build_object('address', v_address); end if;
      if coalesce(trim(m_doc->>'gstin'), '')     = '' and v_gstin   <> '' then patch := patch || jsonb_build_object('gstin', v_gstin); end if;
      if coalesce(trim(m_doc->>'stateCode'), '') = '' and v_state   <> '' then patch := patch || jsonb_build_object('stateCode', v_state); end if;
    end if;
    if patch <> '{}'::jsonb then
      update public.customers set doc = doc || patch where id = m_id;
    end if;
    return m_id;
  end if;

  -- The shape newCustomer() gives both clients, plus where it came from.
  insert into public.customers (company_id, doc) values (v_co, jsonb_build_object(
    'name', v_name, 'company', v_company, 'email', v_email, 'phone', v_phone,
    'gstin', v_gstin, 'stateCode', v_state, 'address', v_address,
    'source', coalesce(nullif(trim(origin), ''), 'Lead')
  )) returning id into m_id;
  return m_id;
end $$;

-- Only the triggers below call it.
revoke all on function public.upsert_customer_from(jsonb, text, text) from public, anon, authenticated;

create or replace function public.lead_to_customer()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.doc->'customer') is not distinct from (old.doc->'customer')
     and new.company_id is not distinct from old.company_id then
    return null;
  end if;
  begin
    perform public.upsert_customer_from(new.doc->'customer', new.doc->>'source', new.company_id);
  exception when others then
    raise warning 'lead_to_customer(%, %) skipped: %', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end $$;

-- 0029's triggers fire on `update of doc`; a move to another company re-matches too.
drop trigger if exists enquiries_to_customer on public.enquiries;
create trigger enquiries_to_customer
  after insert or update of doc, company_id on public.enquiries
  for each row execute function public.lead_to_customer();

drop trigger if exists leads_to_customer on public.leads;
create trigger leads_to_customer
  after insert or update of doc, company_id on public.leads
  for each row execute function public.lead_to_customer();

-- ---- 5. Anu's update, per company (from 0069) ------------------------------------------

drop function if exists public.anu_daily_update(text, date, boolean, boolean, boolean, boolean, boolean);

-- p_companies: null = every active company (the scheduled team post).
create or replace function public.anu_daily_update(p_team text, p_day date,
  p_invoices boolean default true, p_payments boolean default true,
  p_enquiries boolean default true, p_quotations boolean default true, p_approvals boolean default true,
  p_companies text[] default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_tz text := public.anu_tz();
  v_yday date := p_day - 1;
  v_now timestamptz := now();
  v_lines text[] := '{}';
  v_block text[];
  v_list text[];
  v_co record;
  v_ncos int;
  n1 int; n2 int; n3 int;
  m1 numeric; m2 numeric;
  v_voice constant text := 'Voice assistant (Anu)';
  v_holiday record;
begin
  if public.attendance_is_off_day(p_day) then return null; end if;
  v_lines := v_lines || ('Good morning, ' || (select title from public.anu_teams() where key = p_team)
    || '. Your update for ' || to_char(p_day, 'FMDay, FMDD FMMonth') || '.');

  select count(*) into v_ncos from public.companies
   where case when p_companies is null then active else id = any (p_companies) end;

  for v_co in
    select id, name from public.companies
     where case when p_companies is null then active else id = any (p_companies) end
     order by sort, id
  loop
    v_block := '{}';

    if p_team in ('sales', 'management') and p_enquiries then
      select count(*) filter (where coalesce(doc ->> 'source', '') <> v_voice and public.anu_day(created_at) = v_yday),
             count(distinct coalesce(doc #>> '{call,id}', id::text)) filter (where doc ->> 'source' = v_voice and public.anu_day(created_at) = v_yday),
             count(*) filter (where coalesce(doc ->> 'source', '') <> v_voice and coalesce(doc ->> 'status', 'new') = 'new')
        into n1, n2, n3
        from public.enquiries
       where company_id = v_co.id;
      v_block := v_block || ('Leads yesterday: ' || n1 || ' website ' || case when n1 = 1 then 'enquiry' else 'enquiries' end
        || ', ' || n2 || ' Anu ' || case when n2 = 1 then 'call' else 'calls' end || '.');
      if n3 > 0 then
        select count(*) into n1 from public.enquiries
         where company_id = v_co.id
           and coalesce(doc ->> 'source', '') <> v_voice and coalesce(doc ->> 'status', 'new') = 'new' and created_at < v_now - interval '2 days';
        v_block := v_block || ('Still new, not contacted: ' || n3 || case when n1 > 0 then ' (' || n1 || ' waiting over 2 days)' else '' end || '.');
      end if;
    end if;

    if p_team in ('sales', 'management') and p_quotations then
      select count(*), coalesce(sum(public.safe_num(doc #>> '{totals,grandTotal}')), 0) into n1, m1
        from public.quotations
       where company_id = v_co.id
         and coalesce(doc ->> 'status', 'draft') <> 'draft' and public.anu_day(coalesce(public.anu_ts(doc -> 'issueDate'), created_at)) = v_yday;
      select count(*), coalesce(sum(public.safe_num(doc #>> '{totals,grandTotal}')), 0) into n2, m2
        from public.quotations
       where company_id = v_co.id
         and doc ->> 'status' in ('accepted', 'invoiced') and public.anu_day(updated_at) = v_yday;
      v_block := v_block || ('Quotations yesterday: ' || n1 || ' sent (' || public.anu_money(m1) || '), '
        || n2 || ' won (' || public.anu_money(m2) || ').');

      select array_agg(line order by until) into v_list from (
        select coalesce(doc ->> 'number', 'Quotation') || ', ' || public.anu_party(doc -> 'customer') || ', '
               || public.anu_money(public.safe_num(doc #>> '{totals,grandTotal}')) || ', valid till '
               || to_char(public.anu_ts(doc -> 'validUntil') at time zone v_tz, 'FMDD FMMon') as line,
               public.anu_ts(doc -> 'validUntil') as until
          from public.quotations
         where company_id = v_co.id
           and doc ->> 'status' = 'sent'
           and public.anu_ts(doc -> 'validUntil') between v_now and v_now + interval '3 days'
         order by 2 limit 5) x;
      if v_list is not null then
        v_block := v_block || ('Expiring in 3 days, follow up:' || E'\n- ' || array_to_string(v_list, E'\n- '));
      end if;

      select count(*), coalesce(sum(public.safe_num(doc #>> '{totals,grandTotal}')), 0) into n1, m1
        from public.quotations where company_id = v_co.id and doc ->> 'status' = 'sent';
      v_block := v_block || ('Open pipeline: ' || n1 || ' sent ' || case when n1 = 1 then 'quotation' else 'quotations' end
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
         where i.company_id = v_co.id
           and coalesce(i.doc ->> 'status', '') not in ('paid', 'cancelled', 'draft')
      )
      select count(*) filter (where balance > 0.5 and due < v_now),
             coalesce(sum(balance) filter (where balance > 0.5 and due < v_now), 0),
             count(*) filter (where balance > 0.5 and due between v_now and v_now + interval '3 days'),
             coalesce(sum(balance) filter (where balance > 0.5 and due between v_now and v_now + interval '3 days'), 0)
        into n1, m1, n2, m2
        from inv;
      v_block := v_block || ('Overdue invoices: ' || n1 || ' (' || public.anu_money(m1) || ').'
        || case when n2 > 0 then ' Due in the next 3 days: ' || n2 || ' (' || public.anu_money(m2) || ').' else '' end);

      select array_agg(line) into v_list from (
        select coalesce(i.doc ->> 'number', 'Invoice') || ', ' || public.anu_party(i.doc -> 'customer') || ', '
               || public.anu_money(bal) || ', ' || (p_day - public.anu_day(public.anu_ts(i.doc -> 'dueDate'))) || ' days late' as line
          from (
            select i.*, coalesce(public.safe_num(i.doc #>> '{totals,grandTotal}'), 0)
                   - coalesce((select sum(public.safe_num(p.doc ->> 'amount')) from public.payments p
                                where p.doc ->> 'invoiceId' = i.id::text and p.doc ->> 'type' = 'inflow'), 0) as bal
              from public.invoices i
             where i.company_id = v_co.id
               and coalesce(i.doc ->> 'status', '') not in ('paid', 'cancelled', 'draft')
               and public.anu_ts(i.doc -> 'dueDate') < v_now
          ) i
         where bal > 0.5
         order by bal desc limit 3) x;
      if v_list is not null then
        v_block := v_block || ('Biggest overdue:' || E'\n- ' || array_to_string(v_list, E'\n- '));
      end if;
    end if;

    if p_team in ('accounts', 'management') and p_payments then
      select count(*), coalesce(sum(public.safe_num(doc ->> 'amount')), 0) into n1, m1
        from public.payments
       where company_id = v_co.id
         and doc ->> 'type' = 'inflow' and public.anu_day(coalesce(public.anu_ts(doc -> 'date'), created_at)) = v_yday;
      v_block := v_block || ('Payments received yesterday: ' || n1 || ' (' || public.anu_money(m1) || ').');
    end if;

    if cardinality(v_block) > 0 then
      if v_ncos > 1 then
        v_lines := v_lines || (v_co.name || E':\n' || array_to_string(v_block, E'\n'));
      else
        v_lines := v_lines || v_block;
      end if;
    end if;
  end loop;

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
revoke execute on function public.anu_daily_update(text, date, boolean, boolean, boolean, boolean, boolean, text[]) from public, anon, authenticated;

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
                    public.has_module_access('attendance-team'),
                    -- 0076: only the companies the asker works in.
                    coalesce((select array_agg(id order by sort, id) from public.companies
                               where active and public.has_company_access(id)), '{}')),
                  'Today is a holiday or weekly off, so there is no update.');
end;
$$;
