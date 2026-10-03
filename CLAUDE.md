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
4. **`Ortex.Tally.Connector`**: standalone Node CLI (outbound Admin -> TallyPrime). **Not in use** (owner's decision 2026-10-03: no connector, API or server access; Tally data comes INTO the console only through the manual **Import from Tally** XML upload, see `Ortex.Admin/CLAUDE.md`). The code is kept, tested in CI, for if outbound sync is ever wanted. It would run on the **remote Windows server where TallyPrime runs** (Tally's XML gateway listens only on `localhost:9000`; never expose that port), as the scheduled task `OrtexTallyConnector`; update it there with `update.ps1` (backs up `config.json`, self-test, `npm run check-config`, restart), see its README. Reads Supabase with a `service_role` key, pushes customers, products, invoices (Sales, New Ref), payments received (Receipt, Agst Ref against the invoice, On Account when unlinked) and payouts (Payment vouchers), each with `VOUCHERNUMBER` and a stable `REMOTEID` so a re-post does not duplicate, and writes `doc.tally` back through the service-role RPC `tally_mark()` (migration 0066), which changes only that key. That field is the only link between it and the console; clients cannot change it, and a payment already in Tally can be changed or deleted only by the Super Admin.

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
| `Ortex.Admin/src/lib/attendance.js` | Nothing: it is GENERATED from `Ortex.Mobile/src/domain/attendance.ts` (`npm run gen:attendance` in Ortex.Mobile); parity test `Ortex.Mobile/test/attendance.test.mjs` |
| `PAYMENT_METHODS` in `Ortex.Admin/src/data/domain/schema.js`, the "same reference" branch of `findDuplicate` in `lib/paymentReader.js`, the Payments page totals | `Ortex.Mobile/src/features/payments/payments.ts` (parity test `test/payments.parity.test.mjs`) |
| `Ortex.Admin/src/lib/roles.js` (incl. the company helpers `companiesOf`, `hasCompany`, `pickCompany`, `companyScope`, `inCompanies`, `companyForCreate`) | `Ortex.Mobile/src/domain/modules.ts` |
| `settingsFor()` in `Ortex.Admin/src/data/domain/settingsDefaults.js` | `settingsFor()` in `Ortex.Mobile/src/domain/settings.ts` (the console also passes through its global-only blocks) |
| `Ortex.Admin/src/lib/companyMark.js` (a company's fallback monogram) | `Ortex.Mobile/src/domain/companyMark.ts` (line for line; parity test in `test/companies.test.mjs`) |
| `Ortex.Admin/src/lib/enquiryImport.js` (Excel import of enquiries) | `Ortex.Mobile/src/domain/enquiryImport.ts` (parity test `test/enquiryImport.test.mjs`) |
| `Ortex.Admin/src/lib/sessions.js` (Login sessions device names) | `Ortex.Mobile/src/domain/sessions.ts` (parity test `test/sessions.test.mjs`) |
| `Ortex.Admin/src/lib/address.js` (company registered / dispatch address on documents) | `Ortex.Mobile/src/domain/address.ts` (parity test `test/address.test.mjs`) |
| `Ortex.Web/src/pages/Privacy.jsx`, `Terms.jsx` | `Ortex.Mobile/src/features/profile/legal.ts` (verbatim mirror) |
| Anu's portrait `Ortex.Web/public/img/anu.jpg` | `Ortex.Admin/public/img/anu.jpg`, `Ortex.Mobile/assets/anu.jpg` |
| Anu's filler names `PLACEHOLDER_NAMES` in `Ortex.Mobile/src/domain/voice.ts` | The copy inside `upsert_customer_from()` (latest definition: migration 0050) |
| A new public product/category field | The `products_public` / `categories_public` views (migration 0020), or the site never sees it |

## Roles and access (applies to every client)

Five roles: `super_admin`, `admin`, `accounts`, `sales`, `staff` (migration 0032). **Never write `role === "admin"`**: use `isAdmin()` (true for admin and super_admin) or the Super Admin loses access. **Louis Sharma (`louis.sharma37@gmail.com`) is the permanent Owner** (`profiles.is_owner`, exactly one, migration 0067): nobody, the Owner included, can demote, deactivate, delete or replace him, and ownership never moves (`transfer_super_admin()` always refuses). There may be several Super Admins: every one has all Super Admin powers (`is_super_admin()`, payroll included), but only the Owner makes or removes a Super Admin, and only the Owner changes the Owner's account or another Super Admin's. Use `isOwner()` (both clients, `lib/roles.js` / `domain/modules.ts`) for owner-only UI, `roleLabel(profile)` shows "Super Admin · Owner". A person's modules = their role's grants (`role_permissions`) plus their own `profiles.modules`, gated by `module_controls` (migration 0053): a module switched off reaches only the Super Admin, one with `admin_access = false` reaches an Admin only through their own tick, and a key in `profiles.modules_hidden` (migration 0055, written only by the Super Admin) closes that module to that one person whatever their role gives. All of these are edited by the Super Admin on the console's Modules page (`/modules`). The same rule is in `has_module_access()` (SQL), `canAccess()` (both clients) and `push-notify`. Payroll is NOT implied by admin: `is_payroll()` = Super Admin or the `payroll` grant.

Security lives in the database (RLS, security-definer RPCs, triggers). A client-side role check is the second line of defence, never the only one. Migration 0050 (security audit, 2026-09-26) closed the places where the database allowed more than the console shows:

* `audit_log` rows are readable per module (`audit_can_read(table)`: whoever may open that table's module, Admins included since 0053; tables with no module, admins). It stores full docs, so a blanket staff read would leak invoices and customers.
* `profiles`: admins UPDATE; only the Super Admin (or the service role in `admin-create-user` / `admin-manage-user`) INSERTs or DELETEs.
* `settings`: admins read, only the Super Admin writes. Website analytics (`user_activities`, `event_logs`): admins only.
* Anonymous inserts are bounded (enquiries 32 KB with field limits, analytics 8 KB), and an anonymous enquiry never fills a customer's GSTIN, state code or address.
* Public buckets serve files by URL but cannot be LISTED anonymously; writing product photos needs a catalogue module, social media the `social` module.
* Public edge functions are rate-limited through `rate_limit_hit()` (table `rate_limits`, service role only) via `_shared/guard.ts`.
* Demo data and "delete everything" exist only without a database: `seedDemo()` and `apiStore.clearAll()` refuse on Supabase, and the console no longer copies browser storage into the live tables.

## Database migration status

**Every migration up to 0078 is applied in production** (0074 push prefs and pay alerts, 0075 companies, 0076 per-company RLS, 0077 simple payroll, all pushed 2026-10-03 after a backup; 0078 company-logos bucket pushed 2026-10-03; 0073 deleting an enquiry is admins only, pushed 2026-10-03; 0070 manual Tally import stamps, 0071 `settings_staff` carries the `documents` wording block, 0072 an admin may link an unlinked imported receipt to its invoice, all pushed 2026-10-03; 0069 Anu audit fixes pushed 2026-10-03: only admins post to Everyone, bot schedule retries and "Send now" runs logged, team update gated by module, voice-leads reads voice rows, anon recording uploads need a recent voice enquiry; `orty-live-token` and `anu-staff-token` redeployed the same day with tokens locked to the Live model and a per-user limit on the staff token; 0068 late marks only on worked P/OD/HD days, pushed 2026-10-03 and recalculated every unlocked day since 2026-09-01; 0067 Owner + several Super Admins pushed 2026-10-03, Louis Sharma flagged `is_owner`; deploy the edge functions after it, since `requireStaff` reads `is_owner`; 0066 payments fixes pushed 2026-10-03: unique payment numbers created, no legacy payment failed the new CHECK; 0065 attendance fixes pushed 2026-10-03; the `push-notify` function that uses its `module_access_for()` and `cancel_note` is deployed separately); (0063 Login sessions and 0064 `team_contacts()` pushed by 2026-10-02; 0056 attendance timing pushed 2026-09-30 with `db push --include-all`, after 0053 module switches, 0054 staff catalogue read-only, 0055 per-person hide + QR for Admins, and 0057-0059 holidays module, off-day work stays WO/H, leave-balances module, all 2026-09-30; 0057-0059 were run with `db query -f` and recorded with `migration repair`, so 0056, older than them, now needs `db push --include-all`; 0041 and 0044 had been missed until 2026-09-23 and went in with 0045). Staff's `products` grant (`role_permissions`) was added on 2026-09-30 only so phones on Mobile 1.8.0 get a second tab; remove it once every phone runs 1.8.1. Check with `supabase migration list` before assuming; `db push` skips a migration already recorded even if its objects were later deleted (this happened with the `product-images` bucket).

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

`.github/workflows/ci.yml`: Web lint + `build:ci`; Admin lint + test + `build:staging` + `check:functions` (Deno type-check) + `test:db` (all migrations in PGlite, attendance flow scenarios); Mobile lint + typecheck + test + Android JS bundle; Tally XML fixture. CI holds no production credentials, so both web builds run in a non-production mode; the production `npm run build` and its credential guard run only where the keys live (Vercel, the build machine). `.github/workflows/deploy-admin.yml` deploys the Admin console to Vercel production with the Vercel CLI on every push to `Development` touching `Ortex.Admin/` (secret `VERCEL_TOKEN`); the Vercel projects have no Git link.

## Ortex.Tally.Connector

```bash
# From Ortex.Tally.Connector/ (on the Tally server, with TallyPrime open)
cp config.example.json config.json
npm run dry-run   # build XML into out/ without posting
npm run once      # single sync pass
npm start         # continuous
npm run fixture   # XML builder self-test (also run in CI)
npm run check-config   # config.json vs the example: missing settings, risky values (no secrets printed)
# On the Tally server: powershell -ExecutionPolicy Bypass -File .\update.ps1 [-SkipPull] [-InstallTask]
```

Invoices imported INTO the console from Tally XML are stamped `doc.tally.status = "synced"` so the connector never pushes them back.

## Reference docs

* `README.md`: repo map, quick start.
* `docs/architecture/ARCHITECTURE.md`: narratives, data flows, design system.
* `docs/pm/`: `PRODUCT_BACKLOG.md`, `GROWTH_ROADMAP.md`, `ATTENDANCE_LEAVE_PLAN.md`, `PAYROLL_PLAN.md`.
* `docs/guides/`: `GETTING_STARTED`, `TELECALLER_SETUP`, `PUSH_SETUP`, `MOBILE_RELEASE`.
* `Ortex.Admin/docs/`: PRD, environments, growth tracking, leads & receipts.
* `Ortex.Web/docs/DEPLOY_HOSTINGER.md`, `Ortex.Mobile/README.md`.
