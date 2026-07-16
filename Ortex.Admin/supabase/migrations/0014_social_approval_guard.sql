-- Migration 0014: Social approval guard
--
-- Closes an authorization gap in the social pipeline. The `social` table stores
-- everything in a single staff-writable `doc` jsonb, and the RLS policy from
-- 0013 grants full write to any authenticated user who holds the (non-admin)
-- 'social' module. That let a non-admin staffer set `doc.status='scheduled'`
-- with a past `scheduledFor` (and forge `approvedBy`/`approvedAt`) directly in
-- the database. The pg_cron sweep in the social-publish Edge Function would then
-- push that row to the company's public Instagram / Facebook Page with no admin
-- in the loop, defeating the "only an admin can approve and publish" control.
--
-- Fix: the publishable states and the approval stamp become admin-only at the
-- DB layer. Non-admin staff may draft, research, and edit ideas/drafts/reviews,
-- but cannot move a post into (or edit one already in) a publishable state, nor
-- write the approval fields the scheduler trusts. The Edge Functions run with
-- the service role (auth.uid() is null) and stay unrestricted, as do admins.

create or replace function public.social_approval_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  publishable text[] := array['approved', 'scheduled', 'published', 'failed'];
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

drop trigger if exists social_approval_guard on public.social;
create trigger social_approval_guard
  before insert or update on public.social
  for each row execute function public.social_approval_guard();
