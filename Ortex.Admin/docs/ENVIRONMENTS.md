# Admin environments — Staging & Production

The Admin console runs in two isolated environments, each backed by its **own
Supabase project** so staging tests never touch real invoices, payments, or
customers.

| Environment    | Hosting                        | Supabase project      | Build command            | Env label |
| -------------- | ------------------------------ | --------------------- | ------------------------ | --------- |
| **Staging**    | Vercel (`ortex-admin`)         | Staging project       | `npm run build:staging`  | `Staging` |
| **Production** | Hostinger subdomain            | Production project    | `npm run build`          | (none)    |

The two never share a database. The frontend picks its backend at **build time**
from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, which come from a per-mode
env file (local) or the host's env-var settings (Vercel).

---

## How the build modes work

Vite loads env files by mode:

- `npm run dev` / `npm run build:production` / `npm run build` → mode **production** → loads `.env` + `.env.production`
- `npm run dev:staging` / `npm run build:staging` → mode **staging** → loads `.env` + `.env.staging`

Env files are git-ignored (they hold keys). Committed templates:
`.env.production.example` and `.env.staging.example` — copy each to the matching
`.env.<mode>` and fill in that environment's Supabase values.

`import.meta.env.MODE` is `"staging"` or `"production"`; `import.meta.env.PROD`
is always `true` for any `vite build`, so no dev behaviour leaks into staging.

---

## One-time setup

### 1. Create the two Supabase projects

Create a **separate** Supabase project for staging (keep the existing one as
production). For **each** project you need to replicate the schema, functions,
and secrets:

```bash
cd Ortex.Admin

# Link the CLI to the target project, then push all migrations (0001–0013).
supabase link --project-ref <STAGING-ref>
supabase db push

# Deploy every Edge Function to that project.
for fn in admin-create-user automation-engine category-copywriter indiamart-lead \
          indiamart-pull orty-chat orty-live-token product-copywriter \
          social-creative social-publish social-researcher work-copywriter; do
  supabase functions deploy "$fn" --project-ref <STAGING-ref>
done

# Set the server-side secrets on that project (values differ per env as needed).
supabase secrets set GEMINI_API_KEY=... --project-ref <STAGING-ref>
# ...plus any others each function needs (Meta tokens, IndiaMART, etc.)
```

Repeat with `<PRODUCTION-ref>` for the production project (it likely already has
the schema/functions — only new migrations/functions need pushing).

> Rule of thumb: **staging first**. Test every migration and function on staging,
> then run the same commands against production.

### 2. Staging on Vercel

The existing `ortex-admin` Vercel project is the **staging** deploy.

1. Project → Settings → Environment Variables, add (for Production + Preview):
   - `VITE_SUPABASE_URL` = staging project URL
   - `VITE_SUPABASE_ANON_KEY` = staging anon key
   - `VITE_ENV_LABEL` = `Staging`
2. The build command is already `npm run build:staging` (see `vercel.json`).
3. Vercel auto-deploys on push to the connected git branch. The whole site is
   `noindex` via `vercel.json`, so it stays out of search.

### 3. Production on the Hostinger subdomain

Production is a **static upload** (no git auto-deploy):

1. On the build machine, `cp .env.production.example .env.production` and fill in
   the **production** Supabase URL + anon key. Leave `VITE_ENV_LABEL` blank.
2. Build:
   ```bash
   npm run build          # == vite build --mode production
   ```
3. Upload the **contents of `dist/`** to the subdomain's web root
   (e.g. `admin.ortexindustries.in`) via Hostinger File Manager / FTP.
   `dist/.htaccess` ships automatically and provides:
   - SPA routing (deep links / hard refresh serve `index.html`)
   - `X-Robots-Tag: noindex` (admin must never be indexed)
   - long cache on hashed assets, no-cache on `index.html`
4. Point the Hostinger subdomain at that folder and enable SSL.

---

## Everyday workflow

1. Develop against staging data: `npm run dev:staging` (uses `.env.staging`).
2. Push to the staging branch → Vercel redeploys staging automatically.
3. Verify on the staging URL (look for the amber **Staging** badge in the sidebar).
4. Promote: run any new migrations/functions against the production Supabase
   project, then `npm run build` and re-upload `dist/` to Hostinger.

## Safety checklist

- [ ] Staging and production use **different** Supabase refs (double-check the
      anon keys are not swapped).
- [ ] The **Staging** badge is visible on the Vercel deploy and **absent** on the
      Hostinger production site.
- [ ] New migrations and Edge Functions were applied to **both** projects.
- [ ] `.env.production` is never committed and never uploaded to Hostinger (only
      the built `dist/` is).
