# Environments — Development, Staging & Production

**Two Supabase projects, three environments.** Development and staging share one
non-production database; production has a database entirely of its own. Nothing
you do locally or on the staging deploy can reach real invoices, payments or
customers.

| Environment     | Who uses it      | Hosting                | Supabase project        | Command                   | Env badge     |
| --------------- | ---------------- | ---------------------- | ----------------------- | ------------------------- | ------------- |
| **Development** | Your machine     | `localhost:5180`       | **Dev/Staging (shared)**| `npm run dev`             | `Development` |
| **Staging**     | Team review      | Vercel (`ortex-admin`) | **Dev/Staging (shared)**| `npm run build:staging`   | `Staging`     |
| **Production**  | The business     | Hostinger subdomain    | **Production (own)**    | `npm run build`           | (none)        |

The frontend picks its backend at **build time** from `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY`, which come from a per-mode env file (local) or the
host's environment variables (Vercel).

## Why dev and staging share a database

Both are non-production, so one database means one schema to migrate, one set of
Edge Function secrets, and one pile of seed data. What you test locally is
exactly what a reviewer sees on the Vercel deploy, with no second project
drifting out of sync.

The trade-off worth knowing: staging has **no data isolation from development**.
A migration you push or a record you delete while developing is immediately
visible to anyone reviewing staging. If you ever need a stable review dataset,
split staging onto its own project — the steps under "Standing up a new
environment" are all it takes, and the build guard already supports it.

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
> `.env` — the shared dev/staging database — and looks completely normal. Every
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
This is the exact path used to create the production project, and the same path
would split staging onto its own project later.

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
npm run check:env                            # confirms it is NOT the dev/staging project
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

1. Project → Settings → Environment Variables (Production + Preview):
   - `VITE_SUPABASE_URL` = **dev/staging** project URL
   - `VITE_SUPABASE_ANON_KEY` = **dev/staging** anon key
   - `VITE_ENV_LABEL` = `Staging`
2. The build command is already `npm run build:staging` (`vercel.json`).
3. Vercel auto-deploys on push to the connected branch. The whole site is
   `noindex`, so it stays out of search.

### Production (Hostinger subdomain)

A static upload, no git auto-deploy:

1. On the build machine, fill in `.env.production` (step 5 above).
2. `npm run build` — the env check runs first and refuses a build pointed at the
   shared dev/staging database.
3. Upload the **contents of `dist/`** to the subdomain's web root
   (e.g. `admin.ortexindustries.in`). `dist/.htaccess` ships automatically and
   provides SPA routing, `X-Robots-Tag: noindex`, and asset caching.
4. Point the subdomain at that folder and enable SSL.

---

## Everyday workflow

1. Work locally against the shared dev/staging project: `npm run dev`. The amber
   **Development** badge in the sidebar confirms which database you are on.
2. Push to the staging branch → Vercel redeploys staging automatically, against
   that same database, badged **Staging**.
3. Promote a migration or function to production with
   `npm run provision -- <production-ref>`.
4. Then `npm run build` and re-upload `dist/`.

Because there are only two databases, "apply it everywhere" means running the
provision step exactly twice: once on dev/staging, once on production.

## Safety checklist

- [ ] Production uses a **different** Supabase ref from dev/staging.
      `npm run check:env` fails the build if it does not.
- [ ] Dev and staging use the **same** ref, differing only in `VITE_ENV_LABEL`.
- [ ] The env badge reads **Development** locally, **Staging** on Vercel, and is
      **absent** on the production site.
- [ ] New migrations and Edge Functions were applied to **both** projects.
- [ ] Secrets are set on both projects separately.
- [ ] `.env*` files are never committed (only the `*.example` templates) and
      never uploaded to Hostinger — only the built `dist/` is.
- [ ] Public signup is **off** in both projects.
