# Environments — Development, Staging & Production

**One Supabase project, and it is production.** The original project holds the
live quotations, invoices, payments and customers, so it *is* production — no
data was migrated to get there. Development and staging use no database at all:
with no credentials configured the app falls back to `localStore` (browser
localStorage) and runs on demo data.

That fallback is the whole isolation story, and it is a strong one. Local work
cannot read a real customer, cannot write a real invoice, and cannot advance the
live GST document counter, because there is no connection to advance it through.
It also costs nothing, which keeps the Supabase free plan's project allowance
free for when a real staging database is actually wanted.

| Environment     | Who uses it      | Hosting                | Backend                  | Command                   | Env badge    |
| --------------- | ---------------- | ---------------------- | ------------------------ | ------------------------- | ------------ |
| **Development** | Your machine     | `localhost:5180`       | localStorage, demo data  | `npm run dev`             | `Local demo` |
| **Staging**     | Team review      | Vercel (`ortex-admin`) | localStorage, demo data  | `npm run build:staging`   | `Staging`    |
| **Production**  | The business     | Hostinger subdomain    | **the Supabase project** | `npm run build`           | (none)       |

Signing in locally uses the offline passphrase gate, not Supabase auth: any
email plus `ortex@admin`. The login screen says so when no database is
configured.

The frontend picks its backend at **build time** from `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`, which come from a per-mode env file (local) or the
host's environment variables (Vercel).

## Giving someone a sandbox with sample data

To let a colleague explore every module — or to demo the console — without
letting them near the live ledger, hand them a **staging build**. It is the
same application, running entirely on demo data in their own browser.

```bash
cd Ortex.Admin
npm run build:staging     # .env.staging has empty Supabase values
```

Then deploy `dist/` anywhere static (a Vercel project, or a second Hostinger
subdomain). They sign in with any email plus the offline passphrase
`ortex@admin`, and click **Load demo data** on the Dashboard to populate
enquiries, quotations, GST invoices and payments.

### Why this is safe, and why it is not "multi-user"

Isolation here is physical, not a permission rule. With no credentials
configured, `hasSupabase = Boolean(url && anonKey)` is false, `repository.js`
resolves to `localStore`, and no Supabase client is ever constructed. The
bundle contains **no project URL and no anon key**, so there is no route to
production to misuse — verify it yourself on any build:

```bash
grep -rc "supabase.co" dist/        # expect 0
```

That also means the sample user cannot advance the live document counter.
`next_sequence()` keys on the series name alone (one row for `invoice`, one for
`quotation`), so a sample invoice raised against production would consume a
real GST number and leave a permanent gap when deleted. The localStorage build
keeps its own counter and cannot touch that one.

What it is **not** is per-user data separation inside one database. Every
business table is `(id uuid, doc jsonb, …)` with a single policy —
`create policy staff_all … using (true) with check (true)` — so every
authenticated user sees every row, and no column records who created what.
Giving one user their own slice of the live database would mean adding an
ownership column to all 19 tables, rewriting all 19 policies, making the
numbering counter scope-aware, and auditing the Edge Functions that use the
service-role key and bypass RLS entirely. Worth doing deliberately if you ever
need real multi-tenancy; not worth bolting onto a live GST ledger.

The one limitation to mention when you hand it over: the data lives in that
browser profile. It is not shared between their devices, and clearing site data
resets it. **Load demo data** rebuilds it in a click.

---

## How the build modes work

Vite loads `.env` in **every** mode, then lets `.env.<mode>` override it:

| Command                                      | Mode          | Files loaded                |
| -------------------------------------------- | ------------- | --------------------------- |
| `npm run dev`                                | `development` | `.env` → `.env.development` |
| `npm run dev:staging`                        | `staging`     | `.env` → `.env.staging`     |
| `npm run build:staging`                      | `staging`     | `.env` → `.env.staging`     |
| `npm run build` / `npm run build:production` | `production`  | `.env` → `.env.production`  |

`.env.development` and `.env.staging` hold the **same** URL and anon key. The
only difference between them is `VITE_ENV_LABEL`, which drives the badge.

> **The trap this repo guards against.** Because `.env` is loaded in every mode,
> a missing `.env.production` means a production build silently falls back to
> `.env`, which is empty — so it would ship with no database at all, silently
> serving demo data as if it were your live records. Every
> build script therefore runs `scripts/check-env.mjs` first, which refuses to
> build when the mode's env file is missing, still holds a placeholder, or
> points at the same project as `.env.development` / `.env.staging`. It
> deliberately allows dev and staging to match. Run it alone with
> `npm run check:env`.

Env files are git-ignored. Committed templates: `.env.development.example`,
`.env.staging.example`, `.env.production.example` — copy each to the matching
`.env.<mode>` and fill in that environment's values.

