-- 0079_enquiry_dedupe_artwork.sql
--
-- 1. One website enquiry, one row. The site mints `doc.reference` before it
--    sends, then retries a failed or slow insert and replays its offline outbox.
--    An insert that timed out on the client can still land, so the retry made a
--    second row. A unique index on the reference turns the repeat into error
--    23505, which Ortex.Web's lib/leads.js treats as "already saved".
--    Rows without a reference (console-made enquiries, imports) are not covered.
--    If production already holds duplicates, nothing is deleted: the index then
--    covers only rows created from now on, and the notice lists how many.
--
-- 2. Artwork uploads belong to an enquiry. 0009 let anyone with the public key
--    write any file anywhere in the `artwork` bucket. Now, as 0069 does for voice
--    recordings, an anonymous upload must be the one file a Quote calculator
--    enquiry from the last two hours named in `doc.artwork.path`, under
--    `<year>/<reference>/<file>`. The site inserts the enquiry first, then uploads.
--    The bucket also stops accepting application/octet-stream: the site now sends
--    the real type for every extension it accepts.

-- ---- 1. unique reference -----------------------------------------------------------------

do $$
declare
  dupes int;
begin
  select count(*) into dupes from (
    select doc->>'reference' from public.enquiries
     where btrim(coalesce(doc->>'reference', '')) <> ''
     group by 1 having count(*) > 1
  ) d;
  if dupes = 0 then
    create unique index if not exists enquiries_reference_key
      on public.enquiries ((doc->>'reference'))
      where btrim(coalesce(doc->>'reference', '')) <> '';
  else
    raise notice '0079: % references already appear more than once; the unique index covers rows created from now on', dupes;
    execute format(
      'create unique index if not exists enquiries_reference_key on public.enquiries ((doc->>%L)) where btrim(coalesce(doc->>%L, '''')) <> '''' and created_at > %L::timestamptz',
      'reference', 'reference', now()
    );
  end if;
end $$;

-- ---- 2. artwork bound to its enquiry ----------------------------------------------------

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/postscript',   -- .ai, .eps
     'application/illustrator',
     'application/x-coreldraw',  -- .cdr
     'image/x-coreldraw',
     'application/dxf',          -- .dxf
     'image/vnd.dxf',
     'image/svg+xml',
     'image/png',
     'image/jpeg'
   ]
 where id = 'artwork';

create or replace function public.artwork_upload_expected(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
      select 1 from public.enquiries e
       where e.doc->>'reference' = split_part(p_name, '/', 2)
         and e.doc #>> '{artwork,path}' = p_name
         and e.doc->>'source' = 'Quote calculator'
         and e.created_at > now() - interval '2 hours'
    )
    and not exists (
      select 1 from storage.objects o where o.bucket_id = 'artwork' and o.name = p_name
    );
$$;
revoke execute on function public.artwork_upload_expected(text) from public;
grant execute on function public.artwork_upload_expected(text) to anon, authenticated;

drop policy if exists anon_upload_artwork on storage.objects;
create policy anon_upload_artwork on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'artwork'
    and name ~ '^[0-9]{4}/ORT-[0-9A-Z]{11}/[A-Za-z0-9_.-]{1,80}$'
    and public.artwork_upload_expected(name)
  );

-- ---- 3. anonymous enquiries are rate-limited ---------------------------------------------
--
-- Anyone with the public key could insert enquiries in a loop, and each one
-- creates a customer (upsert_customer_from) and fires a phone alert. Per IP:
-- 20 rows in 10 minutes, room for one voice call (Anu saves on each capture)
-- plus a form. Site-wide: 2000 a day, far above real traffic, so a flood from
-- many addresses stops before it buries the leads list. A refused row raises
-- P0429; the site keeps it in its outbox and retries later. A refused insert
-- rolls back its own hit, so only saved rows count. Signed-in staff are never
-- limited. The IP comes from the request headers PostgREST sets: Cloudflare's
-- header first, then the first X-Forwarded-For entry. With no headers (pg_cron,
-- the test database) only the site-wide cap applies.

create or replace function public.enquiries_anon_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_headers json;
  v_ip text;
begin
  if coalesce(auth.role(), '') <> 'anon' then
    return new;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_ip := nullif(trim(coalesce(v_headers->>'cf-connecting-ip', split_part(v_headers->>'x-forwarded-for', ',', 1))), '');
  if v_ip is not null and not public.rate_limit_hit('enq:ip:' || v_ip, 20, 600) then
    raise exception 'Too many enquiries from this address. Please try again in a few minutes.'
      using errcode = 'P0429';
  end if;
  if not public.rate_limit_hit('enq:all', 2000, 86400) then
    raise exception 'The enquiry form is busy. Please try again later.'
      using errcode = 'P0429';
  end if;
  return new;
end $$;
revoke all on function public.enquiries_anon_rate_limit() from public, anon, authenticated;

drop trigger if exists enquiries_anon_rate_limit on public.enquiries;
create trigger enquiries_anon_rate_limit
  before insert on public.enquiries
  for each row execute function public.enquiries_anon_rate_limit();
