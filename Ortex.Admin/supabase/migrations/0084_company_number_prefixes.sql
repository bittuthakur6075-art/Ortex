-- 0084: each company numbers its documents with its own prefixes.
--
-- Until now only Ortex had a numbering block; Aman, Medinetix and Nidhi fell
-- back to the global INV / QTN / PAY, so two companies printed identical-looking
-- numbers (QTN-2627-0001 exists in both Aman and Medinetix). Numbers are already
-- unique per company (0082) and counted per company (0075, next_sequence keyed
-- '<company>:<series>'), so a new prefix only changes how the NEXT number reads:
-- the counter carries on, nothing restarts, and every existing document keeps
-- its number.
--
-- A number is PREFIX-FY-SEQ (lib/id.js documentNumber). GST Rule 46 caps an
-- invoice number at 16 characters: AMN-2627-99999 is 14. The console refuses a
-- prefix that breaks either rule or that another company uses (lib/numbering.js).
--
-- Fills only a blank key, never overwriting a prefix someone already chose, and
-- skips a prefix another company already uses (raising a notice). Ortex keeps
-- its own. A company that does not exist is skipped. Safe to run twice.

do $$
declare
  r record;
  k record;
  n jsonb;
  taken boolean;
begin
  for r in
    select * from (values
      ('aman',      'AMNQ', 'AMN', 'AMNP'),
      ('medinetix', 'MDXQ', 'MDX', 'MDXP'),
      ('nidhi',     'NDHQ', 'NDH', 'NDHP')
    ) t(id, q, i, p)
  loop
    select doc -> 'numbering' into n from public.companies where id = r.id;
    if not found then
      continue;
    end if;
    if n is null or jsonb_typeof(n) <> 'object' then
      n := '{}'::jsonb;
    end if;

    for k in
      select * from (values ('quotationPrefix', r.q), ('invoicePrefix', r.i), ('paymentPrefix', r.p)) x(key, prefix)
    loop
      if btrim(coalesce(n ->> k.key, '')) <> '' then
        continue;
      end if;
      -- Another company's block, any series. A company with no block uses the
      -- global INV / QTN / PAY, which none of these prefixes is.
      select exists (
        select 1
          from public.companies c,
               lateral (values ('quotationPrefix'), ('invoicePrefix'), ('paymentPrefix')) s(key)
         where c.id <> r.id
           and upper(btrim(coalesce(c.doc -> 'numbering' ->> s.key, ''))) = k.prefix
      ) into taken;
      if taken then
        raise notice '0084: prefix % is already used by another company; % left for % to choose.', k.prefix, k.key, r.id;
        continue;
      end if;
      n := n || jsonb_build_object(k.key, k.prefix);
    end loop;

    update public.companies
       set doc = jsonb_set(doc, '{numbering}', n)
     where id = r.id
       and doc -> 'numbering' is distinct from n;
  end loop;
end $$;
