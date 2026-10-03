-- ============================================================================
-- Bring saved documents onto the rewritten document wording (2026-10-03)
--
-- Run AFTER migration 0071, in the Supabase SQL Editor or with
--   npx supabase db query --linked -f supabase/maintenance/document-wording.sql
-- against PRODUCTION. Not a migration: `supabase db push` never runs it.
--
-- TAKE A BACKUP FIRST
--   npm run backup        (from Ortex.Admin)
--
-- WHAT CHANGES, and only where the OLD DEFAULT text is still in place
-- (anything someone typed is left alone):
--  1. settings: quotation.terms, if it is still the old default, becomes the
--     new quotation terms; a stray quotation.invoiceTerms (shipped for an hour
--     on 2026-10-03) moves to documents.invoiceTerms.
--  2. invoices: terms still carrying the quotation boilerplate ("final artwork
--     approval", "Taxes as applicable") become the invoice terms.
--  3. quotations: terms that are exactly the old default become the new
--     quotation terms.
--  4. profiles.quotation_defaults.terms that are exactly the old default are
--     cleared, so those people follow the company terms again.
-- Amounts, payments and the Tally stamp are untouched; audit_log records each
-- changed invoice and quotation.
-- ============================================================================

begin;

create temporary table _w on commit drop as select
  E'1. Prices are subject to final artwork approval.\n2. 50% advance with the order, balance before dispatch.\n3. Delivery timeline confirmed on order.\n4. Taxes as applicable.' as old_q,
  E'1. This quotation is valid until the date shown above.\n2. Prices are for the quantities and specifications quoted; GST is charged at the rates shown.\n3. Production starts on artwork approval and a 50% advance; the balance is payable before dispatch.\n4. The delivery timeline is confirmed with the order.' as new_q,
  E'1. Payment is due by the due date on this invoice. Please quote the invoice number with your payment.\n2. Any shortage or damage must be reported within 7 days of delivery.\n3. Goods once sold will not be taken back.\n4. Subject to Delhi jurisdiction. E&OE.' as new_i;

-- Same text, ignoring \r\n versus \n and trailing spaces.
create or replace function pg_temp.norm(t text) returns text language sql immutable as
  $$ select btrim(regexp_replace(coalesce(t, ''), E'\\r', '', 'g')) $$;

-- Preview ---------------------------------------------------------------------
select
  (select count(*) from public.settings s, _w where pg_temp.norm(s.doc #>> '{quotation,terms}') = pg_temp.norm(_w.old_q)) as settings_terms,
  (select count(*) from public.invoices where doc ->> 'terms' ilike '%final artwork approval%' or doc ->> 'terms' ilike '%taxes as applicable%') as invoices,
  (select count(*) from public.quotations q, _w where pg_temp.norm(q.doc ->> 'terms') = pg_temp.norm(_w.old_q)) as quotations,
  (select count(*) from public.profiles p, _w where pg_temp.norm(p.quotation_defaults ->> 'terms') = pg_temp.norm(_w.old_q)) as people;

-- 1. settings
update public.settings s
   set doc = jsonb_set(s.doc, '{quotation,terms}', to_jsonb(_w.new_q))
  from _w
 where pg_temp.norm(s.doc #>> '{quotation,terms}') = pg_temp.norm(_w.old_q);

update public.settings s
   set doc = jsonb_set(s.doc #- '{quotation,invoiceTerms}', '{documents}',
         coalesce(s.doc -> 'documents', '{}'::jsonb) || jsonb_build_object('invoiceTerms', s.doc #>> '{quotation,invoiceTerms}'))
 where s.doc #> '{quotation,invoiceTerms}' is not null
   and s.doc #> '{documents,invoiceTerms}' is null;

-- 2. invoices
update public.invoices i
   set doc = jsonb_set(i.doc, '{terms}', to_jsonb(coalesce(
         nullif((select s.doc #>> '{documents,invoiceTerms}' from public.settings s limit 1), ''), _w.new_i)))
  from _w
 where i.doc ->> 'terms' ilike '%final artwork approval%'
    or i.doc ->> 'terms' ilike '%taxes as applicable%';

-- 3. quotations
update public.quotations q
   set doc = jsonb_set(q.doc, '{terms}', to_jsonb(coalesce(
         nullif((select s.doc #>> '{quotation,terms}' from public.settings s limit 1), ''), _w.new_q)))
  from _w
 where pg_temp.norm(q.doc ->> 'terms') = pg_temp.norm(_w.old_q);

-- 4. people's own quotation defaults
update public.profiles p
   set quotation_defaults = p.quotation_defaults || '{"terms": null}'::jsonb
  from _w
 where pg_temp.norm(p.quotation_defaults ->> 'terms') = pg_temp.norm(_w.old_q);

-- Verify (expect all 0) ---------------------------------------------------------
select
  (select count(*) from public.invoices where doc ->> 'terms' ilike '%final artwork approval%' or doc ->> 'terms' ilike '%taxes as applicable%') as invoices_left,
  (select count(*) from public.quotations q, _w where pg_temp.norm(q.doc ->> 'terms') = pg_temp.norm(_w.old_q)) as quotations_left;

commit;
