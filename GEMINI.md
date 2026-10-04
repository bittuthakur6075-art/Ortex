# GEMINI.md

Guidance for Antigravity and AI coding assistants working in the **Ortex Industries** codebase.
This root file outlines cross-repo rules, environments, and invariants. Subproject-specific guides are located in:
* `Ortex.Web/GEMINI.md`: Marketing site, SEO prerender, Live Orty (website voice assistant)
* `Ortex.Admin/GEMINI.md`: Back-office console, Supabase schema, edge functions, HRMS & payroll
* `Ortex.Mobile/GEMINI.md`: Field-sales React Native app, One UI design system, native build gotchas

Keep facts deduplicated: update existing descriptions rather than appending duplicate contradictory notes.

---

## 1. Environment & Windows Shell Rules

* **Operating System**: Windows. PowerShell script execution is disabled (`Execution_Policies`).
  * **Always use `.cmd` wrappers or invoke via `cmd /c`**:
    * Run npm commands: `cmd /c "npm run <script>"` or `npm.cmd run <script>`
    * Run Supabase CLI: `npx.cmd supabase <command>`
    * Run Deno: `npx.cmd deno <command>`
* **One Production Supabase Project (`pfoeztiakqtemakfgpgs`)**:
  * There is only **one live Supabase project** and it holds production data.
  * **Admin Dev Mode**: Running without Supabase env vars falls back to `localStore` (localStorage + demo data; sign in with any email and password `ortex@admin`). Production builds enforce `.env.production` via `scripts/check-env.mjs`.
  * **Web Dev Mode**: Reads live catalog and writes live leads. Local analytics visits are dropped unless `VITE_TRACK_LOCAL=true`.
  * **Mobile Dev Mode**: Connects directly to the live project with the anon key.
  * **NEVER execute destructive SQL, drop columns without checking `pg_proc`, or bulk-write dummy records against production.**

---

## 2. Repository Overview

Ortex Industries manufactures customized MDF/acrylic items, lanyards, corporate gifts, and OEM goods. The repo contains four independent npm packages (no root workspace):

1. **`Ortex.Web`**: Public marketing & lead-gen SPA (React 19, Vite 8, Tailwind v4, SSG prerendered). Live at https://bizgift.ortexindustries.in.
2. **`Ortex.Admin`**: Business management console (React 19, Vite 8, Tailwind v4, Supabase). **Sole owner of the database**: `supabase/migrations/` and `supabase/functions/`.
3. **`Ortex.Mobile`**: Field-sales app (React Native 0.85 bare workflow, Expo SDK 56 modules, TypeScript). Second client of Supabase sharing the same anon key, profiles, and RLS.
4. **`Ortex.Tally.Connector`**: Standalone Node CLI (outbound sync Admin -> TallyPrime via `localhost:9000`). Currently **dormant** (business decision: manual Day Book XML import preferred). Maintained and tested in CI.

---

## 3. Cross-App Invariants (Strict Parity — Edit Both Sides)

When modifying shared domain logic in `Ortex.Admin`, the mirrored TypeScript/JavaScript code in `Ortex.Mobile` **must be updated in lockstep**. Mobile tests (`cmd /c "npm test"` in `Ortex.Mobile`) enforce strict parity.

| Modify in `Ortex.Admin` | Must also be updated in `Ortex.Mobile` | Parity Test |
| :--- | :--- | :--- |
| `src/lib/pricing.js`, `format.js`, `id.js`, `gstStates.js`, `quoteRfq.js`, `data/domain/schema.js`, `settingsDefaults.js`, `data/domain/domain.js`, `pages/voice-leads/helpers.js` | `src/domain/` line-for-line mirror (`pricing.ts`, `format.ts`, etc.) and `src/data/repo.ts` | `test/gstParity.test.mjs`, `test/format.test.mjs` |
| `src/lib/validateDocument.js` (quotation & invoice validation, GSTIN check digits) | `src/domain/validateDocument.ts` | `test/validateDocument.test.mjs` |
| `src/lib/anu.js` (staff assistant responses) | `src/domain/anu.ts` | `test/anu.test.mjs` |
| `src/lib/anuIntent.js`, `anuReply.js`, `chat.js` (chat intent parsing without LLM) | `src/domain/anuIntent.ts`, `anuReply.ts`, `chat.ts` | `test/anuIntent.test.mjs` |
| `src/lib/attendance.js` | **Generated file**: Run `cmd /c "npm run gen:attendance"` in `Ortex.Mobile` to compile from `src/domain/attendance.ts` | `test/attendance.test.mjs` |
| `PAYMENT_METHODS`, `findDuplicate` in `lib/paymentReader.js` | `src/features/payments/payments.ts` | `test/payments.parity.test.mjs` |
| `src/lib/roles.js` (`companiesOf`, `hasCompany`, `companyScope`, `inCompanies`) | `src/domain/modules.ts` | `test/companies.test.mjs` |
| `settingsFor()` in `src/data/domain/settingsDefaults.js` | `settingsFor()` in `src/domain/settings.ts` | `test/companies.test.mjs` |
| `src/lib/companyMark.js` (fallback SVG monogram) | `src/domain/companyMark.ts` | `test/companies.test.mjs` |
| `src/lib/enquiryImport.js` (Excel enquiry parsing) | `src/domain/enquiryImport.ts` | `test/enquiryImport.test.mjs` |
| `src/lib/address.js` (registered & dispatch address parsing) | `src/domain/address.ts` | `test/address.test.mjs` |
| `Ortex.Web/src/pages/Privacy.jsx`, `Terms.jsx` | `Ortex.Mobile/src/features/profile/legal.ts` (verbatim text) | — |
| `public/img/anu.jpg` | `Ortex.Mobile/assets/anu.jpg`, `Ortex.Admin/public/img/anu.jpg` | — |

