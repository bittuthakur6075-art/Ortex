-- 0020_public_catalogue_views.sql
--
-- Two problems with how the marketing site read the catalogue.
--
-- 1) It read `public.products` directly and selected the whole JSONB doc, so
--    every anonymous visitor could open devtools and read basePrice, costPrice,
--    hsn and gstRate. Row-level security cannot help here: the policy decides
--    which ROWS you see, never which KEYS of a jsonb column. Commercial terms
--    belong to the console, not the website.
--
-- 2) "Hide this from the website" and "stop selling this" were the same switch
--    (status = active). A product can be perfectly sellable over the phone and
--    still not belong in the public catalogue.
--
-- Both are fixed by exposing purpose-built views instead of the tables. The
-- views are owned by postgres and deliberately run with the owner's rights
-- (security_invoker off, the default), so anon reads pass through them without
-- needing any policy on the underlying table -- and can therefore see nothing
-- the view does not hand out. The anon policies on the tables are dropped, so
-- the raw docs are now staff-only.
--
-- doc->>'showOnWebsite' is the new visibility switch. Absent means visible, so
-- every existing product keeps its current behaviour without a backfill.

-- ---- products ---------------------------------------------------------------
drop view if exists public.products_public;
create view public.products_public as
  select
    p.id,
    -- Rebuilt key by key. An allow-list, not a deny-list: a field added to the
    -- product doc later is invisible to the website until it is named here.
    jsonb_build_object(
      'name',         coalesce(p.doc->>'name', ''),
      'sku',          coalesce(p.doc->>'sku', ''),
      'category',     coalesce(p.doc->>'category', ''),
      'material',     coalesce(p.doc->>'material', ''),
      'description',  coalesce(p.doc->>'description', ''),
      'unit',         coalesce(p.doc->>'unit', 'pcs'),
      'moq',          coalesce((p.doc->>'moq')::numeric, 1),
      'leadTimeDays', coalesce((p.doc->>'leadTimeDays')::numeric, 0),
      'images',       coalesce(p.doc->'images', '[]'::jsonb),
      'status',       'active'
    ) as doc
  from public.products p
  where p.doc->>'status' = 'active'
    and coalesce((p.doc->>'showOnWebsite')::boolean, true);

-- ---- categories -------------------------------------------------------------
-- Same treatment: the category doc carries default HSN/GST and private internal
-- notes, none of which the site needs.
drop view if exists public.categories_public;
create view public.categories_public as
  select
    c.id,
    jsonb_build_object(
      'name',           coalesce(c.doc->>'name', ''),
      'slug',           coalesce(c.doc->>'slug', ''),
      'displayName',    coalesce(c.doc->>'displayName', ''),
      'intro',          coalesce(c.doc->>'intro', ''),
      'image',          coalesce(c.doc->>'image', ''),
      'seoTitle',       coalesce(c.doc->>'seoTitle', ''),
      'seoDescription', coalesce(c.doc->>'seoDescription', ''),
      'sortOrder',      coalesce((c.doc->>'sortOrder')::numeric, 0),
      'active',         true
    ) as doc
  from public.categories c
  where coalesce((c.doc->>'active')::boolean, true);

grant select on public.products_public   to anon, authenticated;
grant select on public.categories_public to anon, authenticated;

-- The website no longer touches the tables, so close the anonymous door on
-- them. Staff policies (0007) are untouched.
drop policy if exists anon_select_products   on public.products;
drop policy if exists anon_select_categories on public.categories;
