-- ============================================================================
-- Put the invoice terms on invoices that still carry the quotation's terms
--
-- Run in the Supabase SQL Editor (or `npx supabase db query --linked -f`)
-- against PRODUCTION. STEP 1 previews, STEP 2 updates, STEP 3 verifies. Not a
-- migration: `supabase db push` never runs it.
--
-- TAKE A BACKUP FIRST
--   cd Ortex.Admin && npm run backup
--
-- WHY
-- Until 2026-10-03 an invoice was pre-filled with the QUOTATION terms
-- ("Prices are subject to final artwork approval", "Taxes as applicable"),
-- which do not belong on a final tax invoice. Invoices now have their own
-- (settings quotation.invoiceTerms, Control centre -> Documents).
--
-- WHAT CHANGES
-- Only doc.terms, and only on invoices whose terms still contain the
-- quotation boilerplate. Terms someone typed for one invoice are left alone.
-- The new text is the Super Admin's saved invoice terms, else the default.
-- Amounts, payments and the Tally stamp are untouched (the invoice triggers
-- recompute paid fields from payments and keep doc.tally); audit_log records
-- each change.
-- ============================================================================

-- STEP 1: preview ------------------------------------------------------------
select count(*) as invoices_to_update
from public.invoices
where doc ->> 'terms' ilike '%final artwork approval%'
   or doc ->> 'terms' ilike '%taxes as applicable%';

-- STEP 2: update -------------------------------------------------------------
update public.invoices i
   set doc = jsonb_set(i.doc, '{terms}', to_jsonb(coalesce(
         nullif((select s.doc #>> '{quotation,invoiceTerms}' from public.settings s limit 1), ''),
         E'1. Payment is due by the due date on this invoice. Please quote the invoice number with your payment.\n2. Any shortage or damage must be reported within 7 days of delivery.\n3. Goods once sold will not be taken back.\n4. Subject to Delhi jurisdiction. E&OE.'
       )))
 where i.doc ->> 'terms' ilike '%final artwork approval%'
    or i.doc ->> 'terms' ilike '%taxes as applicable%';

-- STEP 3: verify (expect 0) --------------------------------------------------
select count(*) as still_with_quotation_terms
from public.invoices
where doc ->> 'terms' ilike '%final artwork approval%'
   or doc ->> 'terms' ilike '%taxes as applicable%';
