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

* **Everything is static.** All copy, products, industries and portfolio items live in `src/constants/content.js`; contact details in `src/constants/site.js`. Nothing is read from the database, at build time or in the browser. A content change is a rebuild and upload.
* **The one dynamic part is the contact form**: `src/lib/leads.js` inserts into `enquiries` with source `"Website contact form"` and `site: "ortexindustries.in"` (the console's Leads screen shows it beside Ortex.Web's leads). Same reference format, retry, 20 s timeout and localStorage outbox as `Ortex.Web/src/lib/leads.js`; a failed insert is queued and the visitor is told to WhatsApp. The Supabase client is imported on demand, so no page download carries it until a submit or a non-empty outbox. Field limits in `useContactForm.js` match the anonymous insert policy (Admin migration 0050).
* **No analytics, cookies or Anu.** The Privacy page says so. Adding any of them means rewriting `src/pages/Privacy.jsx`.

## Conventions

* **A new route needs**: the page, a `<Route>` in `App.jsx`, an entry in `scripts/routes-meta.mjs` (title under 65, description under 165 characters, identical to the page's `useDocumentMetadata` call or `check-meta.mjs` fails the build).
* **Shared with Ortex.Web, copied rather than linked** (the apps are independent npm projects): `index.css`, `components/ui/{Section,PageHero,PageCTA,RollText,WhatsAppIcon,Icons}.jsx`, the hero and footer CSS, `Navbar.jsx`, `ScrollToTop.jsx`, `useSmoothScroll`, `useDocumentMetadata`, the contact form components. A design fix in one site should usually be made in both.
* **Facts mirrored with Ortex.Web**: contact details and address (`site.js`, both `index.html` LocalBusiness blocks) and `STATS` (`content.js` vs `Ortex.Web/src/constants/business.js`). Never put invented figures on the site.
* **Images**: product photos are WebP in `public/img/portfolio/`, named after the item; `portfolioImage(name)` builds the URL. Keep a new photo under about 1600 px on its long edge.
* `SITE_URL` is `https://ortexindustries.in`; `index.html` and `public/robots.txt` spell it by hand and the prerender fails if any other `*.ortexindustries.in` origin appears in them.

## Deploy

Static Hostinger: upload the contents of `dist/` to the domain's `public_html`. `public/.htaccess` serves real 404s (no SPA catch-all), 301s `www` to the bare domain and strips trailing slashes. Turn on hPanel's "Force HTTPS". Building needs `.env.production` (same Supabase URL and anon key as Ortex.Web); set `GOOGLE_SITE_VERIFICATION` there once the Search Console property exists.
