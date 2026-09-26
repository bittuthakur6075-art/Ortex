# CLAUDE.md

Guidance for AI coding assistants. This root file holds what is true across the repo; each app has its own `CLAUDE.md` with its architecture and gotchas, loaded when you work inside that folder:

* `Ortex.Web/CLAUDE.md`: marketing site, SEO prerender, Anu (the website voice assistant)
* `Ortex.Admin/CLAUDE.md`: back-office console, Supabase schema, edge functions
* `Ortex.Mobile/CLAUDE.md`: field-sales React Native app

Keep each fact in ONE of these files. When something changes, correct the sentence that describes it instead of adding a new one beside it, and delete descriptions of code that no longer exists. Fix history belongs in commit messages, not here.

## Repository overview

**Ortex Industries** makes customised MDF/acrylic items, lanyards, corporate gifts and OEM/white-label goods. Four **independent npm projects** (no root workspace); the root `README.md` has the directory tree.

1. **`Ortex.Web`**: public marketing / lead-gen site (React 19, Vite 8, Tailwind v4, prerendered). Live at https://bizgift.ortexindustries.in.
2. **`Ortex.Admin`**: the business console (React 19, Vite 8, Tailwind v4, Supabase). **Owns the database**: `supabase/migrations` and the Deno edge functions in `supabase/functions`.
3. **`Ortex.Mobile`**: field-sales app (React Native 0.85 bare workflow, Expo SDK 56 modules, TypeScript). A **second client of the Admin's Supabase project**: same anon key, same `profiles` roles, same RLS, no edge function of its own. Any schema change it needs is a migration in `Ortex.Admin/supabase/migrations`.
4. **`Ortex.Tally.Connector`**: standalone Node CLI (outbound Admin -> TallyPrime). Must run on the Windows PC where TallyPrime is open (Tally's XML gateway listens only on `localhost:9000`). Reads Supabase with a `service_role` key, pushes customers/products/invoices/payments, and writes `doc.tally` back onto each record. That field is the only link between it and the console.

## Environments: one Supabase project, and it is production

There is exactly one Supabase project and it holds the live business data (`Ortex.Admin/docs/ENVIRONMENTS.md`).

* **Admin** `npm run dev` / staging builds normally run with **no database**: without Supabase env vars `repository.js` falls back to `localStore` (localStorage + demo data; sign in with any email and `ortex@admin`). `scripts/check-env.mjs` runs before every build and refuses a production build with a missing or placeholder `.env.production`.
* **Web** `.env.development` holds the production values plus `ALLOW_SHARED_SUPABASE=true`. A Web dev server therefore reads the live catalogue and **writes live leads and analytics**; `isLocalTraffic()` drops localhost analytics rows unless `VITE_TRACK_LOCAL=true`.
* **Mobile** `.env` points at the same project. Anything you do on a dev build is real.

Never run destructive SQL, a test write or a bulk import against it casually.

## Cross-app invariants (edit both sides)

| Change here | ...must also change |
|---|---|
| `Ortex.Admin/src/lib/pricing.js`, `format.js`, `id.js`, `gstStates.js`, `quoteRfq.js`, `data/domain/schema.js`, `settingsDefaults.js`, `data/domain/domain.js` (quotations), `data/domain/modules.js`, `pages/voice-leads/helpers.js`, `data/store/apiStore.js` | The line-for-line mirror in `Ortex.Mobile/src/domain/` (and `src/data/repo.ts`). `npm test` in Mobile fails if the GST engines drift. |
| `Ortex.Admin/src/lib/anu.js` (staff Anu answers) | `Ortex.Mobile/src/domain/anu.ts` |
| `Ortex.Admin/src/lib/anuIntent.js`, `anuReply.js`, `chat.js` (Team chat and Anu in chat) | `Ortex.Mobile/src/domain/anuIntent.ts`, `anuReply.ts`, `chat.ts` (parity test `test/anuIntent.test.mjs`) |
| `Ortex.Admin/src/lib/attendance.js` | Nothing: it is GENERATED from `Ortex.Mobile/src/domain/attendance.ts` (tsc + prettier --no-semi); parity test `Ortex.Mobile/test/attendance.test.mjs` |
| `Ortex.Admin/src/lib/roles.js` | `Ortex.Mobile/src/domain/modules.ts` |
| `Ortex.Web/src/pages/Privacy.jsx`, `Terms.jsx` | `Ortex.Mobile/src/features/profile/legal.ts` (verbatim mirror) |
| Anu's portrait `Ortex.Web/public/img/anu.jpg` | `Ortex.Admin/public/img/anu.jpg`, `Ortex.Mobile/assets/anu.jpg` |
| Anu's filler names `PLACEHOLDER_NAMES` in `Ortex.Mobile/src/domain/voice.ts` | The copy inside migration 0029's `upsert_customer_from()` |
| A new public product/category field | The `products_public` / `categories_public` views (migration 0020), or the site never sees it |

## Roles and access (applies to every client)

Five roles: `super_admin`, `admin`, `accounts`, `sales`, `staff` (migration 0032). **Never write `role === "admin"`**: use `isAdmin()` (true for admin and super_admin) or the Super Admin loses access. Exactly one Super Admin (`louis.sharma37@gmail.com`), protected by triggers; the role moves only through `transfer_super_admin()`. A person's modules = their role's grants (`role_permissions`, edited by the Super Admin) plus their own `profiles.modules`. The same union is in `has_module_access()` (SQL), `canAccess()` (both clients) and `push-notify`. Payroll is NOT implied by admin: `is_payroll()` = Super Admin or the `payroll` grant.

Security lives in the database (RLS, security-definer RPCs, triggers). A client-side role check is the second line of defence, never the only one. Migration 0050 (security audit, 2026-09-26) closed the places where the database allowed more than the console shows:

* `audit_log` rows are readable per module (`audit_can_read(table)`: admins, or whoever may open that table's module). It stores full docs, so a blanket staff read would leak invoices and customers.
* `profiles`: admins UPDATE; only the Super Admin (or the service role in `admin-create-user` / `admin-manage-user`) INSERTs or DELETEs.
* `settings`: admins read, only the Super Admin writes. Website analytics (`user_activities`, `event_logs`): admins only.
* Anonymous inserts are bounded (enquiries 32 KB with field limits, analytics 8 KB), and an anonymous enquiry never fills a customer's GSTIN, state code or address.
* Public buckets serve files by URL but cannot be LISTED anonymously; writing product photos needs a catalogue module, social media the `social` module.
* Public edge functions are rate-limited through `rate_limit_hit()` (table `rate_limits`, service role only) via `_shared/guard.ts`.
* Demo data and "delete everything" exist only without a database: `seedDemo()` and `apiStore.clearAll()` refuse on Supabase, and the console no longer copies browser storage into the live tables.

## Database migration status

**Every migration up to 0050 is applied in production** (checked with `supabase migration list` on 2026-09-26; 0041 and 0044 had been missed until 2026-09-23 and went in with 0045). Check with `supabase migration list` before assuming; `db push` skips a migration already recorded even if its objects were later deleted (this happened with the `product-images` bucket).

* Anu in Team chat uses NO language model (the `anu-chat` function was deleted 2026-09-23); pg_cron job `anu-bot-tick` runs every 5 minutes. The CLI is linked to project `pfoeztiakqtemakfgpgs`; on Windows PowerShell call it as `npx.cmd supabase ...` (script execution is disabled).
* `0031` push devices (and 0047, chat messages to closed phones): applied, but remote push stays inert until the Firebase files and the Vault/function secrets in `docs/guides/PUSH_SETUP.md` exist.

## Repo-wide conventions

* **Style**: double quotes, no semicolons, 2-space indent (`.editorconfig`), LF endings (`.gitattributes`). `npm run lint` (oxlint, per-app `.oxlintrc.json`) before committing.
* **Naming**: components `PascalCase.jsx`; hooks `useThing.js` in `src/hooks/`; pure helpers in `src/lib/`; persistence in `src/data/`; outbound integrations in `src/services/` (Admin); static content in `src/constants/` (Web).
* **Imports**: relative paths are the norm; `@/` -> `src/` exists in all three apps for new code. No barrel `index.js` files.
* **On-screen text**: no em dashes (a full stop, comma or colon instead). Indian English.
* **Never commit** build archives, screenshots or `.env*` (except `*.example`). `Ortex.Mobile/` keeps its own `.gitignore` for Gradle/Xcode/CocoaPods output.
* **What's new**: a version bump adds a release at the top of `Ortex.Admin/src/data/domain/whatsNew.js` or `Ortex.Mobile/src/constants/whatsNew.ts`, written for the people using the app.
* Keep these `CLAUDE.md` files and the root `README.md` in sync when adding modules, routes, dependencies or commands.

## CI

`.github/workflows/ci.yml`: Web lint + `build:ci`; Admin lint + test + `build:staging` + `check:functions` (Deno type-check); Mobile lint + typecheck + test + Android JS bundle; Tally XML fixture. CI holds no production credentials, so both web builds run in a non-production mode; the production `npm run build` and its credential guard run only where the keys live (Vercel, the build machine). `.github/workflows/deploy-admin.yml` deploys the Admin console to Vercel production with the Vercel CLI on every push to `Development` touching `Ortex.Admin/` (secret `VERCEL_TOKEN`); the Vercel projects have no Git link.

## Ortex.Tally.Connector

```bash
# From Ortex.Tally.Connector/ (Windows PC with TallyPrime open)
cp config.example.json config.json
npm run dry-run   # build XML into out/ without posting
npm run once      # single sync pass
npm start         # continuous
npm run fixture   # XML builder self-test (also run in CI)
```

Invoices imported INTO the console from Tally XML are stamped `doc.tally.status = "synced"` so the connector never pushes them back.

## Reference docs

* `README.md`: repo map, quick start.
* `docs/architecture/ARCHITECTURE.md`: narratives, data flows, design system.
* `docs/pm/`: `PRODUCT_BACKLOG.md`, `GROWTH_ROADMAP.md`, `ATTENDANCE_LEAVE_PLAN.md`, `PAYROLL_PLAN.md`.
* `docs/guides/`: `GETTING_STARTED`, `META_SETUP`, `LINKEDIN_SETUP`, `TELECALLER_SETUP`, `PUSH_SETUP`, `MOBILE_RELEASE`.
* `Ortex.Admin/docs/`: PRD, environments, growth tracking, leads & receipts.
* `Ortex.Web/docs/DEPLOY_HOSTINGER.md`, `Ortex.Mobile/README.md`.
