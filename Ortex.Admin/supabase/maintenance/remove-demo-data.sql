-- ============================================================================
-- Remove every sample record seeded by src/data/seed/seed.js, keeping real data
--
-- Run in the Supabase SQL Editor against PRODUCTION, once you have finished
-- evaluating the console. STEP 1 previews, STEP 2 deletes, STEP 3 verifies.
--
-- This is NOT a migration. It lives outside supabase/migrations/ on purpose so
-- `supabase db push` never runs it: deleting rows is not something that should
-- happen automatically when an environment is provisioned.
--
--
-- TAKE A BACKUP FIRST
--   cd Ortex.Admin && npm run backup
-- There is no undo, and the free plan keeps no automatic copy.
--
--
-- WHY IT MATCHES ON CONTENT RATHER THAN ID
--
-- The seed gives its records readable keys, but those never reach Supabase.
-- Every table here is (id uuid, doc jsonb), and apiStore's toDoc() strips the
-- id before insert, keeping a caller's value only when it is already a uuid. So
-- a seeded row lands with a fresh gen_random_uuid() and no trace of its origin.
-- What survives is the content, so the sample rows are identified by the
-- fabricated values the seed hard-codes:
--
--   • 8 customer emails      (customers, leads, enquiries, quotations,
--                             invoices, payments)
--   • 8 product SKUs         (products)
--   • 4 visitor ids          (user_activities, event_logs, ai_messages,
--                             whatsapp_logs)
--   • 5 template names        (message_templates)
--   • 5 automation rule names (automation_rules)
--
-- None can collide with real data. The visitor ids are the subtle one: the
-- website generates "usr_" + 9 random characters (Ortex.Web/src/lib/tracker.js),
-- so real traffic never produces the short literals the seed uses. Matching the
-- exact four strings leaves genuine analytics untouched.
--
--
-- WHAT IT DELIBERATELY LEAVES ALONE
--   • categories — the seed puts your real catalogue taxonomy there (MDF
--     products, Acrylic products, Lanyards …), not throwaway data. Deleting it
--     would strip the categories off products you actually sell. There is an
--     opt-in block at the bottom if you really want them gone.
--   • work — Work photos mirror the curated shots from the website's /work
--     page. They are real marketing content that happens to ship as a seed.
--   • The numbering counters in settings. An issued invoice number is spent,
--     and reusing one is a GST problem. STEP 4 offers a reset, guarded so it
--     only runs when no real document exists.
--   • Anything you created. A demo record you edited into a real one no longer
--     carries a demo email, so it survives automatically.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — PREVIEW. Read-only. Shows exactly what STEP 2 would remove.
--          Read every row before going further.
-- ─────────────────────────────────────────────────────────────────────────