---

## Standing up a new environment

Everything the schema needs is in this repo, so a fresh project is one command.

You do not need this today. Production is the original project and already
carries the schema, the functions and the data, and development runs on
localStorage. This section is for the day you want a **real staging database**
that several reviewers share, or a second environment for any other reason.

### 1. Create the project

Supabase Dashboard → **New project**. Pick the region closest to your users
(`ap-south-1`, Mumbai) and save the database password somewhere safe. Copy the
**project ref** from Settings → General (the `xxxx` in `xxxx.supabase.co`).

### 2. Push the schema and functions

```bash
cd Ortex.Admin
supabase login                      # once per machine
npm run provision -- <project-ref>  # link + db push + deploy every function
```

`scripts/provision-supabase.mjs` applies all migrations in
`supabase/migrations/` and deploys every folder in `supabase/functions/`
(skipping `_shared`, which is a library). Add `--dry-run` to see the commands
first. The steps are idempotent — safe to re-run after a failure.

> `supabase link` rewrites this checkout's CLI link state. After provisioning a
> different project, re-link to the one you normally work against.

### 3. Set the secrets

Edge Function secrets are per project, so a new project starts with none:

```bash
supabase secrets set GEMINI_API_KEY=...    --project-ref <project-ref>
supabase secrets set META_ACCESS_TOKEN=... --project-ref <project-ref>
supabase secrets set INDIAMART_CRM_KEY=... --project-ref <project-ref>
```

### 4. Lock down auth

Dashboard → Authentication → Providers → Email →
**"Allow new users to sign up" = OFF**. The console is invite-only. The database
enforces this regardless (profiles start inactive since migrations 0015/0016,
and only `admin-create-user` activates them), but turning signup off also stops
strangers creating orphan auth users with the public anon key.

### 5. Point the front end at it

```bash
cp .env.production.example .env.production   # then fill in URL + anon key
npm run check:env                            # confirms production has real credentials
```

Do the same in `Ortex.Web` — the marketing site reads the catalogue and inserts
leads, and its `scripts/prerender.mjs` bakes the live catalogue into the static
HTML at build time, so a build with dev credentials would publish dev products.

### 6. Create the first admin

A new database starts empty, including users. Create the account in Dashboard →
Authentication → Users, then activate it (profiles are inactive by default)
either by calling `admin-create-user` or by flipping the row's flag in the
`profiles` table.

---

## Deploying

### Staging (Vercel)

> **Action outstanding.** The Vercel project's environment variables still hold
> the original project's URL and anon key, and that project is now production.
> Until they are changed, every staging deploy reads and writes live invoices,
> payments and customers.

Project → Settings → Environment Variables (Production + Preview). Pick one:

- **Demo staging (recommended while piloting).** Delete `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` entirely, and set `VITE_ENV_LABEL` to `Staging`. The
  deploy then behaves like local development: demo data on localStorage, and no
  route to the live database. Reviewers can exercise every screen safely.
- **Real staging data.** Create a second Supabase project, provision it with
  `npm run provision -- <ref>`, and point the two variables at it. Only worth it
  once several people need to review against shared, persistent records.

Never leave those variables pointing at the production project.

The build command is already `npm run build:staging` (`vercel.json`), and
Vercel auto-deploys on push to the connected branch. The whole site is
`noindex`, so it stays out of search.

This same deploy is what you hand a sample user — see "Giving someone a sandbox
with sample data" above.

### Production (Hostinger subdomain)

A static upload, no git auto-deploy:

1. On the build machine, fill in `.env.production` (step 5 above).
2. `npm run build` — the env check runs first and refuses a build that has no
   production credentials of its own.
3. Upload the **contents of `dist/`** to the subdomain's web root
   (e.g. `admin.ortexindustries.in`). `dist/.htaccess` ships automatically and
   provides SPA routing, `X-Robots-Tag: noindex`, and asset caching.
4. Point the subdomain at that folder and enable SSL.

---

## Everyday workflow

1. Work locally on demo data: `npm run dev`. The **Local demo** badge in the
   sidebar confirms you are not on a real database.
2. Push to the staging branch → Vercel redeploys staging automatically, also on
   demo data, badged **Staging**.
3. Apply a migration or function to production with
   `npm run provision -- <production-ref>`.
4. Then `npm run build` and re-upload `dist/`.

Because production is the only database, "apply it everywhere" means running
the provision step exactly once. The trade-off is that a migration gets no
rehearsal against real data before it lands on production — so read your SQL
carefully, and take a backup (`npm run backup`) before anything destructive.

## Maintenance

### Backups

The free plan has no automated backup, and this database holds GST invoices and
payment records you are required to retain. Close that gap yourself:

