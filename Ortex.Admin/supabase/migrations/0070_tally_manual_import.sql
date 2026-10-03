-- 0070: the manual "Import from Tally" (Billing -> Import from Tally, admins only).
--
-- The owner chose a manual import: a person exports XML from TallyPrime and
-- uploads it in the console, which writes invoices and payments already marked
-- as being in Tally. Until now invoices_tally_guard kept a client's stamp only
-- in the old import's exact shape { status 'synced', syncedAt, voucherRef }, and
-- payments_guard stripped every client stamp. Both are redefined from their
-- LATEST versions (0066) and change only what is said here. Plain `create or
-- replace`: safe to run twice.
--
--   1. tally_import_stamp(jsonb) answers true for the new import's stamp and
--      nothing else: an object with exactly the keys status 'synced', source
--      'tally', syncedAt, voucherRef and guid (strings, guid not blank) and
--      alterId (a number). Tally's GUID is how a later upload recognises a
--      record it already imported; ALTERID grows each time it is changed there.
--   2. invoices_tally_guard. For an ADMIN (is_admin(), so the Super Admin too):
--      a. a new invoice keeps either stamp (the old shape still works);
--      b. an update on an invoice with no stored stamp (missing or null) may
--         add either stamp, as before;
--      c. NEW: an update on an invoice whose stored stamp has source 'tally'
--         may replace it with a new import stamp ("changed in Tally").
--      Every other stored stamp is kept whatever the update says, and anyone
--      else's stamp is dropped. The service role is free, as before.
--   3. payments_guard. For an ADMIN:
--      a. NEW: a new payment keeps an import stamp (any other tally is
--         dropped, as before, and `account` stays the connector's);
--      b. NEW: an update on a payment with no stored stamp may add one;
--      c. NEW: a payment whose stored stamp has source 'tally' may be changed
--         (amount, date, party, invoice link and the rest) when the update
--         carries an import stamp with a HIGHER alterId: that is a re-import of
--         a voucher edited in Tally. Anything else on such a payment, by an
--         admin or anyone, is still refused unless the caller is the Super
--         Admin, exactly as for every synced payment.
--      Payments synced by the connector (no source 'tally') stay frozen for
--      everyone but the Super Admin, and nobody but the service writes their
--      stamp. Non-admins lose any stamp they send, as before. A delete of a
--      synced payment, imported or not, still needs the Super Admin.

-- ---- 1. the import stamp ----------------------------------------------------------------

create or replace function public.tally_import_stamp(t jsonb)
returns boolean language sql immutable set search_path = public as $$
  select case when jsonb_typeof(t) = 'object' then
    t ->> 'status' = 'synced'
    and t ->> 'source' = 'tally'
    and jsonb_typeof(t -> 'syncedAt') = 'string'
    and jsonb_typeof(t -> 'voucherRef') = 'string'
    and jsonb_typeof(t -> 'guid') = 'string' and btrim(t ->> 'guid') <> ''
    and jsonb_typeof(t -> 'alterId') = 'number'
    and (select count(*) from jsonb_object_keys(t)) = 6
  else false end;
$$;
revoke execute on function public.tally_import_stamp(jsonb) from public, anon;
grant execute on function public.tally_import_stamp(jsonb) to authenticated, service_role;

-- ---- 2. invoices --------------------------------------------------------------------------

create or replace function public.invoices_tally_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  t jsonb := new.doc -> 'tally';
  v_old jsonb := case when tg_op = 'UPDATE' then old.doc -> 'tally' end;
  v_admin boolean;
  v_import boolean;
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'An invoice''s id cannot be changed.';
  end if;
  if public.is_service_caller() then return new; end if;
  v_admin := public.is_admin();
  -- The old Tally XML import: exactly { status 'synced', syncedAt, voucherRef }; or the 0070 import stamp.
  v_import := v_admin and (
    public.tally_import_stamp(t)
    or case when jsonb_typeof(t) = 'object'
            then t ->> 'status' = 'synced'
                 and not exists (select 1 from jsonb_object_keys(t) k where k not in ('status', 'syncedAt', 'voucherRef'))
            else false end);
  if coalesce(jsonb_typeof(v_old), 'null') <> 'null' then
    -- A stored stamp stays, unless an admin re-imports a voucher this import made.
    if not (v_admin and coalesce(v_old ->> 'source' = 'tally', false) and public.tally_import_stamp(t)) then
      new.doc := new.doc || jsonb_build_object('tally', v_old);
    end if;
  elsif not v_import then
    new.doc := new.doc - 'tally';
  end if;
  return new;
end;
$$;

-- ---- 3. payments --------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: is_service_caller() reads current_user.

create or replace function public.payments_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_service boolean := public.is_service_caller();
  v_import boolean := false;
  v_reimport boolean := false;
  k text;
begin
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    raise exception 'A payment''s id cannot be changed.';
  end if;
  if tg_op <> 'DELETE' and not v_service then
    v_import := public.is_admin() and public.tally_import_stamp(new.doc -> 'tally');
  end if;
  -- A voucher changed in Tally since this import first brought it in.
  if tg_op = 'UPDATE' and v_import then
    v_reimport := coalesce(old.doc #>> '{tally,source}' = 'tally', false)
                  and (new.doc #>> '{tally,alterId}')::numeric > coalesce(public.safe_num(old.doc #>> '{tally,alterId}'), -1);
  end if;
  if tg_op <> 'INSERT'
     and old.doc #>> '{tally,status}' = 'synced'
     and not v_service and not public.is_super_admin() and not v_reimport
     and (tg_op = 'DELETE'
          or exists (select 1 from unnest(array['amount', 'type', 'date', 'invoiceId', 'party',
                                                'customer', 'number', 'reference', 'invoiceNumber']) f
                      where (old.doc -> f) is distinct from (new.doc -> f))) then
    raise exception 'This payment is already in Tally. Only the Super Admin can change or delete it, and it must be changed in Tally too.';
  end if;
  if tg_op = 'DELETE' then return old; end if;

  -- tally and account (the bank ledger) are the connector's keys; an admin's
  -- import stamp is the one exception for tally.
  if not v_service then
    if tg_op = 'INSERT' then
      new.doc := new.doc - 'account';
      if not v_import then new.doc := new.doc - 'tally'; end if;
      new.created_at := now();
    else
      new.doc := case when old.doc ? 'account' then new.doc || jsonb_build_object('account', old.doc -> 'account') else new.doc - 'account' end;
      if not (v_reimport or (v_import and coalesce(jsonb_typeof(old.doc -> 'tally'), 'null') = 'null')) then
        k := 'tally';
        new.doc := case when old.doc ? k then new.doc || jsonb_build_object(k, old.doc -> k) else new.doc - k end;
      end if;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;
