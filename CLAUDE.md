# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Repository Overview

This repository contains the digital infrastructure for **Ortex Industries** (manufacturer of customized MDF/acrylic items, lanyards, corporate gifts, OEM/white-label production). It is split into three **independent npm projects** (no root workspace); the root `README.md` has the full directory tree and conventions.

1. **`Ortex.Web`**: The marketing/lead-gen single-page app (React 19 + Vite 8 + Tailwind CSS v4). Brand showcase, product catalog, quote wizard, lead capture, Live Orty voice assistant.
2. **`Ortex.Admin`**: The business admin dashboard (React 19 + Vite 8 + Tailwind CSS v4 + Supabase). Manages leads, quotations, invoices, payments, customers, catalogue, social and automation. Owns the Supabase schema (`supabase/migrations`) and Deno edge functions (`supabase/functions`).
3. **`Ortex.Tally.Connector`**: A **standalone** Node CLI (outbound: Admin → Tally). It is not imported or launched by `Ortex.Admin`. It must run on the Windows PC where TallyPrime is open, because Tally's XML gateway only listens on `localhost:9000`. It reads Supabase with a `service_role` key, pushes customers/products/invoices/payments as Tally vouchers/masters, and writes `doc.tally` back onto each record. The two apps communicate only through that field.

## Repo-wide conventions

* **Style**: double quotes, no semicolons, 2-space indent (`.editorconfig`), LF endings (`.gitattributes`). Run `npm run lint` (oxlint, per-app `.oxlintrc.json`) before committing.
* **Naming**: components `PascalCase.jsx`; hooks `useThing.js` in `src/hooks/`; pure helpers in `src/lib/`; persistence in `src/data/{store,domain,seed}/` and outbound services in `src/services/` (Admin); static content in `src/constants/` (Web).
* **Imports**: relative paths are the norm; `@/` → `src/` is configured in both front-ends (`vite.config.js` + `jsconfig.json`) for new code. Avoid barrel `index.js` files (they hurt Vite tree-shaking).
* **Never commit** build archives (`*.zip`), screenshots, or `.env*` (except `*.example`). The single root `.gitignore` covers all apps.
* Keep this file and the root `README.md` in sync when adding modules, routes, dependencies or commands.

---

## Ortex.Web (Marketing Site)

### Commands
```bash
# From Ortex.Web/
npm run dev       # Start Vite dev server with HMR
npm run build     # check-meta → vite build → prerender static routes into dist/
npm run preview   # Serve build output locally
npm run lint      # oxlint
```

### Architecture
* **Routing**: Defined in `src/App.jsx` (pages lazy-loaded). Route SEO metadata is mirrored in `scripts/routes-meta.mjs`; `check-meta.mjs` fails the build if the two drift, and `prerender.mjs` writes real `<title>`/OG tags per route.
* **SEO**: Every page calls `useDocumentMetadata` at the top.
* **Layout**: `components/layout/` (Navbar, Footer, ScrollToTop); shared blocks in `components/ui/` (`PageHero`, `PageCTA`, `Section` = Framer Motion primitives, `Icons.jsx` = Iconsax adapter — the only icon library; import icons from there, not from a package); Home-only sections in `components/home/`.
* **Data**: No server of its own. `lib/supabaseClient.js` reads the live catalogue/work photos and inserts leads; the quote wizard and contact form queue to `localStorage` when offline (`lib/leads.js`). Live Orty (`components/ui/LiveOrty.jsx`, lazy) uses `@google/genai` with a token minted by the `orty-live-token` edge function.
* **Deploy**: `vercel.json` (Vercel) and `public/.htaccess` + `docs/DEPLOY_HOSTINGER.md` (Apache static hosting).

---

## Ortex.Admin (Admin Panel)

