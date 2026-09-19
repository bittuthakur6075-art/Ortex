# Meta setup for the Social module

The Social module in `Ortex.Admin` can research ideas and design creatives the
moment the Gemini key is set. **Publishing needs this document done first.** None
of it can be automated from here: it is account work in Meta's own consoles, and
part of it is a review queue staffed by Meta.

Budget a few days. The App Review step is the long pole and it is out of our
hands.

---

## What has to be true before a post can go live

Meta will not let an API publish to a personal Instagram profile. Ever. The
account has to be a Business or Creator account, and it has to be attached to a
Facebook Page. That is the whole reason for steps 1 and 2.

---

## 1. Convert the Instagram account

In the Instagram mobile app, on the company account:

1. **Settings and privacy → Account type and tools → Switch to professional account**
2. Choose **Business** (Creator works, but Business is the right fit for Ortex).
3. When it offers to connect a Facebook Page, connect the Ortex Page. If you skip
   it here, do step 2 below.

Nothing about the public profile changes except that it gains contact buttons.

## 2. Link Instagram to the Facebook Page

From the Facebook Page (desktop):

1. **Settings → Linked accounts → Instagram**
2. **Connect account**, sign in as the Ortex Instagram account.

Verify the link took: the Page's Instagram tab should show the handle.

## 3. Create the Meta app

At <https://developers.facebook.com/apps>:

1. **Create app → Business** type.
2. Name it something like `Ortex Admin Publisher`. Nobody outside sees this.
3. Add the **Instagram Graph API** and **Facebook Login for Business** products.
4. Note the **App ID** and **App Secret** (Settings → Basic).

## 4. Request the permissions

The module needs exactly these four:

| Permission | Why |
| --- | --- |
| `instagram_basic` | Read the linked IG account |
| `instagram_content_publish` | Create and publish IG posts |
| `pages_show_list` | Find the Page |
| `pages_manage_posts` | Post to the Page |

While the app is in **Development** mode these work immediately, but **only for
users with a role on the app** (admin, developer, tester). That is enough to test
the whole pipeline end to end against the real Ortex accounts, as long as you are
an app admin.

To publish on an ongoing basis without every operator needing an app role, the
app has to go **Live**, which means **App Review** for `instagram_content_publish`
and `pages_manage_posts`. Meta wants a screencast showing the flow and a written
use case. Turnaround is typically a few business days and rejection is common on
the first pass, usually for a vague screencast. Show the actual approve-then-
publish click path in the Admin.

Also required before going Live: **Business Verification** of Ortex Industries
(Meta Business Suite → Settings → Business info). This needs a document showing
the legal entity name and address, e.g. a GST certificate or utility bill.

## 5. Get the IDs and the token

### Page ID
Facebook Page → **About** → Page ID. Or via the Graph API Explorer: `GET /me/accounts`.

