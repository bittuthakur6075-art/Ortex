# Ortex.Web.Main (ortexindustries.in)

Repo-wide rules, environments and cross-app mirrors are in the root `CLAUDE.md`. This app shares Ortex.Web's stack and design language; read `Ortex.Web/CLAUDE.md` for the prerender and hydration rules, which apply here unchanged.

```bash
npm run dev       # Vite dev server. With production values in .env.development the form writes LIVE leads
npm run build     # check-env -> check-meta -> vite build -> SSR build -> prerender into dist/
npm run build:ci  # same without credentials (staging mode), as CI runs it
npm run lint      # oxlint
```

## What it is

The company site on the bare domain, eight pages plus a 404: `/`, `/about`, `/products`, `/industries`, `/portfolio`, `/contact`, `/privacy`, `/terms`. The URLs are those of the Hostinger Horizons site it replaces (they are indexed), plus the two legal pages that site linked to but never had.

* **The pages are static.** All copy, products, industries and portfolio items live in `src/constants/content.js`; contact details in `src/constants/site.js`; `STATS` (and Anu's facts) in `src/constants/business.js`. No page reads the database, at build time or in the browser. A content change is a rebuild and upload.
* **The one dynamic part is the contact form**: `src/lib/leads.js` inserts into `enquiries` with source `"Website contact form"` and `site: "ortexindustries.in"` (the console's Leads screen shows it beside Ortex.Web's leads). Same reference format, retry, aborting 20 s timeout, error classification, outbox (one replay at a time; voice rows in sessionStorage for 2 h) and `save_voice_lead` path as `Ortex.Web/src/lib/leads.js`: a retryable failure is queued and the visitor is told to WhatsApp, a permanent refusal keeps the form filled and offers WhatsApp. The Supabase client is imported on demand, so no page download carries it until a submit or a non-empty outbox. Field limits in `useContactForm.js` match the anonymous insert policy (Admin migration 0050).
* **Anu, the voice assistant, is Ortex.Web's code, copied byte for byte**: `src/components/ui/LiveOrty.jsx`, `src/components/ui/live-orty/*`, `src/constants/business.js`, `public/anu-mic-worklet.js`, `public/img/anu.jpg`. **Change them in Ortex.Web and copy them here**; `scripts/check-anu-mirror.mjs` (`npm run check:anu`, part of `build` and `build:ci`) fails the build on any drift. Everything about how she works is in `Ortex.Web/CLAUDE.md`. What differs per site lives outside those files: `QUOTE_PATH` (`/contact` here) and `CONTACT.hours` in `constants/site.js`, and `submitEnquiry` in `lib/leads.js`, which stamps her leads `site: "ortexindustries.in"` beside her own source "Voice assistant (Anu)", so they reach the console's Voice calls like Ortex.Web's. She mounts after load + idle in `App.jsx` (never prerendered), reads the live catalogue (`anu_knowledge`) only when a call starts, and auto-calls once per browser session like on Ortex.Web. `@google/genai` is pinned to the same version as Ortex.Web.
* **No analytics or cookies.** The Privacy page says so and discloses Anu (Gemini processing, the recording, session storage). Adding analytics or cookies means rewriting `src/pages/Privacy.jsx`.

## Conventions

* **A new route needs**: the page, a `<Route>` in `App.jsx`, an entry in `scripts/routes-meta.mjs` (title under 65, description under 165 characters, identical to the page's `useDocumentMetadata` call or `check-meta.mjs` fails the build).
* **Shared with Ortex.Web, copied rather than linked** (the apps are independent npm projects): `index.css`, `components/ui/{Section,PageHero,PageCTA,RollText,WhatsAppIcon,Icons}.jsx`, the hero and footer CSS, `Navbar.jsx`, `ScrollToTop.jsx`, `useSmoothScroll`, `useDocumentMetadata`, the contact form components. A design fix in one site should usually be made in both.
* **Facts mirrored with Ortex.Web**: contact details and address (`site.js`, both `index.html` LocalBusiness blocks). `STATS` is in `business.js`, the checked copy of Ortex.Web's (`content.js` re-exports it). Never put invented figures on the site.
* **Images**: product photos are WebP in `public/img/portfolio/`, named after the item; `portfolioImage(name)` builds the URL. Keep a new photo under about 1600 px on its long edge.
* `SITE_URL` is `https://ortexindustries.in`; `index.html` and `public/robots.txt` spell it by hand and the prerender fails if any other `*.ortexindustries.in` origin appears in them.

## Deploy

Static Hostinger: upload the contents of `dist/` to the domain's `public_html`. `public/.htaccess` serves real 404s (no SPA catch-all), 301s `www` to the bare domain and strips trailing slashes. Turn on hPanel's "Force HTTPS". Building needs `.env.production` (same Supabase URL and anon key as Ortex.Web); set `GOOGLE_SITE_VERIFICATION` there once the Search Console property exists.
