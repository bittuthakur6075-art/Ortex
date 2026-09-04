# Ortex Admin Console

Back-office operations console for **Ortex Industries** — a standalone app managing the full **quote-to-cash** lifecycle: Enquiries → Products → Quotations → GST Invoices → Payments/Payouts, with a growth dashboard.

This is a **separate application** from the marketing site (`Ortex.Web/`). Everything for the admin is inside this `Ortex.Admin/` folder; the Supabase schema and edge functions live in `supabase/`.

## Quick start

```bash
cd Ortex.Admin
npm install
npm run dev        # http://localhost:5180
```

Copy `.env.example` to `.env` with your Supabase project URL/anon key (see `docs/ENVIRONMENTS.md` for staging vs production). Sign in with a staff account invited from **Users**; there is no demo password.

```bash
npm run build      # production build to dist/
npm run preview    # serve the build
npm run lint       # oxlint (.oxlintrc.json)
npm test           # vitest — pure analytics/pricing tests
npm run check:functions  # deno check on supabase/functions (Deno 2 via npx)
```

## What's inside

| Area | Path |
|---|---|
| App shell, routing, auth gate | `src/App.jsx`, `src/components/layout/AdminLayout.jsx`, `src/pages/Login.jsx` |
| Modules (pages) | `src/pages/` — Dashboard, Leads, Enquiries, VoiceLeads, Customers, Products, Categories, Quotations, Invoices, Payments, Work, Social, Automation, Growth, Users, Profile, Settings |
| Components | `src/components/ui/` (`Ui.jsx` kit, `Icons.jsx`, `Chart`), `layout/` (`AdminLayout`, `PageHeader`), `editors/` (`CustomerFields`, `ShipToFields`, `LineItemsEditor`, `ProductImport`, `TallyInvoiceImport`), `documents/` (`DocumentView`, `ReceiptView`) |
| Data layer | `src/data/store/` — `repository.js` (facade) → `apiStore.js` (Supabase) or `localStore.js` (offline fallback), `supabaseClient.js`, `sync.js`; `src/data/domain/` — `schema.js`, `domain.js`, `settingsDefaults.js`, `modules.js`; `src/data/seed/` — demo data |
| Services | `src/services/` — `notify.js`, `users.js`, `integrations.js` |
| Hooks | `src/hooks/` — `useCollection.js` (`useCollection`, `useCollections`, `useSettings`, `useSorting`), `useProfile.js` |
| Helpers | `src/lib/` — `pricing.js` (GST engine), `analytics.js` (+ tests), `format.js`, `id.js`, `csv.js`, `cn.js`, `auth.js`, `imageUpload.js`, `quoteRfq.js`, `revalidate.js` |
| Backend | `supabase/migrations/` (schema + RLS), `supabase/functions/` (Deno edge functions; shared `_shared/http.ts`, `auth.ts`, `gemini.ts`) |
| Fixtures | `test/fixtures/tally-sales-invoice.xml` — sample TallyPrime export for the invoice import |
| Docs | `docs/PRD.md`, `docs/ENVIRONMENTS.md`, `docs/GROWTH_TRACKING.md`, `docs/LEADS_AND_RECEIPTS.md` |

## Architecture notes

**One repository interface.** All persistence goes through `data/store/repository.js`. When Supabase env vars are present it resolves to `apiStore` (Postgres + RLS); without them it falls back to `localStore` (browser `localStorage`) so the UI still runs offline. Modules never import a store directly.

**Shared backend with the website.** Both apps talk to the same Supabase project: website enquiries, quote-wizard RFQs and Live Orty calls land in tables the admin reads; the admin's published catalogue and work photos feed the website.

**GST engine** (`lib/pricing.js`): per-line discount → taxable → GST; whole-document discount; intra-state CGST+SGST vs inter-state IGST based on state codes; round-off. Shared by quotations and invoices so a quote and its converted invoice total identically.

**Security.** Supabase Auth with a password + emailed one-time code step (`lib/auth.js`), invite-only signups, and row-level security enforced by the migrations. Edge functions re-check the caller's staff profile before using any server-side key.

See `docs/PRD.md` for the full product spec and `docs/GROWTH_TRACKING.md` for the metrics/KPI reference (India GST, payments/payouts, dashboard spec).