### Instagram User ID
In the [Graph API Explorer](https://developers.facebook.com/tools/explorer/),
with the Page token selected:

```
GET /<PAGE_ID>?fields=instagram_business_account
```

The returned `instagram_business_account.id` (a 17-digit number starting `1784…`)
is the `META_IG_USER_ID`. This is **not** the same as the handle or the number you
see anywhere in the Instagram app.

### Long-lived Page access token

Short-lived tokens die in about an hour, which is useless for a scheduler. Get a
long-lived one:

1. In Graph API Explorer, select the app, add the four permissions, **Generate
   Access Token**, and log in as a user who is an admin of the Page.
2. Exchange the short-lived user token for a long-lived user token (about 60 days):

   ```
   GET https://graph.facebook.com/v25.0/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=<APP_ID>
     &client_secret=<APP_SECRET>
     &fb_exchange_token=<SHORT_LIVED_USER_TOKEN>
   ```

3. Use that long-lived **user** token to fetch the **Page** token:

   ```
   GET https://graph.facebook.com/v25.0/me/accounts?access_token=<LONG_LIVED_USER_TOKEN>
   ```

   The `access_token` on the Ortex Page entry is what you want. A Page token
   derived from a long-lived user token **does not expire** as long as the user
   stays a Page admin and does not change their password.

That last point is the failure mode to remember: **if the admin whose token this
is changes their Facebook password, or loses Page admin, publishing stops.**
Derive the token from an account that will not churn, and expect to redo this
step if it ever does. `social-publish` surfaces Meta's own error message, so an
expired token shows up in the module as a readable failure rather than silence.

Verify a token any time at <https://developers.facebook.com/tools/debug/accesstoken/>.

## 6. Set the secrets

From `C:\Dev\Ortex\Ortex.Admin`:

```bash
supabase secrets set META_ACCESS_TOKEN=<long-lived-page-token>
supabase secrets set META_IG_USER_ID=<17841...>
supabase secrets set META_PAGE_ID=<page-id>
# optional, defaults to v25.0 (v21.0 stops working on 21 Jan 2027)
supabase secrets set META_GRAPH_VERSION=v25.0
# the scheduled sweep's own key (any long random string), see step 8
supabase secrets set SOCIAL_CRON_SECRET=<random-string>

# the research half (captions and ideas)
supabase secrets set GEMINI_API_KEY=<google-ai-studio-key>
# the creative half runs on Cloudflare Workers AI (FLUX.2 klein / FLUX.1 schnell),
# the same two secrets the product photo studio uses:
supabase secrets set CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token>
```

These live only in Supabase. The browser never sees them, which is why publishing
is an Edge Function and not a fetch from the module.

## 7. Deploy

This repo has never been linked to the Supabase CLI (there is no
`supabase/config.toml`), so every command below passes `--project-ref`
explicitly. Your project ref is the subdomain of `VITE_SUPABASE_URL` in `.env`:
`https://<project-ref>.supabase.co`.

First, authenticate once. This opens a browser, so run it yourself rather than
through an agent:

```bash
supabase login
```

Then apply the two migrations. **Read them before running them**, `0013` creates
the `social` table and a public storage bucket, `0014` adds the approval guard:

```bash
supabase db push --project-ref <project-ref>
```

If `db push` balks because the remote already has the first twelve migrations
applied out-of-band, the fallback is to paste `0013_social.sql` and
`0014_social_approval_guard.sql` into the SQL editor in the Supabase dashboard,
in that order. That is almost certainly how the existing twelve got there.

Then the functions:

```bash
supabase functions deploy social-researcher --project-ref <project-ref>
supabase functions deploy social-creative   --project-ref <project-ref>
supabase functions deploy social-publish    --project-ref <project-ref>
```

Secrets in step 6 take the same `--project-ref` flag.

## 8. Scheduling (optional)

Scheduled posts need something to wake `social-publish` up: a `pg_cron` job.
It proves itself with the `SOCIAL_CRON_SECRET` from step 6 in an
`x-social-secret` header, with the public anon key as the bearer, so the
service-role key never sits in `cron.job` (anyone who can read that table could
lift it). An older job that passes the service-role key still works.

In the Supabase SQL editor:

```sql
select cron.schedule(
  'social-publish-due',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/social-publish',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-social-secret', '<SOCIAL_CRON_SECRET>'
    ),
    body    := jsonb_build_object('mode', 'due')
  );
  $$
);
```

Every 15 minutes it publishes approved posts whose scheduled time has passed. A
post only enters `scheduled` after an admin has approved it, so the cron cannot
publish anything a human has not already signed off.

A post can never go out twice (migration 0035): each one is claimed (status
`publishing`) before Meta is called, every platform's result is saved the moment
it lands, and a retry skips platforms that already have a post. If a run is
killed mid-way, the next sweep marks that post `failed` with a note to check
Instagram and Facebook before pressing Publish again; it is never re-sent on its
own. A post whose approver is no longer an active admin is marked `failed` with
that reason rather than skipped in silence.

---

## Meta's rules that bite

- **25 posts per 24 hours** per Instagram account via the API. The module does
  not throttle; you will just get an error from Meta at the cap.
- The image must be **JPEG**, reachable at a **public URL**, and under **8 MB**.
  Meta fetches it from our `social-media` bucket, which is why that bucket is
  public. Anything written there should be considered public immediately.
- Instagram captions cap at 2,200 characters and 30 hashtags.
- Instagram strips nothing but rejects a lot. A container that goes to `ERROR`
  usually means the image failed its fetch or format check.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `(#200) Requires instagram_content_publish` | Permission not granted, or app in Development mode and the caller has no app role |
| `The user is not an Instagram Business` | Step 1 was not completed, or the link in step 2 broke |
| Container stuck `IN_PROGRESS` | Meta cannot fetch the image URL. Check the bucket is public |
| `Error validating access token` | Token expired or the deriving admin changed their password. Redo step 5 |
| `media_publish` 400 with no detail | Almost always the 25/day cap |