### Commands
```bash
# From Ortex.Admin/
npm run dev             # Vite dev server on :5180
npm run dev:staging     # against the staging Supabase project
npm run build           # production build to dist/
npm run build:staging
npm run preview
npm run lint            # oxlint
npm test                # vitest — pure tests (src/lib/analytics.test.js)
```

### Architecture
* **Database & Auth**: Supabase. `src/data/store/repository.js` resolves to `apiStore` when env vars are present, else `localStore` (offline fallback). Auth is password + emailed OTP (`src/lib/auth.js`), invite-only signups, RLS in migrations.
* **Source layout**: `src/pages/` one page per business module (plus `Login`); `src/components/{layout,ui,editors,documents}/` — `layout/` AdminLayout + PageHeader, `ui/` (`Ui.jsx` kit, `Icons.jsx` Iconsax adapter, `Chart`), `editors/` (CustomerFields, ShipToFields, LineItemsEditor, ProductImport, TallyInvoiceImport), `documents/` (DocumentView, ReceiptView); `src/hooks/` (`useCollection.js`, `useProfile.js`); `src/lib/` pure helpers (`pricing.js` GST engine, `analytics.js`, `format.js`, `id.js`); `src/data/{store,domain,seed}/` — `store/` repository facade + apiStore/localStore/supabaseClient/sync, `domain/` schema, domain rules, settings defaults, module registry, `seed/` demo data; `src/services/` outbound integrations (notify, users, integrations).
* **Edge functions**: `supabase/functions/<name>/index.ts`, each deployable alone. Shared code lives in `supabase/functions/_shared/`: `http.ts` (CORS + `json()`), `auth.ts` (`requireStaff(req)` staff gate), `gemini.ts` (`generateContent`, `extractText`, `logAiUsage`). Import from there instead of redefining. Type-check with `npm run check:functions` (fetches Deno 2 via npx; CI runs it on every push).
* **Key Features**:
  * **Full-Page Editors**: Quotation and Invoice creators use clean full-page dashboards rather than modal views; layout is a 2/3 (Details & Line Items) and 1/3 (Settings & Notes) split, with the Line Items grid occupying a full-width section.
  * **Spacious Line Items Editor**: `LineItemsEditor` uses a strict `table-fixed` layout with a `min-w-[1024px]` viewport, aligning headers and input cells with matched width classes (`w-24`, `w-20`, etc.).
  * **A4 Print Engine**: Print (`window.print()`) and PDF Download (`html2pdf.js`). Documents fit A4 (`210mm x 297mm`) with computer-generated notes locked to the bottom via CSS flex (`mt-auto`).
  * **Tally XML Import** (inbound, Invoices only): parses TallyPrime Sales Voucher XML — bulk via the import drawer, or to auto-fill the invoice editor. Sample export: `test/fixtures/tally-sales-invoice.xml`. Imported invoices carry **aggregate totals only** (no per-line `lines` array, so `DocumentView` must default defensively) and are stamped `doc.tally.status = "synced"` so the connector does not push them back as duplicates. The Invoices list shows `doc.tally.status` as a badge.

---

## Ortex.Tally.Connector

```bash
# From Ortex.Tally.Connector/ (Windows PC with TallyPrime open)
cp config.example.json config.json
npm run dry-run   # build XML into out/ without posting
npm run once      # single sync pass
npm start         # continuous
npm run fixture   # XML builder self-test (also run in CI)
```

---

## Reference Docs
* `README.md` — repo map, quick start, conventions.
* `docs/architecture/ARCHITECTURE.md` — narratives, directories, data flows, design system.
* `docs/pm/PRODUCT_BACKLOG.md`, `docs/pm/GROWTH_ROADMAP.md` — backlog and release progress.
* `docs/guides/GETTING_STARTED.md`, `docs/guides/META_SETUP.md` — setup guides.
* `Ortex.Admin/docs/` — PRD, environments, growth tracking, leads & receipts.
* `Ortex.Web/docs/DEPLOY_HOSTINGER.md` — static deploy guide.
