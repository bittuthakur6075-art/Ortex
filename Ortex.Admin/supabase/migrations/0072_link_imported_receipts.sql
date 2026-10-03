-- 0072: an admin may link an imported Tally receipt to its invoice.
--
-- The manual "Import from Tally" (0070) saves a receipt unlinked when its
-- invoice is not in the console yet. When a later upload brings that invoice,
-- the receipt could only be linked by saving it again in Tally (a higher
-- ALTERID), because payments_guard freezes every synced payment. This lets the
-- import (or an admin) make that one change in the console.
--
-- payments_guard is redefined from its LATEST version (0070) and changes only
-- this. Plain `create or replace`: safe to run twice.
--
--   An ADMIN (is_admin(), so the Super Admin too) may update a payment when:
--     a. its stored stamp has source 'tally' (made by the manual import),
--     b. its stored invoiceId is missing, null or blank,
--     c. the update sets a non-blank invoiceId,
--     d. it is an inflow and stays one,
--     e. amount, type, date, party, number, reference and the tally stamp are
--        exactly as stored.
--   invoiceNumber and customer may differ, because payments_validate then
--   overwrites both from the invoice. payments_validate also refuses an
--   invoiceId that is not an existing invoice and a payout with an invoice,
--   as before. The payments_sync_invoice trigger then recomputes that
--   invoice's paid status.
--
--   Nothing else changes: a linked receipt cannot be moved to another invoice
--   or unlinked this way, payments synced by the connector (no source 'tally')
--   stay frozen for everyone but the Super Admin, non-admins are refused, and
--   a delete of a synced payment still needs the Super Admin.

-- SECURITY INVOKER on purpose: is_service_caller() reads current_user.
create or replace function public.payments_guard()
returns trigger language plpgsql set search_path = public as $$
declare
  v_service boolean := public.is_service_caller();
  v_import boolean := false;
  v_reimport boolean := false;
  v_link boolean := false;
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
  -- 0072: an unlinked imported receipt is linked to its invoice, nothing else changes.
  if tg_op = 'UPDATE' and not v_service then
    v_link := coalesce(old.doc #>> '{tally,source}' = 'tally', false)
              and btrim(coalesce(old.doc ->> 'invoiceId', '')) = ''
              and btrim(coalesce(new.doc ->> 'invoiceId', '')) <> ''
              and coalesce(old.doc ->> 'type', '') = 'inflow'
              and not exists (select 1 from unnest(array['amount', 'type', 'date', 'party', 'number', 'reference', 'tally']) f
                               where (old.doc -> f) is distinct from (new.doc -> f))
              and public.is_admin();
  end if;
  if tg_op <> 'INSERT'
     and old.doc #>> '{tally,status}' = 'synced'
     and not v_service and not public.is_super_admin() and not v_reimport and not v_link
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