---

## 4. Roles, Security & Permanent Ownership

* **Five RBAC Roles**: `super_admin`, `admin`, `accounts`, `sales`, `staff`.
* **Permanent Owner (Migration 0067)**:
  * **Louis Sharma (`louis.sharma37@gmail.com`)** is the permanent Owner (`profiles.is_owner = true`).
  * No user or procedure can demote, deactivate, delete, or reassign ownership (`transfer_super_admin()` always rejects).
  * There may be multiple Super Admins, but only the Owner can grant or revoke Super Admin privileges.
* **Never check `role === "admin"`**:
  * Always use `isAdmin(profile)` (true for both `admin` and `super_admin`), or Super Admins lose access.
  * Use `isOwner(profile)` for owner-only UI.
  * Use `is_payroll()` for payroll access (`super_admin` or explicit `payroll` grant; not implied by `admin`).
* **Database Enforced Security**:
  * RLS policies and security-definer RPCs protect every table. Client-side checks (`canAccess`) are purely for UI gating.
  * Audit logs (`audit_log`) record actor UUIDs via triggers (`stamp_actor`) and enforce per-module read permissions.
  * Anonymous inquiries to `enquiries` are bounded to 32 KB and cannot overwrite matched customer GSTINs or addresses.

---

## 5. Multi-Company Architecture (Migrations 0075–0078)

The system operates three business entities (**Ortex**, **Aman**, **Nidhi**):
* `enquiries`, `leads`, `customers`, `quotations`, `invoices`, and `payments` carry a dedicated `company_id` column.
* Shared tables across companies: catalog products/categories, staff directory, attendance, leave, payroll, and team chat.
* Database RLS validates `has_company_access(company_id)`.
* Each company maintains independent sequence series (`next_sequence(series, company)`), logo assets in `company-logos` bucket, document wordings, and bank account configurations.

---

## 6. Coding Standards & Conventions

* **JavaScript / TypeScript Style**:
  * Double quotes (`"`), no semicolons (`;`), 2-space indentation.
  * LF line endings (enforced by `.gitattributes`).
  * Run lint before committing: `cmd /c "npm run lint"` (oxlint + per-app ui-guards).
* **Naming**:
  * React components: `PascalCase.jsx` / `PascalCase.tsx`
  * Hooks: `useThing.js` / `useThing.ts`
  * Pure helpers: `camelCase.js` / `camelCase.ts` in `src/lib/` or `src/domain/`
  * Outbound services: `src/services/`
* **Imports**:
  * Relative paths or `@/` alias mapped to `src/`.
  * **Never create barrel `index.js` re-export files.**
* **On-Screen Copy**:
  * Indian English (e.g. "lakh", "crore", "GSTIN").
  * **Do not use em dashes (`—`)** in user-facing text; use a comma, colon, or period instead.
* **Release Logs**:
  * When bumping versions in `package.json`, prepend release notes to `Ortex.Admin/src/data/domain/whatsNew.js` or `Ortex.Mobile/src/constants/whatsNew.ts`.

---

## 7. Quality Verification & Testing

Always verify relevant suites pass after making changes:
```bash
# Admin tests (468 unit tests)
cd Ortex.Admin && cmd /c "npm test"

# Admin database scenarios (511 checks across 78 migrations via PGlite)
cd Ortex.Admin && cmd /c "npm run test:db"

# Admin edge function type check
cd Ortex.Admin && cmd /c "npm run check:functions"

# Mobile domain parity tests (270 checks)
cd Ortex.Mobile && cmd /c "npm test"

# Web lint & static meta check
cd Ortex.Web && cmd /c "npm run lint"

# Tally XML fixture validation
cd Ortex.Tally.Connector && cmd /c "npm run fixture"
```
