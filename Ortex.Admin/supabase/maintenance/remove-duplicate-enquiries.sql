-- ============================================================================
-- Remove duplicate enquiries and empty ones, keeping everything else
--
-- Run in the Supabase SQL Editor against PRODUCTION. STEP 1 previews (counts
-- only), STEP 2 deletes, STEP 3 verifies. Not a migration: `supabase db push`
-- never runs it.
--
-- TAKE A BACKUP FIRST
--   cd Ortex.Admin && npm run backup
-- There is no undo.
--
-- WHAT COUNTS AS A DUPLICATE
-- The same key the Excel import skips on (lib/enquiryImport.js enquiryKey):
-- the same person (last 10 digits of the mobile, else the name), the same
-- product, on the same IST day. Of each group the most worked-on row is kept:
-- one with an owner, then a status past "new", then the longest notes, then
-- the oldest. The same mobile asking about ANOTHER product or on another day
-- is a separate enquiry and is left alone.
--
-- WHAT COUNTS AS EMPTY
-- No mobile digits, no email, no product and no message: nobody to call and
-- nothing asked. A name or notes alone do not save a row.
--
-- NEVER DELETED
-- A row that a quotation or a pipeline lead points at (doc.enquiryId).
-- ============================================================================

-- STEP 1: preview ------------------------------------------------------------
with k as (
  select id, created_at, doc,
    coalesce(nullif(right(regexp_replace(coalesce(doc->'customer'->>'phone', ''), '\D', '', 'g'), 10), ''),
             lower(trim(coalesce(doc->'customer'->>'name', '')))) as who,
    lower(regexp_replace(trim(coalesce(doc->>'productInterest', '')), '\s+', ' ', 'g')) as product,
    (created_at at time zone 'Asia/Kolkata')::date as day
  from enquiries
), ranked as (
  select id, who,
    row_number() over (
      partition by who, product, day
      order by (coalesce(doc->>'owner', '') <> '') desc, (coalesce(doc->>'status', 'new') <> 'new') desc,
               length(coalesce(doc->>'notes', '')) desc, created_at
    ) as rn
  from k
), referenced as (
  select doc->>'enquiryId' as id from quotations where doc->>'enquiryId' is not null
  union select doc->>'enquiryId' from leads where doc->>'enquiryId' is not null
), doomed as (
  select id, 'duplicate' as why from ranked where rn > 1 and who <> ''
  union
  select id, 'empty' from enquiries
  where regexp_replace(coalesce(doc->'customer'->>'phone', ''), '\D', '', 'g') = ''
    and coalesce(trim(doc->'customer'->>'email'), '') = ''
    and coalesce(trim(doc->>'productInterest'), '') = ''
    and coalesce(trim(doc->>'message'), '') = ''
)
select why, count(*) as rows_to_delete
from doomed where id::text not in (select id from referenced)
group by why;


-- STEP 2: delete (run once the preview looks right) ---------------------------
begin;

with k as (
  select id, created_at, doc,
    coalesce(nullif(right(regexp_replace(coalesce(doc->'customer'->>'phone', ''), '\D', '', 'g'), 10), ''),
             lower(trim(coalesce(doc->'customer'->>'name', '')))) as who,
    lower(regexp_replace(trim(coalesce(doc->>'productInterest', '')), '\s+', ' ', 'g')) as product,
    (created_at at time zone 'Asia/Kolkata')::date as day
  from enquiries
), ranked as (
  select id, who,
    row_number() over (
      partition by who, product, day
      order by (coalesce(doc->>'owner', '') <> '') desc, (coalesce(doc->>'status', 'new') <> 'new') desc,
               length(coalesce(doc->>'notes', '')) desc, created_at
    ) as rn
  from k
), referenced as (
  select doc->>'enquiryId' as id from quotations where doc->>'enquiryId' is not null
  union select doc->>'enquiryId' from leads where doc->>'enquiryId' is not null
), doomed as (
  select id from ranked where rn > 1 and who <> ''
  union
  select id from enquiries
  where regexp_replace(coalesce(doc->'customer'->>'phone', ''), '\D', '', 'g') = ''
    and coalesce(trim(doc->'customer'->>'email'), '') = ''
    and coalesce(trim(doc->>'productInterest'), '') = ''
    and coalesce(trim(doc->>'message'), '') = ''
)
delete from enquiries
where id in (select id from doomed)
  and id::text not in (select id from referenced);

commit;


-- STEP 3: verify (both 0, unless a quotation or lead points at a kept copy) ---
select
  (select count(*) from (
     select 1 from enquiries
     group by coalesce(nullif(right(regexp_replace(coalesce(doc->'customer'->>'phone', ''), '\D', '', 'g'), 10), ''),
                       lower(trim(coalesce(doc->'customer'->>'name', '')))),
              lower(regexp_replace(trim(coalesce(doc->>'productInterest', '')), '\s+', ' ', 'g')),
              (created_at at time zone 'Asia/Kolkata')::date
     having count(*) > 1) g) as duplicate_groups_left,
  (select count(*) from enquiries
   where regexp_replace(coalesce(doc->'customer'->>'phone', ''), '\D', '', 'g') = ''
     and coalesce(trim(doc->'customer'->>'email'), '') = ''
     and coalesce(trim(doc->>'productInterest'), '') = ''
     and coalesce(trim(doc->>'message'), '') = '') as empty_left;
