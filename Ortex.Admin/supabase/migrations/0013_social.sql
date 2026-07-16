-- Migration 0013: Social media post pipeline
--
-- Backs the Admin "Social" module: AI-researched post ideas, AI-generated ad
-- creatives, and publishing to Instagram + the Facebook Page via the Meta Graph
-- API. Same {id, doc, timestamps} shape as every other collection.
--
-- Unlike work/products, nothing here is website-facing, so there is NO anon
-- policy — an unpublished creative and its caption are internal until Meta has
-- it. Staff with the 'social' module draft and research; only an admin may
-- approve and publish (enforced in the social-publish Edge Function, which is
-- the only thing holding the Meta token).

create table if not exists public.social (
  id         uuid primary key default gen_random_uuid(),
  doc        jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists social_created_idx on public.social (created_at desc);
create trigger social_touch before update on public.social
  for each row execute function set_updated_at();
alter table public.social enable row level security;

-- Due-post sweeps query by status + scheduled time; keep that cheap.
create index if not exists social_status_idx on public.social ((doc->>'status'));

-- Signed-in staff with the 'social' module can read, create, and edit posts, but
-- only an admin may move a post into a status that can reach Meta. Publishing
-- itself lives in the social-publish Edge Function because the browser never
-- holds the Meta token; this policy is the matching gate on the data side.
--
-- The scheduled sweep in social-publish publishes any row it finds in status
-- 'scheduled' with the service role, unattended. Without this gate a non-admin
-- with the module could set status='scheduled' directly (module access was the
-- only check) and have the sweep push it live with no admin approval. So the
-- privileged statuses (approved, scheduled, published) require is_admin();
-- everything up to 'review' stays open to any social-module staffer. The
-- service role, used by social-publish to stamp published/failed, bypasses RLS.
create or replace function public.social_status_allowed(p_doc jsonb)
returns boolean language sql stable as $$
  select coalesce(p_doc->>'status', 'idea') not in ('approved', 'scheduled', 'published')
         or public.is_admin();
$$;

drop policy if exists staff_social on public.social;
drop policy if exists staff_social_read on public.social;
drop policy if exists staff_social_insert on public.social;
drop policy if exists staff_social_update on public.social;
drop policy if exists staff_social_delete on public.social;

create policy staff_social_read on public.social
  for select to authenticated using (public.has_module_access('social'));

create policy staff_social_insert on public.social
  for insert to authenticated
  with check (public.has_module_access('social') and public.social_status_allowed(doc));

create policy staff_social_update on public.social
  for update to authenticated
  using (public.has_module_access('social'))
  with check (public.has_module_access('social') and public.social_status_allowed(doc));

create policy staff_social_delete on public.social
  for delete to authenticated using (public.has_module_access('social'));

-- Creative storage -----------------------------------------------------------
--
-- PUBLIC bucket, and it has to be: the Instagram Content Publishing API does not
-- accept an upload. You hand it an `image_url` and Meta's servers fetch the
-- bytes themselves, so the creative must be readable by an anonymous stranger
-- for the few minutes the container is being processed. Treat anything in this
-- bucket as already public the moment it is written.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-media',
  'social-media',
  true,
  8388608, -- 8 MB; Instagram rejects feed images over 8 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may read — this is what lets Meta fetch the creative.
drop policy if exists public_read_social_media on storage.objects;
create policy public_read_social_media on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'social-media');

-- Only active staff may upload (the social-creative function writes with the
-- service role, which bypasses RLS; this covers manual uploads from the module).
drop policy if exists staff_upload_social_media on storage.objects;
create policy staff_upload_social_media on storage.objects
  for insert to authenticated
  with check (bucket_id = 'social-media' and public.is_active_staff());

drop policy if exists staff_update_social_media on storage.objects;
create policy staff_update_social_media on storage.objects
  for update to authenticated
  using (bucket_id = 'social-media' and public.is_active_staff());

drop policy if exists staff_delete_social_media on storage.objects;
create policy staff_delete_social_media on storage.objects
  for delete to authenticated
  using (bucket_id = 'social-media' and public.is_active_staff());
