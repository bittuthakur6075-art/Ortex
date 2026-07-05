# Ortex Admin Console

Back-office operations console for **Ortex Industries** — a standalone app managing the full **quote-to-cash** lifecycle: Enquiries → Products → Quotations → GST Invoices → Payments/Payouts, with a growth dashboard.

This is a **separate application** from the marketing site (which lives in the repo's `src/`). Everything for the admin is inside this `Ortex.Admin/` folder.

## Quick start

```bash
cd Ortex.Admin
npm install
npm run dev        # http://localhost:5180
```

Sign in with the demo password **`ortex@admin`**, then open **Settings → Load demo data** (or the Dashboard's "Load demo data" button) to populate a full sample dataset.

```bash
npm run build      # production build to dist/
npm run preview    # serve the build
npm run lint       # oxlint
```

## What's inside

| Area | Path |
|---|---|
| App shell, routing, auth gate | `src/App.jsx`, `src/components/AdminLayout.jsx`, `src/components/Login.jsx` |
| Modules (pages) | `src/modules/` — Dashboard, Enquiries, Products, Quotations, Invoices, Payments, Settings |
| Shared UI kit | `src/components/ui.jsx` + `PageHeader`, `CustomerFields`, `LineItemsEditor`, `DocumentView` |
| Data layer | `src/data/` — `repository.js`, `localStore.js`, `schema.js`, `domain.js`, `analytics.js`, `seed.js`, `hooks.js` |
| Helpers | `src/lib/` — `pricing.js` (GST engine), `format.js`, `id.js`, `csv.js`, `cn.js`, `auth.js` |
| Docs | `docs/PRD.md`, `docs/GROWTH_TRACKING.md` |

## Architecture notes

**Client-side, API-ready.** All persistence goes through one async repository interface (`data/repository.js`). Today it's backed by `localStore` (browser `localStorage`). To go live against a real backend, implement the same async surface (`list/get/create/update/remove/getSettings/saveSettings/nextSequence/subscribe/...`) in an `apiStore` and change the single export in `repository.js` — **no module or component changes required**.

**Why standalone / localStorage caveat.** Because this runs on its own origin, it keeps its own data store; it does not read the marketing site's `localStorage`. In production, connect both to a shared backend (or serve the admin under the same origin) so website enquiries flow into the console. All data is per-browser and wipeable — fine for demo/staging, **not** a system of record until a backend is added.

**GST engine** (`lib/pricing.js`): per-line discount → taxable → GST; whole-document discount; intra-state CGST+SGST vs inter-state IGST based on state codes; round-off. Shared by quotations and invoices so a quote and its converted invoice total identically.

**Security.** The login is a client-side passphrase gate for demo/staging only — **not** a security boundary. Add real authentication before exposing live customer or financial data.

See `docs/PRD.md` for the full product spec and `docs/GROWTH_TRACKING.md` for the metrics/KPI reference (India GST, payments/payouts, dashboard spec).