```bash
cd Ortex.Admin
npm run backup                  # → backups/ortex-<timestamp>.json
npm run backup -- --out D:/Ortex-backups
```

It reads every table through the REST API with the service-role key, so no
Postgres client tools are needed. Add the key to `.env.production` once:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # Dashboard → Settings → API → service_role
```

It is not `VITE_`-prefixed, so Vite never bundles it into the browser build.

What this captures is your data. The schema lives in `supabase/migrations/`, so
a full restore is `npm run provision -- <ref>` followed by loading the JSON
back. Auth users and Storage objects are not included.

#### Running it daily

```bash
npm run backup:schedule                 # daily at 20:00
npm run backup:schedule -- -At 02:30    # pick another time
npm run backup:schedule -- -Remove      # unregister
```

That registers a Windows scheduled task, **Ortex Admin - Daily DB Backup**,
which runs `scripts/backup-daily.cmd` → `npm run backup -- --keep 30`. No
administrator rights are needed: the task is registered with an Interactive
principal, so it runs while you are signed in. `StartWhenAvailable` means a run
missed because the machine was off fires as soon as you next sign in, rather
than being skipped.

Every run appends to `backups/backup.log`, including failures and the exit
code. A scheduled task has no window, so without that log a job that started
failing months ago looks exactly like one that is working — check it
occasionally, or after any change to `.env.production`.

`--keep 30` prunes the oldest dumps once the new one is safely written, so the
folder settles at a month of history. The pruning decision is `selectStale()`
in `scripts/prune.mjs`, kept separate and covered by `scripts/prune.test.js`
because it is the only code here that deletes data unattended: it never removes
the newest file, ignores anything that is not one of our dumps, and prunes
nothing at all if `--keep` is malformed rather than treating it as zero.

Backups on the same machine as nothing else are only half a backup. **Copy them
off** — your Hostinger storage, OneDrive, anywhere that fails independently of
this PC. Point the task at a synced folder to do it automatically:

```bash
npm run backup -- --out "C:/Users/<you>/OneDrive/Ortex-backups" --keep 30
```

### Auth email templates

Sign-in uses an emailed 6-digit code: `src/lib/auth.js` calls `signInWithOtp()`
and verifies with `verifyOtp({ token, type: "email" })`. Supabase decides
whether to mail a **code** or a **link** purely from what the template
references — the stock one renders `{{ .ConfirmationURL }}`, so a fresh project
mails a link the console cannot accept, and the login screen sits waiting for
digits that never arrive.

`supabase/templates/magic-link.html` is the template that fixes this. Paste it
into Dashboard → Authentication → Emails → **Magic Link**, and set the subject
to *Your Ortex sign-in code*.

Keep `{{ .ConfirmationURL }}` out of it. Referencing both mails both, and the
link is the riskier half: it redirects to the project's Site URL, so it fails
from localhost or any preview deploy, and it is a bearer credential sitting in
an inbox for as long as the code lives.

Supabase does not deploy templates from this repo, so the dashboard is a copy.
Edit the file here whenever you change the dashboard, or the next person finds
no history. While you are on that screen, check **Email OTP Expiration** under
Authentication → Sessions — the default 3600s is a long life for a code that
opens the live ledger; 600s is a saner ceiling.

### Removing the demo data

`supabase/maintenance/remove-demo-data.sql` deletes the sample records that
`seedDemo()` created, leaving only real business data. Run it in the Supabase
SQL Editor: step 1 previews, step 2 deletes, step 3 verifies.

It matches on the fabricated demo emails and product SKUs rather than on ids,
because the seed's readable ids never reach Supabase — `apiStore.toDoc()` strips
the id before insert and the column is a uuid, so every seeded row lands with a
fresh `gen_random_uuid()`. Take a backup first, and read the preview output
before uncommenting step 2.

## Safety checklist

- [ ] Only `.env.production` holds Supabase credentials. `.env`,
      `.env.development` and `.env.staging` are **empty**, so those modes run on
      localStorage. `npm run check:env` fails a production build that falls back
      to them.
- [ ] The env badge reads **Local demo** locally, **Staging** on Vercel, and is
      **absent** on the production site.
- [ ] A sandbox build proves it carries no credentials:
      `npm run build:staging && grep -rc "supabase.co" dist/` returns 0.
- [ ] The Vercel project has **no** `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
      If it does, every staging deploy is writing to live invoices.
- [ ] New migrations and Edge Functions were applied to production.
- [ ] `.env*` files are never committed (only the `*.example` templates) and
      never uploaded to Hostinger — only the built `dist/` is.
- [ ] Public signup is **off** (Authentication → Providers → Email). Profiles
      start inactive regardless, but this stops strangers creating auth users
      with the public anon key.
