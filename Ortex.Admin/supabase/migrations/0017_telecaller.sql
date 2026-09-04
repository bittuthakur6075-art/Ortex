-- Migration 0017: AI telecaller
--
-- Backs the Admin "Telecaller" module: an outbound AI sales agent that rings
-- leads to follow up and pitch, closes the deal or books the next step, then
-- comes back after delivery for feedback and again later to upsell.
--
-- Two collections, same {id, doc, timestamps} shape as everything else:
--
--   telecaller_jobs   one row per THING TO DO — "follow up Sanjay about 200
--                     diaries on Tuesday", "feedback call for INV-0042", "upsell
--                     Acme 30 days after their order". Carries the target, the
--                     objective, the brief context, the schedule, and the
--                     rolled-up result once the call has happened.
--   telecaller_calls  one row per ACTUAL DIAL. A job can take several attempts
--                     (no answer, busy, callback). Holds the transcript, the AI
--                     analysis and the provider's call id / recording.
--
-- Dialing itself lives in Edge Functions (telecaller-dial / -engine / -webhook)
-- because the telephony API key and the Gemini key never reach the browser.
-- Staff with the 'telecaller' module can read and queue; the engine writes with
-- the service role and bypasses RLS.

do $$
declare c text;
begin
  foreach c in array array['telecaller_jobs', 'telecaller_calls'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id         uuid primary key default gen_random_uuid(),
        doc        jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists %1$s_created_idx on public.%1$I (created_at desc);
      create trigger %1$s_touch before update on public.%1$I
        for each row execute function set_updated_at();
      alter table public.%1$I enable row level security;
    $f$, c);
  end loop;
end $$;

-- The engine sweeps "queued jobs whose scheduledAt has passed" and "calls made
-- today" on every tick; keep both cheap.
create index if not exists telecaller_jobs_status_idx on public.telecaller_jobs ((doc->>'status'));
create index if not exists telecaller_jobs_scheduled_idx on public.telecaller_jobs ((doc->>'scheduledAt'));
create index if not exists telecaller_jobs_phone_idx on public.telecaller_jobs ((doc->>'phone'));
create index if not exists telecaller_calls_job_idx on public.telecaller_calls ((doc->>'jobId'));
create index if not exists telecaller_calls_provider_idx on public.telecaller_calls ((doc->>'providerCallId'));

-- Staff with the module manage jobs (queue, reschedule, cancel). Calls are
-- read-only for staff: only the engine (service role) records a call, so a
-- transcript can never be edited from the console.
drop policy if exists staff_telecaller_jobs on public.telecaller_jobs;
create policy staff_telecaller_jobs on public.telecaller_jobs
  for all to authenticated
  using (public.has_module_access('telecaller'))
  with check (public.has_module_access('telecaller'));

drop policy if exists staff_telecaller_calls_read on public.telecaller_calls;
create policy staff_telecaller_calls_read on public.telecaller_calls
  for select to authenticated using (public.has_module_access('telecaller'));