with demo_email(v) as (values
  ('priya@brightcorp.in'), ('rahul.v@technova.com'), ('anita@edulearn.org'),
  ('vikram@gifthub.in'),   ('karan@startupx.io'),    ('meera.nair@acmemfg.com'),
  ('sunita@horizonevents.in'), ('amit@nextgenpharma.com')
), demo_sku(v) as (values
  ('MDF-TRO-01'), ('ACR-STD-01'), ('LAN-SUB-16'), ('BAD-MAG-01'),
  ('BRD-EXM-01'), ('GFT-BTL-750'), ('GFT-DRY-01'), ('CBD-PAD-01')
), demo_visitor(v) as (values
  ('usr_priya'), ('usr_rahul'), ('usr_anon1'), ('usr_anita')
), demo_template(v) as (values
  ('template_quote_request'), ('template_contact_form'), ('template_cart_abandonment'),
  ('template_order_confirm'), ('template_payment_confirm')
), demo_rule(v) as (values
  ('Quote Request Follow-up'), ('Contact Form Auto-reply'), ('Cart Abandonment Reminder'),
  ('Order Confirmation Notification'), ('Payment Receipt Confirmation')
)
select 'payments' as table_name, count(*) as rows_to_delete from public.payments   where doc->'customer'->>'email' in (select v from demo_email)
union all select 'invoices',        count(*) from public.invoices          where doc->'customer'->>'email' in (select v from demo_email)
union all select 'quotations',      count(*) from public.quotations        where doc->'customer'->>'email' in (select v from demo_email)
union all select 'leads',           count(*) from public.leads             where doc->'customer'->>'email' in (select v from demo_email)
union all select 'enquiries',       count(*) from public.enquiries         where doc->'customer'->>'email' in (select v from demo_email)
union all select 'customers',       count(*) from public.customers         where doc->>'email'             in (select v from demo_email)
union all select 'products',        count(*) from public.products          where doc->>'sku'               in (select v from demo_sku)
union all select 'user_activities', count(*) from public.user_activities   where doc->>'userId'            in (select v from demo_visitor)
union all select 'event_logs',      count(*) from public.event_logs        where doc->>'userId'            in (select v from demo_visitor)
union all select 'ai_messages',     count(*) from public.ai_messages       where doc->>'userId'            in (select v from demo_visitor)
union all select 'whatsapp_logs',   count(*) from public.whatsapp_logs     where doc->>'userId'            in (select v from demo_visitor)
union all select 'message_templates', count(*) from public.message_templates where doc->>'name'            in (select v from demo_template)
union all select 'automation_rules', count(*) from public.automation_rules where doc->>'name'              in (select v from demo_rule)
order by table_name;

-- And the detail, so you can eyeball actual records rather than counts:
with demo_email(v) as (values
  ('priya@brightcorp.in'), ('rahul.v@technova.com'), ('anita@edulearn.org'),
  ('vikram@gifthub.in'),   ('karan@startupx.io'),    ('meera.nair@acmemfg.com'),
  ('sunita@horizonevents.in'), ('amit@nextgenpharma.com')
), demo_sku(v) as (values
  ('MDF-TRO-01'), ('ACR-STD-01'), ('LAN-SUB-16'), ('BAD-MAG-01'),
  ('BRD-EXM-01'), ('GFT-BTL-750'), ('GFT-DRY-01'), ('CBD-PAD-01')
)
select 'invoices' as table_name, doc->>'number' as label, doc->'customer'->>'company' as who
  from public.invoices   where doc->'customer'->>'email' in (select v from demo_email)
union all
select 'quotations', doc->>'number', doc->'customer'->>'company'
  from public.quotations where doc->'customer'->>'email' in (select v from demo_email)
union all
select 'products',   doc->>'sku',    doc->>'name'
  from public.products   where doc->>'sku' in (select v from demo_sku)
union all
select 'customers',  doc->>'email',  doc->>'company'
  from public.customers  where doc->>'email' in (select v from demo_email)
order by table_name, label;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — DELETE. Uncomment the whole block and run once the preview looks
--          right. Wrapped in a transaction, so a failure anywhere removes
--          nothing. Children go before the records they reference.
-- ─────────────────────────────────────────────────────────────────────────

