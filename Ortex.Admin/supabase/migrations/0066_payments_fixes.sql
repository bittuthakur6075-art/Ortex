-- 0066: payments fixes from the 2026-10-03 audit.
--
-- `payments` is a doc table ({ number, type 'inflow' | 'payout', amount, method,
-- date, reference, note, invoiceId, invoiceNumber, party, customer, tally? })
-- with one policy (0007, has_module_access('payments')) and, until now, no
-- validation at all. Plain `create or replace`, `if not exists` and guarded DO
-- blocks: safe to run twice. Functions taken over from an older migration are
-- redefined from their LATEST version, named in their section.
--
-- "The service" below means the service role (the Tally connector, edge
-- functions, cron) or a migration / SQL Editor session: auth.role() =
-- 'service_role', or current_user postgres, service_role or supabase_admin.
-- A SECURITY DEFINER function owned by postgres therefore also counts as the
-- service while it runs; the only ones that write payments or invoices are the
-- two this migration adds (the paid-status sync and tally_mark).
--
--   0. Helpers. safe_num(text) casts to numeric and answers NULL for anything
--      that is not a plain number, or is 1e15 or more either way, instead of
--      raising. is_service_caller() is the test described above.
--   1. Invoice paid status is computed in the database, not in the browser.
--      a. invoice_paid_doc(id, doc) works out amountPaid (the sum of the inflow
--         payments linked to the invoice, rounded to 2 places) and status:
--         draft and cancelled stay; otherwise paid when the grand total is
--         above 0 and at most 0.50 is left, partial when anything is paid, back
--         to sent when nothing is paid but it said paid or partial, else the
--         stored status stays (sent, overdue). paidAt is the latest linked
--         inflow's date while the invoice is paid, and is removed otherwise.
--      b. An AFTER trigger on payments (insert, update, delete) recomputes the
--         invoice it links to, and the one it linked to before when the link
--         moved, with `doc = doc || {...}` (minus paidAt), never a whole-doc
--         rewrite. It runs as SECURITY DEFINER, so a person with the payments
--         module but not invoices still updates the invoice. An invoice that
--         does not exist is skipped. It touches only invoices, so no payments
--         trigger fires again.
--      c. A BEFORE INSERT / UPDATE trigger on invoices applies the same
--         numbers to whatever a client saves. Both clients save the whole doc
--         they read, so an invoice edited on a screen opened before a payment
--         landed would otherwise put the old amountPaid and status back. It
--         also re-derives the status when an edit changes the grand total.
--      An index on payments (doc->>'invoiceId') keeps both lookups cheap.
--   2. Validation.
--      a. CHECK payments_doc_valid, added NOT VALID: every new or updated row
--         needs a numeric amount above 0 and below 1e10 and a type of inflow or
--         payout. Existing rows are not checked, and a NOTICE says how many
--         would fail. Such a row cannot be UPDATED (not even its Tally stamp)
--         until its amount and type are corrected.
--      b. BEFORE INSERT / UPDATE trigger payments_validate (SECURITY DEFINER,
--         so it sees invoices the caller cannot): a non-blank invoiceId must
--         be an existing invoice, and a payout carries no invoiceId. On an
--         update it checks only when invoiceId or type changes, so an old row
--         pointing at a long-gone invoice can still be stamped by Tally. It
--         also says what is wrong with the amount or type in words before the
--         CHECK does.
--   3. Payment numbers are unique: a partial unique index on doc->>'number'
--      where it is not blank. If the table already holds duplicates the index
--      is NOT created and a NOTICE names how many; remove the duplicates and
--      run this section again. There is deliberately no unique index on the
--      reference (UTR): one transfer can pay two invoices, so the clients ask.
--   4. doc.tally belongs to the Tally connector. For anyone but the service:
--      a. a new payment loses any tally it was sent with;
--      b. a new invoice keeps tally only in the exact shape the console's Tally
--         XML import writes (TallyInvoiceImport.jsx: { status: 'synced',
--         syncedAt, voucherRef }, nothing else, status exactly 'synced'), and
--         loses any other tally (including the `tally: null` createInvoice
--         sends for an ordinary invoice);
--      c. an update always keeps the stored tally, also when the client sends
--         a whole doc without one. Overwriting an existing invoice from a
--         Tally XML import therefore keeps that invoice's old tally stamp.
--   5. A payment already in Tally is frozen: when its stored tally.status is
--      'synced', an update that changes amount, type, date, invoiceId or party,
--      or a delete, is refused for everyone but the Super Admin and the
--      service.
--   6. tally_mark(p_table, p_id, p_tally): the connector's write-back, as
--      `doc = doc || {tally}` on one row, so it no longer rewrites a whole doc
--      it read minutes ago. Tables: invoices, payments, customers, products
--      (every collection Ortex.Tally.Connector syncs). Returns whether the row
--      was found. Service role only.
--   7. payments.created_at is the server's clock: now() on insert for anyone
--      but the service, and unchanged on update. The shared stamp_actor (0023)
--      is untouched, because the enquiry import relies on a client created_at.
--   8. next_sequence (from 0007) checks the series against the module that
--      uses it: payment needs payments, invoice needs invoices, quotation needs
--      quotations (the only three series either client or any edge function
--      asks for). Any other series is refused. The service role may take any
--      known series (before, it was refused outright for having no profile);
--      the Super Admin passes through has_module_access. Same signature, same
--      grants.
--   9. Realtime: payments, invoices and the other doc tables both clients
--      listen to (products, categories, customers, enquiries, quotations,
--      work) are added to supabase_realtime when missing. audit_log, which the
--      phone also asks for, stays out: it is the busiest table and a person's
--      own changes already reach the screen that made them.
--  10. anu_daily_update (from 0065).
--      a. Every numeric cast goes through safe_num, so one malformed amount or
--         grand total no longer kills the whole morning update.
--      b. Two new parameters p_invoices and p_payments (both default true)
--         decide the money lines: the overdue and due-soon invoices need
--         p_invoices, payments received yesterday needs p_payments.
--         anu_team_update (from 0046), which a person calls from their Anu
--         thread, passes has_module_access('invoices') and
--         has_module_access('payments'), so nobody reads money they cannot
--         open. The scheduled post to a team channel (anu_bot_tick, and an
--         admin's Send now through anu_bot_run) passes nothing and keeps the
--         current behaviour: the accounts and management channels get the
--         money lines, whoever is in them.
--  11. An invoice with payments cannot be deleted: "This invoice has payments.
--      Cancel it instead, or delete its payments first." (everyone, the
--      service included).
--  12. anon loses SELECT on payments, invoices, customers and quotations.
--
-- Second pass (security audit and code review of this file, 2026-10-03). Where
-- it disagrees with the list above, this is what the file now does.
--
--   a. The service is current_user postgres, service_role or supabase_admin,
--      nothing else. auth.role() is no longer trusted, because it reads the JWT
--      claim, a setting a session can change with set_config.
--   b. A new invoice keeps a tally in the Tally import's shape only when an
--      admin (is_admin, the Super Admin included) saves it; anyone else loses
--      it, so a person with only the invoices module cannot hide a new invoice
--      from the connector. On an update, an invoice with no stamp yet (or a
--      null one) takes the import's shape from an admin, so overwriting a
--      console-made invoice from Tally XML keeps its stamp and the connector
--      does not post it a second time. An invoice that has a stamp keeps it.
--   c. payments_validate runs on every insert and every update. It stores
--      invoiceId trimmed and in lower case. On an inflow linked to an existing
--      invoice it overwrites invoiceNumber and customer with that invoice's
--      number and customer, so Tally's Agst Ref and party are the invoice the
--      database settles. A payment with no invoice loses invoiceNumber (and a
--      blank invoiceId becomes null). The payout and missing-invoice checks
--      still run only on an insert or when invoiceId or type changes, so a row
--      older than 0066 whose invoice is gone can still be updated and stamped.
--   d. doc.account belongs to the connector like doc.tally: a person's new
--      payment loses it, and an update keeps the stored one.
--   e. Neither a payment's nor an invoice's id can be changed by an update,
--      by anyone: "A payment's id cannot be changed." / "An invoice's id cannot
--      be changed."
--   f. A payment in Tally is also frozen on customer, number, reference and
--      invoiceNumber (as well as amount, type, date, invoiceId and party).
--   g. anon has no SELECT on payments, invoices, customers or quotations:
--      Realtime sends DELETE events without RLS, so anon could see the ids of
--      deleted rows. enquiries is untouched (the website inserts as anon; the
--      customer it makes goes through the SECURITY DEFINER upsert_customer_from).
--   h. safe_num and is_service_caller can no longer be called by public or
--      anon. authenticated keeps is_service_caller, which the invoker triggers
--      call as the signed-in person.
--   i. doc_merge(table, id, patch), service role only: `doc = doc || patch` on
--      one row of telecaller_jobs, telecaller_calls, leads, enquiries or
--      invoices (the tables the telecaller patches), returning { id, doc,
--      created_at } or NULL when the row is missing. _shared/telecaller.ts
--      patchDoc calls it, so a Tally stamp written meanwhile is not lost.
--   j. tally_mark on a payment that fails payments_doc_valid (a text,
--      negative or missing amount, or no type) returns false with a NOTICE
--      instead of raising. The rows the 0066 NOTICE counts must be corrected by
--      the Super Admin: until then the connector cannot mark them in Tally.

