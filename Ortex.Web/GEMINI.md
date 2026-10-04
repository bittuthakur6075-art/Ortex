# GEMINI.md — Ortex.Web (Marketing SPA)

This guide covers the public marketing and lead-generation site at https://bizgift.ortexindustries.in.
Cross-repo rules and invariants are defined in the root `GEMINI.md`.

---

## 1. Quick Commands (Windows PowerShell)

```bash
cmd /c "npm run dev"       # Vite dev server on localhost; talks to production Supabase
cmd /c "npm run build"     # check-env -> check-meta -> vite build -> SSR build -> prerender into dist/
cmd /c "npm run preview"   # Preview prerendered static build
cmd /c "npm run lint"      # oxlint
```

* Building for production requires `.env.production` containing the Supabase URL and anon key; otherwise it warns and uses demo catalog data.
* `.env.development` contains `ALLOW_SHARED_SUPABASE=true`, which permits the local dev server to query the live catalog and write live leads.

---

## 2. Architecture & Data Flow

* **Routing**: Defined in `src/App.jsx`. All pages are lazy-loaded.
  * Every new route **must** have a corresponding entry in `scripts/routes-meta.mjs` and `PAGE_ACTIVITY` in `src/lib/tracker.js`. `check-meta.mjs` verifies this at build time.
* **Layout & Icons**:
  * Chrome in `src/components/layout/` (`Navbar`, `Footer`, `ScrollToTop`).
  * Reusable UI blocks in `src/components/ui/` (`PageHero`, `PageCTA`, `Section`).
  * Icons must **only** be imported from `src/components/ui/Icons.jsx` (Iconsax adapter), never from an icon package directly.
* **Data Boundary**:
  * Reads public catalog data only through the `products_public` and `categories_public` Supabase views (Migration 0020). Internal base cost, margin, GST rate, and HSN codes are never exposed to the client.
  * The B2B Quote Wizard and Contact form queue submissions to `localStorage` if network connectivity fails (`src/lib/leads.js`). Anonymous payloads are capped at 32 KB by database constraints.
* **Single Source of Truth**:
  * Company facts, terms, tiers, and phone numbers live strictly in `src/constants/business.js` and `src/constants/site.js`. Never hardcode duplicate contact facts in page copy.

---

## 3. SEO & Prerender Pipeline

* **Prerender Engine**: `scripts/prerender.mjs` renders the complete DOM into `dist/<route>/index.html` for all static routes, categories, and products.
* **Hydration Protection**:
  * `src/main.jsx` hydrates only when `#root[data-route]` matches the browser URL.
  * Dynamic catalog rows are injected as `<script type="application/json" id="ortex-data">` and preloaded by `src/lib/preloaded.js`.
  * **SSR / Hydration Invariant**: Server and client renders must match byte-for-byte. Browser-only UI (e.g., Live Orty voice widget, cookie banner) mounts strictly after idle.
* **Structured Data**:
  * Organization, WebSite, and LocalBusiness schema live in `index.html`. Pages inject additional schema via `src/hooks/useJsonLd.js`.
  * Do not inject `Product` or `Offer` schema because wholesale prices are not publicly listed (Google rejects unpriced offers).
* **Static Deployment**:
  * Hosted on Hostinger (`public/.htaccess`). Trailing slashes are stripped; canonical domain is `https://bizgift.ortexindustries.in`. Never reference the legacy `www.ortexindustries.in` domain.
  * **Never delete `public/googled41e542536c1f8f5.html`** (Google Search Console verification).

---

## 4. Live Orty / Anu (Website Voice Assistant)

Located in `src/components/ui/live-orty/`.

* **Audio & Live Protocol**:
  * Connects directly to Google Gemini Live using `@google/genai`.
  * Ephemeral session tokens are minted by the `orty-live-token` Edge Function (rate-limited to 6 per visitor per 10 minutes, 400 daily).
  * Microphone input is captured via `public/anu-mic-worklet.js` on an AudioWorklet connected to a zero-gain sink (never route directly to `destination` or it feeds back).
* **Catalog Knowledge**:
  * Reads trigger-synchronized data from `anu_knowledge` (Migration 0028).
  * Three-tiered lookup:
    1. *Listed*: Found in database.
    2. *Standard*: Common manufacturing item in `STANDARD_RANGE`.
    3. *Custom*: Clarifies material options and custom specs.
* **Lead Capture & Audio Recording**:
  * Leads extracted by Anu are merged into `callLeadRef` and validated by `validateLead()` before completion.
  * High-intent calls producing a lead record both audio channels into an Opus file uploaded to the private `voice-recordings` bucket.
