-- 0028_anu_knowledge.sql
--
-- Anu's knowledge base: what the website's voice assistant may know about the
-- catalogue, kept up to date by the database itself.
--
-- Until now Anu read products_public / categories_public at the start of each
-- call and re-read them at most once a minute, and only when she happened to
-- look a product up. A product added in the console, the phone app or a bulk
-- import during a call could stay invisible to her for the rest of it.
--
-- This table is written ONLY by triggers on products, categories and work, so
-- every insert, edit, archive, un-list or delete lands here in the same
-- transaction, whichever client made it. It is in the realtime publication, so
-- a live call is told about the change within a second and refreshes. One row
-- per record, keyed "product:<uuid>", "category:<uuid>", "work:<uuid>".
--
-- The public boundary is unchanged: each doc is rebuilt key by key from the
-- same allow-list as migration 0020 (never price, cost, HSN or GST), and only
-- what the website may show is present at all. A product that is archived,
-- drafted or hidden from the website is REMOVED from the knowledge base, so
-- Anu cannot offer it. A new field is invisible until it is named here.
--
-- anu_knowledge_version is a single counter bumped by every change, so a
-- client that missed a realtime event can tell it is stale with one tiny read.

create table if not exists public.anu_knowledge (
  id         text primary key,
  kind       text not null check (kind in ('product', 'category', 'work')),
  source_id  uuid not null,
  doc        jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists anu_knowledge_kind_idx on public.anu_knowledge (kind);

create table if not exists public.anu_knowledge_version (
  id         int primary key default 1 check (id = 1),
  version    bigint not null default 0,
  changed_at timestamptz not null default now()
);
insert into public.anu_knowledge_version (id) values (1) on conflict (id) do nothing;

-- ---- the allow-lists (one place each) ----------------------------------------

create or replace function public.anu_product_doc(d jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'name',         coalesce(d->>'name', ''),
    'sku',          coalesce(d->>'sku', ''),
    'category',     coalesce(d->>'category', ''),
    'material',     coalesce(d->>'material', ''),
    'description',  coalesce(d->>'description', ''),
    'unit',         coalesce(d->>'unit', 'pcs'),
    -- NULL, not 1, when no minimum was entered: the console's default of 1 is
    -- "nobody set one", and Anu must never tell a caller one piece is fine.
    'moq',          case when (d->>'moq') ~ '^[0-9]+(\.[0-9]+)?$' and (d->>'moq')::numeric > 1 then (d->>'moq')::numeric end,
    'leadTimeDays', case when (d->>'leadTimeDays') ~ '^[0-9]+(\.[0-9]+)?$' then (d->>'leadTimeDays')::numeric else 0 end,
    'status',       'active'
  )
$$;

create or replace function public.anu_category_doc(d jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'name',        coalesce(d->>'name', ''),
    'displayName', coalesce(d->>'displayName', ''),
    'intro',       coalesce(d->>'intro', ''),
    'sortOrder',   case when (d->>'sortOrder') ~ '^-?[0-9]+(\.[0-9]+)?$' then (d->>'sortOrder')::numeric else 0 end,
    'active',      true
  )
$$;

create or replace function public.anu_work_doc(d jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'title',     coalesce(d->>'title', ''),
    'category',  coalesce(d->>'category', ''),
    'sortOrder', case when (d->>'sortOrder') ~ '^-?[0-9]+(\.[0-9]+)?$' then (d->>'sortOrder')::numeric else 0 end,
    'active',    true
  )
$$;

-- Who may be in the knowledge base at all: the same rules as the public views,
-- written so no stored value can raise an error. This runs inside every
-- product save, and a "yes" typed into showOnWebsite must never be what stops
-- the console saving a product.
create or replace function public.anu_truthy(v text, dflt boolean) returns boolean
language sql immutable as $$
  select case
    when v is null or btrim(v) = '' then dflt
    when lower(btrim(v)) in ('false', 'f', '0', 'no', 'off') then false
    else true
  end
$$;

create or replace function public.anu_visible(kind text, d jsonb) returns boolean
language sql immutable as $$
  select case kind
    when 'product'  then coalesce(d->>'status', '') = 'active'
                         and public.anu_truthy(d->>'showOnWebsite', true)
                         and coalesce(btrim(d->>'name'), '') <> ''
    when 'category' then public.anu_truthy(d->>'active', true) and coalesce(btrim(d->>'name'), '') <> ''
    when 'work'     then public.anu_truthy(d->>'active', true) and coalesce(btrim(d->>'title'), '') <> ''
    else false
  end
$$;

-- ---- the sync trigger ----------------------------------------------------------

create or replace function public.anu_knowledge_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k       text := tg_argv[0];
  rid     uuid := coalesce(new.id, old.id);
  key     text := k || ':' || rid;
  d       jsonb;
  changed int  := 0;
begin
  begin
    if tg_op = 'DELETE' or not public.anu_visible(k, new.doc) then
      delete from public.anu_knowledge where id = key;
      get diagnostics changed = row_count;
    else
      d := case k
        when 'product'  then public.anu_product_doc(new.doc)
        when 'category' then public.anu_category_doc(new.doc)
        else public.anu_work_doc(new.doc)
      end;
      insert into public.anu_knowledge (id, kind, source_id, doc, updated_at)
      values (key, k, rid, d, now())
      on conflict (id) do update
        set doc = excluded.doc, updated_at = now()
        -- An edit to a private field (price, cost, notes) changes nothing Anu
        -- knows: leave the row alone, and do not wake every live call.
        where public.anu_knowledge.doc is distinct from excluded.doc;
      get diagnostics changed = row_count;
    end if;
    if changed > 0 then
      update public.anu_knowledge_version set version = version + 1, changed_at = now() where id = 1;
    end if;
  exception when others then
    -- The knowledge base is a copy. A failure to copy must never roll back the
    -- business write that fired it; the next edit or a re-run of the backfill
    -- below repairs the row.
    raise warning 'anu_knowledge_sync(%, %) skipped: %', k, rid, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists anu_knowledge_products on public.products;
create trigger anu_knowledge_products after insert or update or delete on public.products
  for each row execute function public.anu_knowledge_sync('product');

drop trigger if exists anu_knowledge_categories on public.categories;
create trigger anu_knowledge_categories after insert or update or delete on public.categories
  for each row execute function public.anu_knowledge_sync('category');

drop trigger if exists anu_knowledge_work on public.work;
create trigger anu_knowledge_work after insert or update or delete on public.work
  for each row execute function public.anu_knowledge_sync('work');

-- ---- backfill ------------------------------------------------------------------

delete from public.anu_knowledge;
insert into public.anu_knowledge (id, kind, source_id, doc)
  select 'product:' || p.id, 'product', p.id, public.anu_product_doc(p.doc)
  from public.products p where public.anu_visible('product', p.doc);
insert into public.anu_knowledge (id, kind, source_id, doc)
  select 'category:' || c.id, 'category', c.id, public.anu_category_doc(c.doc)
  from public.categories c where public.anu_visible('category', c.doc);
insert into public.anu_knowledge (id, kind, source_id, doc)
  select 'work:' || w.id, 'work', w.id, public.anu_work_doc(w.doc)
  from public.work w where public.anu_visible('work', w.doc);
update public.anu_knowledge_version set version = version + 1, changed_at = now() where id = 1;

-- ---- access --------------------------------------------------------------------
-- Everyone may read (it is the public catalogue); nobody may write except the
-- triggers above, which run as the owner.

alter table public.anu_knowledge enable row level security;
alter table public.anu_knowledge_version enable row level security;

drop policy if exists anu_knowledge_read on public.anu_knowledge;
create policy anu_knowledge_read on public.anu_knowledge for select to anon, authenticated using (true);
drop policy if exists anu_knowledge_version_read on public.anu_knowledge_version;
create policy anu_knowledge_version_read on public.anu_knowledge_version for select to anon, authenticated using (true);

revoke insert, update, delete on public.anu_knowledge, public.anu_knowledge_version from anon, authenticated;
grant select on public.anu_knowledge, public.anu_knowledge_version to anon, authenticated;

-- Live calls subscribe to changes. Guarded: the publication exists on every
-- Supabase project, but adding a table twice is an error.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'anu_knowledge') then
      execute 'alter publication supabase_realtime add table public.anu_knowledge';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'anu_knowledge_version') then
      execute 'alter publication supabase_realtime add table public.anu_knowledge_version';
    end if;
  end if;
end $$;