-- begin;
--
-- create temp table _demo_email(v text primary key) on commit drop;
-- insert into _demo_email values
--   ('priya@brightcorp.in'), ('rahul.v@technova.com'), ('anita@edulearn.org'),
--   ('vikram@gifthub.in'),   ('karan@startupx.io'),    ('meera.nair@acmemfg.com'),
--   ('sunita@horizonevents.in'), ('amit@nextgenpharma.com');
--
-- create temp table _demo_visitor(v text primary key) on commit drop;
-- insert into _demo_visitor values ('usr_priya'), ('usr_rahul'), ('usr_anon1'), ('usr_anita');
--
-- -- Sales records, children first.
-- delete from public.payments   where doc->'customer'->>'email' in (select v from _demo_email);
-- delete from public.invoices   where doc->'customer'->>'email' in (select v from _demo_email);
-- delete from public.quotations where doc->'customer'->>'email' in (select v from _demo_email);
-- delete from public.leads      where doc->'customer'->>'email' in (select v from _demo_email);
-- delete from public.enquiries  where doc->'customer'->>'email' in (select v from _demo_email);
--
-- -- Analytics and messaging. ai_messages and event_logs reference activities,
-- -- so they go first; all four carry the fabricated visitor id.
-- delete from public.ai_messages     where doc->>'userId' in (select v from _demo_visitor);
-- delete from public.event_logs      where doc->>'userId' in (select v from _demo_visitor);
-- delete from public.user_activities where doc->>'userId' in (select v from _demo_visitor);
-- delete from public.whatsapp_logs   where doc->>'userId' in (select v from _demo_visitor);
--
-- -- Automation. Rules reference templates, so rules go first.
-- delete from public.automation_rules where doc->>'name' in (
--   'Quote Request Follow-up','Contact Form Auto-reply','Cart Abandonment Reminder',
--   'Order Confirmation Notification','Payment Receipt Confirmation'
-- );
-- delete from public.message_templates where doc->>'name' in (
--   'template_quote_request','template_contact_form','template_cart_abandonment',
--   'template_order_confirm','template_payment_confirm'
-- );
--
-- -- Products go after the documents that quoted them. Quotation and invoice
-- -- lines keep their own snapshot of description, HSN and rate, so any real
-- -- document that happened to quote a demo product still reads correctly.
-- delete from public.products where doc->>'sku' in (
--   'MDF-TRO-01','ACR-STD-01','LAN-SUB-16','BAD-MAG-01',
--   'BRD-EXM-01','GFT-BTL-750','GFT-DRY-01','CBD-PAD-01'
-- );
--
-- delete from public.customers where doc->>'email' in (select v from _demo_email);
--
-- commit;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 3 — VERIFY. Re-run STEP 1; every count should be zero.
-- ─────────────────────────────────────────────────────────────────────────

-- select
--   (select count(*) from public.products  where doc->>'sku'   = 'MDF-TRO-01')          as demo_products_left,
--   (select count(*) from public.customers where doc->>'email' = 'priya@brightcorp.in') as demo_customers_left,
--   (select count(*) from public.user_activities where doc->>'userId' = 'usr_priya')    as demo_activities_left,
--   (select count(*) from public.products)   as real_products,
--   (select count(*) from public.customers)  as real_customers,
--   (select count(*) from public.invoices)   as real_invoices;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 4 — OPTIONAL: reset the document counters.
--
-- The seed advanced quotation/invoice/payment numbering past its own records,
-- so without this your first real invoice continues from where the samples
-- stopped. That gap is harmless but looks odd on a brand-new set of books.
--
-- ONLY safe while no real document has been issued: an invoice number that has
-- gone to a customer is spent, and reissuing it is a GST problem. The guard
-- below refuses to run if any invoice or quotation remains.
-- ─────────────────────────────────────────────────────────────────────────

-- do $$
-- declare n int;
-- begin
--   select (select count(*) from public.invoices) + (select count(*) from public.quotations) into n;
--   if n > 0 then
--     raise exception 'Refusing to reset: % quotation/invoice row(s) still exist. Reusing a spent number is a compliance problem.', n;
--   end if;
--   delete from public.sequences where series in ('quotation','invoice','payment');
--   update public.settings
--      set doc = jsonb_set(doc, '{numbering}',
--                (doc->'numbering') || '{"quotationSeq":1,"invoiceSeq":1,"paymentSeq":1}'::jsonb)
--    where doc ? 'numbering';
--   raise notice 'Counters reset to 1.';
-- end $$;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 5 — OPT-IN ONLY: the catalogue taxonomy.
--
-- Categories are excluded above because they are your real taxonomy, and
-- removing them strips the category off every product you actually sell.
-- Run this only if you intend to rebuild the catalogue from scratch.
-- ─────────────────────────────────────────────────────────────────────────

-- delete from public.categories where doc->>'name' in (
--   'MDF products','Acrylic products','Lanyards & ID card accessories',
--   'Badge manufacturing','Examination boards','Clipboards & writing pads',
--   'Corporate gifting & merchandise','Customization & branding'
-- );
