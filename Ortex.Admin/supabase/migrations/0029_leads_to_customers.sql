-- 0029_leads_to_customers.sql
--
-- Every lead saves its contact into Customers, automatically.
--
-- Until now a customer reached the `customers` table only when somebody made a
-- quotation or an invoice for them (upsertCustomer in the console's domain.js
-- and the phone's domain/quotations.ts) or typed them in by hand. A website
-- enquiry, a quote-calculator request or a call Anu took stayed in `enquiries`,
-- so a lead that was rung but never quoted never appeared under Customers.
--
-- The rule now lives in the database, so it holds whichever client wrote the
-- lead: the website (an anonymous insert), Anu, the console, the phone, an
-- IndiaMART import. Triggers on `enquiries` and `leads` call
-- upsert_customer_from() in the same transaction, on insert and whenever the
-- lead's `customer` block changes (Anu adds a name or an email on a later
-- capture of the same call).
--
-- MATCHING IS THE CLIENTS' RULE (sameCustomer): email first, then the phone as
-- national digits, so "+91 98765 43210", "09876543210" and "9876543210" are one
-- person. Never on name. A match only FILLS BLANKS, it never overwrites what a
-- person has curated on the customer. A lead with no usable phone or email is
-- skipped: nothing could ever match it again, so saving it would create a
-- duplicate on every capture. A lead with neither a name nor a company is
-- skipped too, the same floor the clients' upsertCustomer has.
--
-- Concurrency: Anu saves several rows per call a second or two apart. Two
-- transactions that both find "no match" would both insert, so the upsert takes
-- one transaction-scoped advisory lock and runs one at a time. Lead volume is a
-- few hundred a day; the lock is held for a single indexed lookup.
--
-- Failure: the customer is a copy of what the lead already holds. An error here
-- must never lose the lead, so the trigger swallows it (as 0028's does) and
-- raises a warning instead.
--
-- Attribution: the insert goes through 0023's stamp_actor, so a customer made
-- from a website lead reads "Automation" in its activity and one made from a
-- lead a colleague typed in is credited to them.

-- ---- helpers ------------------------------------------------------------------

-- The SQL twin of nationalDigits() (Admin lib/validateCustomer.js,
-- Mobile domain/quotations.ts): digits only, +91 or a trunk 0 taken off.
create or replace function public.national_digits(value text) returns text
language sql immutable as $$
  select case
    when length(d) = 12 and left(d, 2) = '91' then substr(d, 3)
    when length(d) = 11 and left(d, 1) = '0'  then substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(value, ''), '\D', '', 'g') as d) s
$$;

create index if not exists customers_email_idx
  on public.customers (lower(trim(doc->>'email')));
create index if not exists customers_phone_idx
  on public.customers (public.national_digits(doc->>'phone'));

-- ---- the upsert -----------------------------------------------------------------

create or replace function public.upsert_customer_from(c jsonb, origin text default '')
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
     where lower(trim(doc->>'email')) = v_email
     order by created_at limit 1;
  end if;
  if m_id is null and v_phone <> '' then
    select id, doc into m_id, m_doc from public.customers
     where public.national_digits(doc->>'phone') = v_phone
     order by created_at limit 1;
  end if;

  if m_id is not null then
    -- Fill blanks only.
    if coalesce(trim(m_doc->>'name'), '')      = '' and v_name    <> '' then patch := patch || jsonb_build_object('name', v_name); end if;
    if coalesce(trim(m_doc->>'company'), '')   = '' and v_company <> '' then patch := patch || jsonb_build_object('company', v_company); end if;
    if coalesce(trim(m_doc->>'email'), '')     = '' and v_email   <> '' then patch := patch || jsonb_build_object('email', v_email); end if;
    if coalesce(trim(m_doc->>'phone'), '')     = '' and v_phone   <> '' then patch := patch || jsonb_build_object('phone', v_phone); end if;
    if coalesce(trim(m_doc->>'address'), '')   = '' and v_address <> '' then patch := patch || jsonb_build_object('address', v_address); end if;
    if coalesce(trim(m_doc->>'gstin'), '')     = '' and v_gstin   <> '' then patch := patch || jsonb_build_object('gstin', v_gstin); end if;
    if coalesce(trim(m_doc->>'stateCode'), '') = '' and v_state   <> '' then patch := patch || jsonb_build_object('stateCode', v_state); end if;
    if patch <> '{}'::jsonb then
      update public.customers set doc = doc || patch where id = m_id;
    end if;
    return m_id;
  end if;

  -- The shape newCustomer() gives both clients, plus where it came from.
  insert into public.customers (doc) values (jsonb_build_object(
    'name', v_name, 'company', v_company, 'email', v_email, 'phone', v_phone,
    'gstin', v_gstin, 'stateCode', v_state, 'address', v_address,
    'source', coalesce(nullif(trim(origin), ''), 'Lead')
  )) returning id into m_id;
  return m_id;
end $$;

-- Only the triggers below and the backfill call it.
revoke all on function public.upsert_customer_from(jsonb, text) from public, anon, authenticated;

-- ---- the triggers ---------------------------------------------------------------

create or replace function public.lead_to_customer()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.doc->'customer') is not distinct from (old.doc->'customer') then
    return null;
  end if;
  begin
    perform public.upsert_customer_from(new.doc->'customer', new.doc->>'source');
  exception when others then
    raise warning 'lead_to_customer(%, %) skipped: %', tg_table_name, new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists enquiries_to_customer on public.enquiries;
create trigger enquiries_to_customer
  after insert or update of doc on public.enquiries
  for each row execute function public.lead_to_customer();

drop trigger if exists leads_to_customer on public.leads;
create trigger leads_to_customer
  after insert or update of doc on public.leads
  for each row execute function public.lead_to_customer();

-- ---- realtime ---------------------------------------------------------------------
-- The phone's Customers tab follows `customers` over realtime; make sure a
-- customer made by this trigger is heard there without a refresh.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customers') then
    execute 'alter publication supabase_realtime add table public.customers';
  end if;
end $$;

-- ---- backfill ---------------------------------------------------------------------
-- Every lead already on file, oldest first, so a customer's `source` is the first
-- way they reached Ortex. Idempotent: a second run only matches and fills blanks.
do $$
declare r record;
begin
  for r in
    select doc, created_at from public.enquiries
    union all
    select doc, created_at from public.leads
    order by created_at
  loop
    begin
      perform public.upsert_customer_from(r.doc->'customer', r.doc->>'source');
    exception when others then
      raise warning 'backfill skipped a lead: %', sqlerrm;
    end;
  end loop;
end $$;
