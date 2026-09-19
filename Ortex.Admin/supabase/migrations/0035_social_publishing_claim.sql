-- 0035_social_publishing_claim.sql
--
-- A post can no longer be published twice.
--
-- social-publish used to call Meta first and write `published` afterwards. An
-- Instagram post can take a minute (Meta fetches and processes the image), the
-- scheduled sweep handled up to 10 posts, and an Edge Function is killed at
-- ~150 s. A run killed after Instagram accepted a post but before the row was
-- updated left it `scheduled`, and the next sweep posted it again. An admin
-- pressing Publish while the sweep was on the same row did the same.
--
-- The function now CLAIMS a row first: a conditional update to the new status
-- `publishing` that only succeeds if the row is still in the status it was read
-- in, so exactly one caller wins. Each platform's result is written the moment
-- it lands, so a retry only fills the gap. A row left in `publishing` (a killed
-- run) is turned into `failed` by the next sweep, with a message asking a person
-- to look before retrying, never re-sent automatically.
--
-- This migration adds `publishing` to the statuses only an admin (or the
-- service role) may set or edit, next to approved / scheduled / published /
-- failed (0013's RLS helper and 0014's trigger). Both are `create or replace`,
-- so running it twice is harmless (it was applied by hand on 2026-09-19).

create or replace function public.social_status_allowed(p_doc jsonb)
returns boolean language sql stable as $$
  select coalesce(p_doc->>'status', 'idea') not in ('approved', 'scheduled', 'publishing', 'published')
         or public.is_admin();
$$;

create or replace function public.social_approval_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  publishable text[] := array['approved', 'scheduled', 'publishing', 'published', 'failed'];
  new_status  text := new.doc->>'status';
  old_status  text := case when tg_op = 'UPDATE' then old.doc->>'status' else null end;
begin
  -- Trusted writers: the service role (Edge Functions; auth.uid() is null) and
  -- active admins may set any status and any approval provenance.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  -- Non-admin staff may not move a post into a publishable state, nor edit one
  -- that is already there (which would let them swap the creative after approval).
  if new_status = any(publishable) or old_status = any(publishable) then
    raise exception 'Only an admin can approve, schedule, publish, or edit an approved social post'
      using errcode = '42501';
  end if;

  -- ...and may not forge the approval stamp the scheduler re-verifies.
  if coalesce(new.doc->>'approvedBy', '') <> '' or coalesce(new.doc->>'approvedAt', '') <> '' then
    raise exception 'Only an admin can set social post approval details'
      using errcode = '42501';
  end if;

  return new;
end $$;
