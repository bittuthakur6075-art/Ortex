-- ============================================================================
-- Remove the demo/sample records seeded by src/data/seed/seed.js
--
-- Run this in the Supabase SQL Editor against PRODUCTION, once you have
-- finished evaluating the console and want only real business data left.
--
-- This is NOT a migration. It lives outside supabase/migrations/ on purpose so
-- `supabase db push` never runs it: deleting rows is not something that should
-- happen automatically when an environment is provisioned.
--
--
-- WHY IT MATCHES ON EMAIL AND SKU RATHER THAN ID
--
-- The seed gives its records readable ids ("qtn_1", "prod_mdf01", …), but those
-- never reach Supabase. Every table here is (id uuid, doc jsonb), and apiStore's
-- toDoc() strips the id before insert, keeping a caller's value only when it is
-- already a uuid. So a seeded row lands with a fresh gen_random_uuid() and no
-- trace of its original id. What DOES survive is the content, so the demo rows
-- are identified by the fabricated customer emails and product SKUs that the
-- seed hard-codes. Those cannot collide with a real customer of yours.
--
--
-- WHAT IT DELETES
--   payments, invoices, quotations, leads, enquiries whose customer snapshot
--   carries one of the eight fabricated demo email addresses, the eight demo
--   products by SKU, and the six demo customer records by email.
--
-- WHAT IT DELIBERATELY LEAVES ALONE
--   • categories — the seed puts your real catalogue taxonomy there
--     (MDF products, Acrylic products, Lanyards, …), not throwaway data.
--   • The document numbering counters in public.sequences. Deleting a demo
--     invoice does not free its number for reuse, and must not: an issued
--     invoice number is spent. Expect gaps at the low end of each series.
--     That is correct, and safer than renumbering.
--   • Anything you created yourself. A demo record you edited into a real one
--     no longer carries a demo email, so it is preserved automatically.
--
-- BEFORE YOU RUN IT
--   1. Take a backup: `npm run backup` (see scripts/backup.mjs).
--   2. Run STEP 1 and read every row. If something you recognise as real
--      appears, remove its email from the list before running STEP 2.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW. Read-only. Shows exactly what STEP 2 would remove.
-- ─────────────────────────────────────────────────────────────────────────

with demo_emails(email) as (values
  ('priya@brightcorp.in'), ('rahul.v@technova.com'), ('anita@edulearn.org'),
  ('vikram@gifthub.in'),   ('karan@startupx.io'),    ('meera.nair@acmemfg.com'),
  ('sunita@horizonevents.in'), ('amit@nextgenpharma.com')
), demo_skus(sku) as (values
  ('MDF-TRO-01'), ('ACR-STD-01'), ('LAN-SUB-16'), ('BAD-MAG-01'),
  ('BRD-EXM-01'), ('GFT-BTL-750'), ('GFT-DRY-01'), ('CBD-PAD-01')
)
select 'payments' as table_name, id, doc->>'number' as label, doc->'customer'->>'company' as who
  from public.payments   where doc->'customer'->>'email' in (select email from demo_emails)
union all
select 'invoices',   id, doc->>'number', doc->'customer'->>'company'
  from public.invoices   where doc->'customer'->>'email' in (select email from demo_emails)
union all
select 'quotations', id, doc->>'number', doc->'customer'->>'company'
  from public.quotations where doc->'customer'->>'email' in (select email from demo_emails)
union all
select 'leads',      id, doc->>'stage',  doc->'customer'->>'company'
  from public.leads      where doc->'customer'->>'email' in (select email from demo_emails)
union all
select 'enquiries',  id, doc->>'status', doc->'customer'->>'company'
  from public.enquiries  where doc->'customer'->>'email' in (select email from demo_emails)
union all
select 'products',   id, doc->>'sku',    doc->>'name'
  from public.products   where doc->>'sku' in (select sku from demo_skus)
union all
select 'customers',  id, doc->>'email',  doc->>'company'
  from public.customers  where doc->>'email' in (select email from demo_emails)
order by table_name, label;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — DELETE. Uncomment and run once the preview looks right. Wrapped in
-- a transaction, so a failure anywhere removes nothing. Child rows go before
-- the records they reference.
-- ─────────────────────────────────────────────────────────────────────────

-- begin;
--
-- create temp table _demo_email(email text primary key) on commit drop;
-- insert into _demo_email values
--   ('priya@brightcorp.in'), ('rahul.v@technova.com'), ('anita@edulearn.org'),
--   ('vikram@gifthub.in'),   ('karan@startupx.io'),    ('meera.nair@acmemfg.com'),
--   ('sunita@horizonevents.in'), ('amit@nextgenpharma.com');
--
-- delete from public.payments   where doc->'customer'->>'email' in (select email from _demo_email);
-- delete from public.invoices   where doc->'customer'->>'email' in (select email from _demo_email);
-- delete from public.quotations where doc->'customer'->>'email' in (select email from _demo_email);
-- delete from public.leads      where doc->'customer'->>'email' in (select email from _demo_email);
-- delete from public.enquiries  where doc->'customer'->>'email' in (select email from _demo_email);
--
-- -- Products go after the documents that quoted them. Quotation and invoice
-- -- lines keep their own snapshot of description, HSN and rate, so any real
-- -- document that happened to quote a demo product still reads correctly.
-- delete from public.products where doc->>'sku' in (
--   'MDF-TRO-01','ACR-STD-01','LAN-SUB-16','BAD-MAG-01',
--   'BRD-EXM-01','GFT-BTL-750','GFT-DRY-01','CBD-PAD-01'
-- );
--
-- delete from public.customers where doc->>'email' in (select email from _demo_email);
--
-- commit;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 3 — VERIFY. Every count should be zero. Re-run STEP 1 as well; it
-- should return no rows.
-- ─────────────────────────────────────────────────────────────────────────

-- select
--   (select count(*) from public.products  where doc->>'sku' = 'MDF-TRO-01')          as demo_products_left,
--   (select count(*) from public.customers where doc->>'email' = 'priya@brightcorp.in') as demo_customers_left;
