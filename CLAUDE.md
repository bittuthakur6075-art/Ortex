# CLAUDE.md

This file provides guidance to AI coding assistants when working with code in this repository.

## Repository Overview

This repository contains the digital infrastructure for **Ortex Industries** (manufacturer of customized MDF/acrylic items, lanyards, corporate gifts, OEM/white-label production). It is split into three **independent npm projects** (no root workspace); the root `README.md` has the full directory tree and conventions.

1. **`Ortex.Web`**: The marketing/lead-gen single-page app (React 19 + Vite 8 + Tailwind CSS v4). Brand showcase, product catalog, quote wizard, lead capture, Live Orty voice assistant.
2. **`Ortex.Admin`**: The business admin dashboard (React 19 + Vite 8 + Tailwind CSS v4 + Supabase). Manages leads, quotations, invoices, payments, customers, catalogue, social, automation and the AI telecaller. Owns the Supabase schema (`supabase/migrations`) and Deno edge functions (`supabase/functions`).
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
npm run build     # check-env → check-meta → vite build → prerender static routes into dist/
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
npm run dev             # Vite dev server on :5180 (DEVELOPMENT Supabase project)
npm run dev:staging     # against the staging Supabase project
npm run build           # check-env → production build to dist/
npm run build:staging
npm run check:env       # verify the production build is not pointed at the dev DB
npm run provision -- <ref>  # push migrations + deploy every function to a project
npm run preview
npm run lint            # oxlint
npm test                # vitest — pure tests (src/lib/analytics.test.js)
```

### Architecture
* **Environments**: **two Supabase projects, three environments** — development (`npm run dev`) and staging share one non-production database; production has its own. Vite loads `.env` in every mode and `.env.<mode>` overrides it, so every build runs `scripts/check-env.mjs` first: it refuses a production build that would fall back to the shared dev/staging database, and deliberately allows dev and staging to match. See `Ortex.Admin/docs/ENVIRONMENTS.md`.
* **Database & Auth**: Supabase. `src/data/store/repository.js` resolves to `apiStore` when env vars are present, else `localStore` (offline fallback). Auth is password + emailed OTP (`src/lib/auth.js`), invite-only signups, RLS in migrations.
* **Source layout**: `src/pages/` one page per business module plus the hub pages (`Crm`, `Catalog`, `Billing`, `Insights`) and `Login`; `src/components/{layout,ui,editors,documents}/` — `layout/` AdminLayout (sidebar shell, Ctrl/⌘K `CommandPalette`, right-side `NotificationsDrawer`) + PageHeader, `ui/` (`Ui.jsx` kit, `Icons.jsx` Iconsax adapter, `Chart`, `SectionCard`, `PasswordCard`), `editors/` (CustomerFields, ShipToFields, LineItemsEditor, ImageField, ProductImport, TallyInvoiceImport), `documents/` (DocumentView, ReceiptView); `src/hooks/` (`useCollection.js`, `useProfile.js`); `src/lib/` pure helpers (`pricing.js` GST engine, `analytics/`, `format.js`, `id.js`, `periods.js`, `roles.js`); `src/data/{store,domain,seed}/` — `store/` repository facade + apiStore/localStore/supabaseClient/sync, `domain/` schema, domain rules, settings defaults, module registry, `seed/` demo data; `src/services/` outbound integrations (notify, users, integrations).
* **Edge functions**: `supabase/functions/<name>/index.ts`, each deployable alone. Shared code lives in `supabase/functions/_shared/`: `http.ts` (CORS + `json()`), `auth.ts` (`requireStaff(req)` staff gate), `gemini.ts` (`generateContent`, `extractText`, `logAiUsage`). Import from there instead of redefining. Type-check with `npm run check:functions` (fetches Deno 2 via npx; CI runs it on every push).
* **Key Features**:
  * **Design language**: Metronic 9 Demo 1 (Tailwind/React) — white canvas, zinc neutrals, blue-500 primary, 280px sidebar + 70px header with breadcrumb, 12px cards with `CardHeader`/`CardFooter`, buttons on the 3-size squircle scale (see **Design system** below), row-ruled tables via the `mt-head`/`mt-body` classes in `index.css` (horizontal rules only — no vertical column dividers, no outer border). Surfaces are **flat**: every `--shadow-*` token in `index.css` is `none` except the two overlay tokens, which keep a 1px ring so floating UI still has an edge. Don't reintroduce a drop shadow on a component. Tokens live in `src/index.css`; the kit in `components/ui/Ui.jsx`.
  * **Full-Page Editors**: Quotation and Invoice creators use clean full-page dashboards rather than modal views, built on `components/editors/DocumentEditorShell.jsx` (Keystone record-page pattern: back circle + number title + status label, money tiles, sectioned cards, sticky footer). Both editors use `CustomerPicker` (searchable combobox, "create new" first) and `LivePreview` (the real `DocumentSheet` scaled beside the form); layout is a 2/3 (Details & Line Items) and 1/3 (Settings & Notes) split, with the Line Items grid occupying a full-width section.
  * **Spacious Line Items Editor**: `LineItemsEditor` uses a strict `table-fixed` layout with a `min-w-[1024px]` viewport, aligning headers and input cells with matched width classes (`w-24`, `w-20`, etc.).
  * **Hub pages** (tabbed workspaces, pattern in `src/pages/Crm.jsx`): `/crm?tab=leads|enquiries|voice` (Leads, Enquiries, VoiceLeads), `/catalog?tab=products|categories|work`, `/billing?tab=invoices|payments`, `/insights?tab=growth|events` (Growth, Automation). Each embedded page accepts `embedded` and swaps its `PageHeader` for `ActionBar`; a hub is guarded by `HubGuard` (any of its module keys) and each tab by its original module key, so per-user permissions are unchanged. The old single-page routes redirect to the matching tab and preserve router state (`openId`, `openLeadId`, `fromCustomer`, `fromEnquiry`). Enquiries and Voice calls read the same `enquiries` collection; Pipeline is `leads`.
  * **Design system** (Keystone port): tokens live in `src/index.css` as a Tailwind v4 `@theme` over HSL vars — flat shadowless surfaces, 1px hairlines, squircle corners (`rounded-card` 20px, applied with the `squircle` utility on `Card`; `rounded-xl` 20px modals), one indigo brand hue used mostly as tints. **Buttons come in exactly three sizes** — `sm` 30px/12px-500/r12, `md` 40px/14px-600/r16 (default), `lg` 50px/16px-600/r20 — set by `size` on `Button`; add `icon` for a square icon-only button, and never override height, text, padding or radius from a page. Padding is derived, never hand-picked: vertical = (height − line-height) / 2, horizontal = exactly 2× that (7/14, 10/20, 13/26), so the padding alone sums to the stated height. Every button carries `squircle`. `rounded-btn` (6px) is for misc 32px controls (pagination, chips, segmented), not the Button kit. Use semantic utilities only (`bg-card`, `text-muted-foreground`, `text-subtle-foreground`, `text-warning-text`, `bg-success/12`, `shadow-overlay-lg`, `squircle`, `btn-sheen`, `rows-in`); never raw Tailwind hues (`amber-600`) or hex, and no in-page `shadow-*`. Tables: put `mt-head` on the `<thead>` and `mt-body` on the `<tbody>` — always both — and let `index.css` do the rest (40px header filled with the **canvas grey** (`--background`, not `--subtle` — at 98% lightness `--subtle` is invisible on a white card), 14px/400 sentence-case labels, 1px row rules with none on the last row, `hover:bg-subtle`). Those rules are **unlayered** CSS, so they beat Tailwind utilities: a `px-4 py-3` or `font-semibold` on a `<th>` is dead markup, not an override. Only the editor grid (`LineItemsEditor`), the two modal preview tables and the printed `DocumentSheet` opt out. Kit: `components/ui/Ui.jsx` (Button/Card/Badge/StatCard/Field/Input/Modal/Drawer/Chip/Tabs/Banner/CloseButton).
  * **Public catalogue boundary** (migration 0020): the marketing site reads `products_public` / `categories_public`, **never** the tables. Those views rebuild the doc key by key as an allow-list, so price, cost, HSN and GST never leave the console — a new product field is invisible to the site until it is named in the view. Visibility is `doc.showOnWebsite` (absent = visible), separate from `status` so a product can be sellable in the console yet unlisted publicly. The anon policies on `products`/`categories` are dropped. Adding a website-facing field means editing the view, not just the doc.
  * **Bulk product import** (`components/editors/ProductImport.jsx`): downloads an .xlsx template (Products sheet + "How to fill" sheet) or CSV, accepts either back, and carries a "Copy AI prompt" button that puts a column-exact prompt on the clipboard so ChatGPT can produce a matching sheet. Two photo routes: the `imageUrls` column (links, stored as-is) and **pictures pasted into the sheet** — SheetJS ignores drawings, so `lib/xlsxImages.js` unzips the .xlsx itself and walks sheet → `_rels` → `drawing1.xml` anchors → `_rels` → `xl/media/*`, keying each picture by its anchor's `<xdr:from><xdr:row>` (0-based, header included; data row *n* is sheet row *n+1*). Those bytes upload to the `product-images` bucket at **import** time, never at preview, so a cancelled preview leaves no orphans. `xlsx` and `fflate` are dynamically imported so they stay out of the main bundle.
  * **Form controls**: one `CONTROL` class string in `Ui.jsx` backs `Input`, `Textarea` and `Select` — 45px tall, 16px squircle corners. `Select` is **not** a native `<select>`: it is a portal-rendered listbox that still takes `<option>` children and a `value`/`onChange` pair (the handler gets an event-shaped `{ target: { value } }`), so call sites are unchanged. It portals rather than absolutely positions because several selects sit inside scroll containers that would clip the popup.
  * **List-page toolbars**: one row above the table: the `ChipGroup` filter rail on the **left**, and a right-pinned (`ml-auto`) cluster of `SearchInput` then the secondary actions, spaced `gap-[10px]`. Toolbar controls match the 45px search pill rather than the three standard button sizes: `ToolbarButton` (labelled — Payout, Import, IndiaMART CSV) and `ExportButton` (45×45, icon-only, white fill that stays white on hover, 20px bold download icon going muted→primary) both take `h-[45px] rounded-[18px] squircle` from one `TOOLBAR_SHAPE` constant in `Ui.jsx`. Use those two components; never override a height or radius from a page. The page title and the primary create button live in the table's own `CardHeader` (`title` + `action`). `Enquiries` is the reference implementation; `InvoiceFilters` and `CallFilters` take the cluster's buttons as an `actions` prop. `SearchInput` hides the browser's native clear cross and draws its own 18px Iconsax bulk cross, muted by default and `text-danger-hover` (#E82646) on hover.
  * **Users** (`/users`, module key `users`, admin only — labelled "Users" in the sidebar): accounts, roles and per-user module access. Creating a login is the `admin-create-user` function; everything afterwards is `admin-manage-user` (`set-active` / `reset-password` / `delete`), reached through `setUserActive`/`resetUserPassword`/`deleteUser` in `src/services/users.js` and the row kebab in `src/pages/users/RowActions.jsx`. Deactivating writes `profiles.active = false` **and** bans the auth user, so RLS hides everything and sign-in (password or OTP) is refused. Deleting removes the auth user; `profiles.id` cascades. The function refuses to disable or delete the caller's own account — that rule lives server-side, not just in the UI.
  * **Profile & account** (`/profile`): name, password (`PasswordCard`, shared with Settings) and a profile photo. `AvatarUploader` (in `src/pages/profile/`) centre-crops to a 256px square via `lib/avatarUpload.js` and uploads to the public `avatars` bucket (migration 0019, owner-only writes scoped to `<uid>/`); the URL lands on `profiles.avatar_url` and `refreshProfile()` from `hooks/useProfile` re-reads the row everywhere it is drawn. The header renders Iconsax **Linear** icons (the rest of the app is `Bulk`) — pass `variant="Linear"` on those icons.
  * **A4 Print Engine**: Print (`window.print()`) and PDF Download (`html2pdf.js`). Documents fit A4 (`210mm x 297mm`) with computer-generated notes locked to the bottom via CSS flex (`mt-auto`).
  * **AI Telecaller** (`/telecaller`, module key `telecaller`): outbound AI sales calls. `telecaller_jobs` (what to call and why: followup / pitch / feedback / upsell / manual) and `telecaller_calls` (each dial with transcript + Gemini analysis). Engine lives in `supabase/functions/_shared/telecaller.ts` (brief → provider → analysis → lead/enquiry update → next job); functions `telecaller-dial` (staff "call now"), `telecaller-engine` (pg_cron sweep: auto-queue + dial due), `telecaller-webhook` (provider end-of-call). Providers: `simulate` (Gemini role-play, default) and `vapi` (real calls). Settings block `settings.telecaller` is mirrored by `DEFAULT_TELECALLER` in the shared module — keep them in step. `AiCallButton` (in `src/pages/telecaller/`) is reused on Voice Leads cards and the Lead drawer. `PracticeModal` + `useLiveCall` run a browser practice call over Gemini Live (mic in, voice out, same `orty-live-token` flow as the website) and post the transcript to `telecaller-dial` `{ mode: "record" }`; `{ mode: "brief" }` returns the prompt. `settings.telecaller.scripts` holds persona + per-kind script overrides used by `buildBrief`. Setup: `docs/guides/TELECALLER_SETUP.md`.
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
* `docs/guides/GETTING_STARTED.md`, `docs/guides/META_SETUP.md`, `docs/guides/TELECALLER_SETUP.md` — setup guides.
* `Ortex.Admin/docs/` — PRD, environments, growth tracking, leads & receipts.
* `Ortex.Web/docs/DEPLOY_HOSTINGER.md` — static deploy guide.