-- ---- 0. helpers -------------------------------------------------------------------------

create or replace function public.safe_num(p text)
returns numeric language plpgsql immutable set search_path = public as $$
declare v numeric;
begin
  if p is null or p !~ '^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d{1,3})?\s*$' then return null; end if;
  v := p::numeric;
  if abs(v) >= 1e15 then return null; end if;
  return v;
exception when others then
  return null;
end;
$$;

-- current_user only: the JWT role claim is a setting a session can change.
create or replace function public.is_service_caller()
returns boolean language sql stable set search_path = public as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

-- The invoker triggers below call is_service_caller() as the signed-in person.
revoke execute on function public.safe_num(text) from public, anon;
revoke execute on function public.is_service_caller() from public, anon;
grant execute on function public.safe_num(text) to authenticated, service_role;
grant execute on function public.is_service_caller() to authenticated, service_role;

-- ---- 1. invoice paid status ---------------------------------------------------------------

create index if not exists payments_invoice_idx on public.payments ((doc ->> 'invoiceId'));

create or replace function public.invoice_paid_doc(p_id uuid, p_doc jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_paid numeric;
  v_last text;
  v_grand numeric := coalesce(public.safe_num(p_doc #>> '{totals,grandTotal}'), 0);
  v_status text := coalesce(p_doc ->> 'status', '');
begin
  select round(coalesce(sum(coalesce(public.safe_num(doc ->> 'amount'), 0)), 0), 2),
         max(coalesce(nullif(doc ->> 'date', ''), to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
    into v_paid, v_last
    from public.payments
   where doc ->> 'invoiceId' = p_id::text and doc ->> 'type' = 'inflow';

  if v_status not in ('draft', 'cancelled') then
    v_status := case
      when v_grand > 0 and v_grand - v_paid <= 0.5 then 'paid'
      when v_paid > 0 then 'partial'
      when v_status in ('paid', 'partial') then 'sent'
      else v_status
    end;
  end if;

  p_doc := p_doc || jsonb_build_object('amountPaid', v_paid);
  if v_status <> '' then p_doc := p_doc || jsonb_build_object('status', v_status); end if;
  return case when v_status = 'paid' then p_doc || jsonb_build_object('paidAt', v_last) else p_doc - 'paidAt' end;
end;
$$;
revoke execute on function public.invoice_paid_doc(uuid, jsonb) from public, anon, authenticated;

create or replace function public.payments_sync_invoice()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  select array_agg(distinct x::uuid) into v_ids
    from unnest(array[
      case when tg_op <> 'INSERT' then old.doc ->> 'invoiceId' end,
      case when tg_op <> 'DELETE' then new.doc ->> 'invoiceId' end
    ]) x
   where x ~ v_re;
  if v_ids is not null then
    update public.invoices i
       set doc = public.invoice_paid_doc(i.id, i.doc)
     where i.id = any (v_ids)
       and i.doc is distinct from public.invoice_paid_doc(i.id, i.doc);
  end if;
  return null;
end;
$$;

drop trigger if exists payments_sync_invoice on public.payments;
create trigger payments_sync_invoice
  after insert or update or delete on public.payments
  for each row execute function public.payments_sync_invoice();

create or replace function public.invoices_paid_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.doc := public.invoice_paid_doc(new.id, new.doc);
  return new;
end;
$$;

drop trigger if exists invoices_paid_fields on public.invoices;
create trigger invoices_paid_fields
  before insert or update on public.invoices
  for each row execute function public.invoices_paid_fields();

-- ---- 2. validation ----------------------------------------------------------------------

do $$
declare n int;
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_doc_valid' and conrelid = 'public.payments'::regclass) then
    -- CASE so a string amount is never cast; coalesce so a missing type FAILS
    -- the check (a CHECK that evaluates to NULL passes).
    alter table public.payments add constraint payments_doc_valid check (
      case when jsonb_typeof(doc -> 'amount') = 'number'
           then (doc ->> 'amount')::numeric > 0 and (doc ->> 'amount')::numeric < 1e10
           else false end
      and coalesce(doc ->> 'type', '') in ('inflow', 'payout')
    ) not valid;
  end if;
  select count(*) into n from public.payments
   where not (case when jsonb_typeof(doc -> 'amount') = 'number'
                   then (doc ->> 'amount')::numeric > 0 and (doc ->> 'amount')::numeric < 1e10
                   else false end
              and coalesce(doc ->> 'type', '') in ('inflow', 'payout'));
  raise notice '0066: % existing payment row(s) would fail payments_doc_valid (amount or type). They stay, but cannot be updated until corrected.', n;
end $$;

create or replace function public.payments_validate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_inv text := lower(nullif(btrim(coalesce(new.doc ->> 'invoiceId', '')), ''));
  v_check boolean := tg_op = 'INSERT';
  v_doc jsonb;
begin
  -- Parenthesised: PL/pgSQL would read the CASE's own THEN as the IF's.
  if not (case when jsonb_typeof(new.doc -> 'amount') = 'number'
              then (new.doc ->> 'amount')::numeric > 0 and (new.doc ->> 'amount')::numeric < 1e10
              else false end) then
    raise exception 'The payment amount must be a number above 0 and below 10,000,000,000.';
  end if;
  if coalesce(new.doc ->> 'type', '') not in ('inflow', 'payout') then
    raise exception 'A payment must be an inflow or a payout.';
  end if;
  if tg_op = 'UPDATE' then
    v_check := v_inv is distinct from lower(nullif(btrim(coalesce(old.doc ->> 'invoiceId', '')), ''))
            or (old.doc -> 'type') is distinct from (new.doc -> 'type');
  end if;
  if v_inv is null then
    new.doc := case when new.doc ? 'invoiceId' then new.doc || '{"invoiceId": null}' else new.doc end - 'invoiceNumber';
    return new;
  end if;
  if v_check and new.doc ->> 'type' = 'payout' then
    raise exception 'A payout cannot be linked to an invoice.';
  end if;
  if v_inv ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select doc into v_doc from public.invoices where id = v_inv::uuid;
  end if;
  if v_doc is null then
    if v_check then
      raise exception 'This payment points to an invoice that does not exist.';
    end if;
    return new; -- a row older than 0066 whose invoice is gone: left as it is
  end if;
  new.doc := new.doc || jsonb_build_object('invoiceId', v_inv);
  if new.doc ->> 'type' = 'inflow' then
    -- Tally's Agst Ref and party must be the invoice this payment settles.
    new.doc := new.doc || jsonb_build_object('invoiceNumber', v_doc -> 'number', 'customer', v_doc -> 'customer');
  end if;
  return new;
end;
$$;

drop trigger if exists payments_validate on public.payments;
create trigger payments_validate
  before insert or update on public.payments
  for each row execute function public.payments_validate();

-- ---- 3. unique payment number -------------------------------------------------------------

do $$
declare n int;
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_number_key') then
    return;
  end if;
  select count(*) into n from (
    select doc ->> 'number' from public.payments
     where btrim(coalesce(doc ->> 'number', '')) <> ''
     group by 1 having count(*) > 1) d;
  if n > 0 then
    raise notice '0066: payments_number_key NOT created: % payment number(s) are used more than once. Fix them and run section 3 again.', n;
  else
    create unique index payments_number_key on public.payments ((doc ->> 'number'))
      where btrim(coalesce(doc ->> 'number', '')) <> '';
  end if;
end $$;

-- ---- 4, 5, 7. the payments guard (tally, frozen once synced, created_at) ------------------
-- SECURITY INVOKER on purpose: is_service_caller() reads current_user.

create or replace function public.payments_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_service boolean := public.is_service_caller();
  k text;
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'A payment''s id cannot be changed.';
  end if;
  if tg_op <> 'INSERT'
     and old.doc #>> '{tally,status}' = 'synced'
     and not v_service and not public.is_super_admin()
     and (tg_op = 'DELETE'
          or exists (select 1 from unnest(array['amount', 'type', 'date', 'invoiceId', 'party',
                                                'customer', 'number', 'reference', 'invoiceNumber']) f
                      where (old.doc -> f) is distinct from (new.doc -> f))) then
    raise exception 'This payment is already in Tally. Only the Super Admin can change or delete it, and it must be changed in Tally too.';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  -- tally and account (the bank ledger) are the connector's keys.
  if not v_service then
    if tg_op = 'INSERT' then
      new.doc := new.doc - 'tally' - 'account';
      new.created_at := now();
    else
      foreach k in array array['tally', 'account'] loop
        new.doc := case when old.doc ? k then new.doc || jsonb_build_object(k, old.doc -> k) else new.doc - k end;
      end loop;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard on public.payments;
create trigger payments_guard
  before insert or update or delete on public.payments
  for each row execute function public.payments_guard();

create or replace function public.invoices_tally_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  t jsonb := new.doc -> 'tally';
  v_import boolean;
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'An invoice''s id cannot be changed.';
  end if;
  if public.is_service_caller() then return new; end if;
  -- The console's Tally XML import, by an admin: exactly { status 'synced', syncedAt, voucherRef }.
  v_import := case when jsonb_typeof(t) = 'object'
                   then t ->> 'status' = 'synced'
                        and not exists (select 1 from jsonb_object_keys(t) k where k not in ('status', 'syncedAt', 'voucherRef'))
                   else false end
              and public.is_admin();
  if tg_op = 'UPDATE' and coalesce(jsonb_typeof(old.doc -> 'tally'), 'null') <> 'null' then
    new.doc := new.doc || jsonb_build_object('tally', old.doc -> 'tally');
  elsif not v_import then
    new.doc := new.doc - 'tally';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_tally_guard on public.invoices;
create trigger invoices_tally_guard
  before insert or update on public.invoices
  for each row execute function public.invoices_tally_guard();

-- ---- 6. tally_mark ----------------------------------------------------------------------

create or replace function public.tally_mark(p_table text, p_id uuid, p_tally jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_table is null or p_table not in ('invoices', 'payments', 'customers', 'products') then
    raise exception 'tally_mark: unknown table %', p_table;
  end if;
  -- A payment older than 0066 that fails payments_doc_valid cannot be updated at
  -- all, so it is not stamped: false, and a NOTICE, never an error.
  if p_table = 'payments' and exists (
       select 1 from public.payments where id = p_id
          and not (case when jsonb_typeof(doc -> 'amount') = 'number'
                        then (doc ->> 'amount')::numeric > 0 and (doc ->> 'amount')::numeric < 1e10
                        else false end
                   and coalesce(doc ->> 'type', '') in ('inflow', 'payout'))) then
    raise notice 'tally_mark: payment % has an amount or type that fails payments_doc_valid. The Super Admin must correct it before it can be stamped.', p_id;
    return false;
  end if;
  execute format('update public.%I set doc = doc || jsonb_build_object(''tally'', $1) where id = $2', p_table)
    using p_tally, p_id;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function public.tally_mark(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.tally_mark(text, uuid, jsonb) to service_role;

-- doc_merge: the telecaller's patchDoc (_shared/telecaller.ts), merged server-side.
-- SECURITY INVOKER: it runs as the service role, the only role that may call it.
create or replace function public.doc_merge(p_table text, p_id uuid, p_patch jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare r jsonb;
begin
  if p_table is null or p_table not in ('telecaller_jobs', 'telecaller_calls', 'leads', 'enquiries', 'invoices') then
    raise exception 'doc_merge: unknown table %', p_table;
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' then
    raise exception 'doc_merge: the patch must be an object';
  end if;
  execute format('update public.%I set doc = doc || $1 where id = $2
                  returning jsonb_build_object(''id'', id, ''doc'', doc, ''created_at'', created_at)', p_table)
    into r using p_patch, p_id;
  return r;
end;
$$;
revoke execute on function public.doc_merge(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.doc_merge(text, uuid, jsonb) to service_role;

-- ---- 8. next_sequence (from 0007) ---------------------------------------------------------

create or replace function public.next_sequence(p_series text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v int;
  v_module text := case p_series
    when 'payment' then 'payments'
    when 'invoice' then 'invoices'
    when 'quotation' then 'quotations'
  end;
begin
  if v_module is null then
    raise exception 'Unknown number series "%".', p_series;
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    if not public.is_active_staff() then
      raise exception 'Unauthorized: Active session required';
    end if;
    if not public.has_module_access(v_module) then
      raise exception 'You cannot take a new % number without the % module.', p_series, v_module;
    end if;
  end if;

  insert into public.sequences (series, value) values (p_series, 1)
    on conflict (series) do nothing;
  update public.sequences set value = value + 1
    where series = p_series
    returning value - 1 into v;
  return v;
end $$;

-- ---- 9. realtime ------------------------------------------------------------------------

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then return; end if;
  foreach t in array array['payments', 'invoices', 'products', 'categories', 'customers', 'enquiries', 'quotations', 'work'] loop
    if to_regclass('public.' || t) is not null and not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---- 10. anu_daily_update (from 0065) and anu_team_update (from 0046) ---------------------

drop function if exists public.anu_daily_update(text, date);

create or replace function public.anu_daily_update(p_team text, p_day date,
  p_invoices boolean default true, p_payments boolean default true)
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

  if p_team in ('accounts', 'management') then
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
revoke execute on function public.anu_daily_update(text, date, boolean, boolean) from public, anon, authenticated;

create or replace function public.anu_team_update(p_team text default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_team text := coalesce(p_team, case when public.is_admin() then 'management' else public.anu_team_of(auth.uid()) end);
begin
  if v_team is null or not public.is_active_staff() or not (public.is_admin() or public.anu_team_of(auth.uid()) = v_team) then
    raise exception 'not_allowed';
  end if;
  return coalesce(public.anu_daily_update(v_team, public.anu_day(now()),
                    public.has_module_access('invoices'), public.has_module_access('payments')),
                  'Today is a holiday or weekly off, so there is no update.');
end;
$$;

-- ---- 11. an invoice with payments is not deleted -------------------------------------------

create or replace function public.invoices_delete_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.payments where doc ->> 'invoiceId' = old.id::text) then
    raise exception 'This invoice has payments. Cancel it instead, or delete its payments first.';
  end if;
  return old;
end;
$$;

drop trigger if exists invoices_delete_guard on public.invoices;
create trigger invoices_delete_guard
  before delete on public.invoices
  for each row execute function public.invoices_delete_guard();

-- ---- 12. anon reads none of the money tables -------------------------------------------------
-- Realtime sends DELETE events without RLS, so a SELECT grant alone let anon see
-- deleted ids. enquiries keeps its grants: the website inserts them as anon.

revoke select on public.payments, public.invoices, public.customers, public.quotations from anon;
