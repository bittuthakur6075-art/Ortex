-- 0082: unique document numbers and import keys.
--
-- Numbers come from the atomic next_sequence (0075), so two people cannot be
-- handed the same one, but nothing in the database refused a duplicate: an
-- invoice number typed by hand (createInvoice takes draft.number) or a Tally
-- import whose own de-duplication runs only in the browser could repeat one.
-- Payments have had payments_number_key since 0066/0075; this adds the rest.
--
--   1. invoices_number_key      (company_id, number) case and space insensitive
--   2. quotations_number_key    (company_id, number); NOT global, each company
--                               numbers its own (QTN-2627-0001 exists twice)
--   3. *_tally_guid_key         doc.tally.guid per company on invoices,
--                               payments and customers; products are shared,
--                               so theirs is global. Two admins importing the
--                               same Day Book now fail safely.
--
-- Each index is created only when no duplicate exists. Otherwise it is skipped
-- with a NOTICE naming the count (like 0066), so the push never fails on old
-- data: fix the duplicates and run this file's block again. Blank values are
-- left out of every index.

do $$
declare
  spec record;
  n int;
begin
  for spec in
    select * from (values
      ('invoices_number_key', 'invoices',
       'company_id, lower(btrim(doc ->> ''number''))',
       'btrim(coalesce(doc ->> ''number'', '''')) <> '''''),
      ('quotations_number_key', 'quotations',
       'company_id, lower(btrim(doc ->> ''number''))',
       'btrim(coalesce(doc ->> ''number'', '''')) <> '''''),
      ('invoices_tally_guid_key', 'invoices',
       'company_id, (doc -> ''tally'' ->> ''guid'')',
       'btrim(coalesce(doc -> ''tally'' ->> ''guid'', '''')) <> '''''),
      ('payments_tally_guid_key', 'payments',
       'company_id, (doc -> ''tally'' ->> ''guid'')',
       'btrim(coalesce(doc -> ''tally'' ->> ''guid'', '''')) <> '''''),
      ('customers_tally_guid_key', 'customers',
       'company_id, (doc -> ''tally'' ->> ''guid'')',
       'btrim(coalesce(doc -> ''tally'' ->> ''guid'', '''')) <> '''''),
      ('products_tally_guid_key', 'products',
       '(doc -> ''tally'' ->> ''guid'')',
       'btrim(coalesce(doc -> ''tally'' ->> ''guid'', '''')) <> ''''')
    ) as s(name, tbl, cols, pred)
  loop
    if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = spec.name) then
      continue;
    end if;
    execute format('select count(*) from (select 1 from public.%I where %s group by %s having count(*) > 1) d',
                   spec.tbl, spec.pred, spec.cols)
      into n;
    if n > 0 then
      raise notice '0082: % NOT created: % value(s) are used more than once in %. Fix them and run 0082 again.',
        spec.name, n, spec.tbl;
    else
      execute format('create unique index %I on public.%I (%s) where %s', spec.name, spec.tbl, spec.cols, spec.pred);
    end if;
  end loop;
end $$;
