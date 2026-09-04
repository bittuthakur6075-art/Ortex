# AI Telecaller — setup guide

The Telecaller module in the Admin console is an outbound AI sales agent. It
rings leads to follow up and pitch, closes or books the next step, comes back
after delivery for feedback, and returns later to upsell so one-time buyers
become repeat customers. Every call lands in the console with a transcript, a
structured outcome and the next action for the human team.

## How it works

```
Leads / Voice Leads / Enquiries / Invoices
        │  (auto-queued by the engine, or "AI call" pressed by staff)
        ▼
 telecaller_jobs  ──►  telecaller-dial / telecaller-engine
                            │ builds the brief (history + catalogue + pitch notes)
                            ▼
                    provider: simulate ─── Gemini role-plays the customer (no phone)
                              vapi ─────── real outbound call ──► telecaller-webhook
                            │
                            ▼
                     Gemini analysis: outcome, items, callback time, rating…
                            │
                            ▼
 telecaller_calls (transcript) + lead / enquiry updated + NEXT job scheduled
        (callback → follow-up rounds → feedback → upsell every N days)
```

* **Jobs** (`telecaller_jobs`) are things to do: who, why (`followup`, `pitch`,
  `feedback`, `upsell`, `manual`), when, and the rolled-up result.
* **Calls** (`telecaller_calls`) are dial attempts with the transcript, the
  provider's recording and the analysis.
* **Settings → Telecaller** (edited on the Agent tab) holds the persona,
  language, calling window, attempts, cadences, pitch notes and do-not-call
  list. The Edge Functions read the same block.

Nothing rings on its own until **Automatic calling** is switched on in the
Agent tab; the "AI call" / "Call now" buttons always work.

## 1. Database

Apply the migration (Supabase SQL editor or CLI):

```bash
cd Ortex.Admin
supabase db push --project-ref <ref>          # applies 0017_telecaller.sql
```

Give sales users the module under **Users → modules → Telecaller**. Admins
have it automatically.

## 2. Edge Functions and secrets

```bash
cd Ortex.Admin
for fn in telecaller-dial telecaller-engine telecaller-webhook; do
  supabase functions deploy "$fn" --project-ref <ref>
done

# Gemini is used for the brief, the transcript analysis and the simulator.
supabase secrets set GEMINI_API_KEY=... --project-ref <ref>

# Shared secret the phone provider must echo back to the webhook.
supabase secrets set TELECALLER_WEBHOOK_SECRET="$(openssl rand -hex 24)" --project-ref <ref>
```

That is enough to run in **Simulate** mode: Gemini plays the customer, the
full pipeline (brief → transcript → analysis → lead update → next job) runs,
and no phone rings. Use it to tune the persona and pitch notes before spending
on minutes.

## 2b. Practice and training (free, no phone)

**Practice** on the Telecaller page (header button, the mic icon on any queued
job, or "Practice a call now" under Agent → Training) opens a browser call:
you speak as the customer through your microphone and the agent answers out
loud through Gemini Live, using the same model and token flow as Live Orty on
the website and the exact brief a phone call would get. Both sides are
transcribed live. On hang-up the transcript is analysed and saved as a
practice call, and the lead / next job move exactly as they would after a real
call, so rehearse against a scratch contact (your own number is fine, nothing
rings) unless you mean it.

Training is prompt work, not model training. Under **Agent → Training** you
can write the persona (tone, phrases to use and avoid, language switching) and
a script per call type (follow-up, pitch, feedback, upsell). Blank fields keep
the built-in playbook. Pitch notes carry current offers. The loop: save,
practice, read the transcript and analysis, refine, repeat.

Gemini Live cannot reach the telephone network; to ring a real phone you need
a telephony provider (section 3).

## 3. Real calls (Vapi)

1. Create a [Vapi](https://vapi.ai) account, add a phone number (import an
   Indian number from your telephony provider, or buy one), and copy its
   **Phone Number ID** and your **API key**.
2. Set the secrets:
   ```bash
   supabase secrets set VAPI_API_KEY=... VAPI_PHONE_NUMBER_ID=... --project-ref <ref>
   # optional: use a dashboard-built assistant for voice / transcriber / recording
   supabase secrets set VAPI_ASSISTANT_ID=... --project-ref <ref>
   ```
   Without `VAPI_ASSISTANT_ID` the dial creates a transient assistant per call
   (Gemini 2.5 Flash model, Deepgram Hindi transcription, Azure `hi-IN-Swara`
   or `en-IN-Neerja` voice). With it, the call uses your assistant and only the
   system prompt, first message and webhook are overridden.
3. In the Admin **Telecaller → Agent** tab set **Provider = Vapi** and save.
4. The webhook URL is `https://<ref>.supabase.co/functions/v1/telecaller-webhook`.
   The dial request passes it to Vapi with the shared secret and the anon key
   header, so no dashboard configuration is needed. If Vapi cannot send custom
   headers on your plan, redeploy the webhook with
   `supabase functions deploy telecaller-webhook --no-verify-jwt`; the shared
   secret still protects it.

Vapi's payload field names (`message.type`, `artifact.messages`,
`endedReason`, `recordingUrl`) are read defensively; if a field is missing the
call still completes with whatever transcript text arrived.

## 4. Scheduling the sweep

The engine must be woken up to queue follow-ups, feedback and upsell calls and
to dial what is due. Enable `pg_cron` and `pg_net` once, then schedule it. The
job authenticates with the public anon key plus the shared secret, so the
service-role key never sits in `cron.job` (Supabase SQL editor):

```sql
select cron.schedule(
  'telecaller-sweep',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/telecaller-engine',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-telecaller-secret', '<TELECALLER_WEBHOOK_SECRET>'
    ),
    body    := jsonb_build_object('mode', 'sweep')
  );
  $$
);
```

Each tick, inside the calling window (default 10:00–19:00 IST, never Sunday)
and under the daily cap, the engine:

| Source | Rule | Job |
| --- | --- | --- |
| Leads in `new` / `contacted` with a valid mobile and no follow-up due later | no open job for the number | `followup` |
| Enquiries (website, IndiaMART, voice leads) still `new` after 2 hours | no job for that enquiry | `followup` |
| Invoices older than **feedback.daysAfterInvoice** (7) | one per invoice | `feedback` |
| Invoices older than **upsell.daysAfterInvoice** (30), no newer order | at most one per **repeatEveryDays** (90) | `upsell` |

Outcomes drive the next call automatically: `callback` books the agreed time,
`interested` / `needs_quote` schedule the next follow-up round (up to
**maxRounds**), `deal_closed` schedules a feedback call, a good feedback call
schedules the first upsell, and each upsell call schedules the next one.
`no_answer` / `busy` retry after **retryGapHours** up to **maxAttempts**.
`do_not_call` adds the number to the do-not-call list immediately.

"Run sweep" in the console does the same on demand (an admin can force it
outside hours).

## 5. What the human team does

The **Calls → Needs a human** filter is the daily worklist:

* **Deal closed / Needs quote** → open the lead, create the quotation, send the
  mockup on WhatsApp (the drawer's WhatsApp button pre-fills the message).
* **Complaint** → a human calls back the same day; the invoice carries the
  feedback rating and notes.
* Press **Handled** once done so it drops off the list.

Lead activities, stage changes and `nextFollowUp` are written by the engine, so
the Leads board and the overdue bell stay in step with what the agent did.
