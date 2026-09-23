# Ortex.Web (marketing site)

Repo-wide rules, environments and cross-app mirrors are in the root `CLAUDE.md`.

```bash
npm run dev       # Vite dev server. Talks to the LIVE Supabase project (see root CLAUDE.md)
npm run build     # check-env -> check-meta -> vite build -> SSR build -> prerender into dist/
npm run preview
npm run lint      # oxlint
```

Building needs `.env.production` (same Supabase URL/anon key as the Admin), or it bakes the static demo catalogue. `prerender.mjs` reads the `.env` files itself (a plain node script sees an empty `process.env`) and prints `[live catalogue]` when real data was used; it warns loudly when it fell back. `.env.development` holds the same values and declares `ALLOW_SHARED_SUPABASE=true`, without which `check-env.mjs` refuses.

## Architecture

* **Routing**: `src/App.jsx` (pages lazy-loaded). Route SEO metadata is mirrored in `scripts/routes-meta.mjs` (including `/`); `check-meta.mjs` fails the build if they drift. Every page calls `useDocumentMetadata`.
* **A new route needs**: an entry in `routes-meta.mjs`, and an entry in `PAGE_ACTIVITY` in `lib/tracker.js` (or it logs as "Not found page visit").
* **Layout**: `components/layout/` (Navbar, Footer, ScrollToTop); shared blocks in `components/ui/` (`PageHero`, `PageCTA`, `Section`); Home-only sections in `components/home/`. Icons come only from `components/ui/Icons.jsx` (Iconsax adapter), never from a package directly.
* **Data**: no server of its own. `lib/supabaseClient.js` reads the catalogue/work photos and inserts leads. The site reads the `products_public` / `categories_public` views (Admin migration 0020), never the tables, so price, cost, HSN and GST never reach it. The quote wizard and contact form queue to `localStorage` when offline (`lib/leads.js`).
* **Single source of facts**: `constants/business.js` (`STATS`, `TERMS`, `MOQ_TIERS`, `PRODUCT_RANGE`, `spokenPhone`) and `constants/site.js` (`SITE_URL`, `ADDRESS`, contact). About, FAQ, Anu's prompt and `STANDARD_RANGE` all read these; change a fact there, never in a copy.

## Prerender / SEO

* Public site: **https://bizgift.ortexindustries.in** (`SITE_URL`). `index.html` and `public/robots.txt` spell it by hand and the prerender fails if they disagree. `www.ortexindustries.in` is a separate, older site: never point a canonical there.
* `prerender.mjs` renders the **whole page body** into `dist/<route>/index.html` for every static route, live category and product, plus `404.html` and a sitemap (with `lastmod` and images). Product URLs are `/products/:slug/:productSlug` (`productSlugs()` in `lib/catalogCore.js`), so renaming a product in the console changes its URL at the next build.
* `entry-server.jsx` renders with `progressiveChunkSize: Infinity`, and the build fails if a page contains `<!--$?-->`. Otherwise React 19.2 "outlines" large Suspense boundaries (spinner in `<main>`, page hidden after the footer), which causes layout shift and hides content from crawlers.
* **Hydration**: `main.jsx` hydrates only when `#root[data-route]` equals the URL. Live catalogue/work rows are embedded as `<script type="application/json" id="ortex-data">` and read by `lib/preloaded.js`, so `useCatalog`/`useWork` start from what the HTML was rendered with. **Anything that renders differently on server and client breaks hydration**: browser-only UI (Anu, cookie banner) mounts after load+idle in `AppLayout`, and above-the-fold heroes use the CSS `hero-in` class, not Framer `initial` (inline `opacity:0` delays LCP).
* JSON-LD: `index.html` holds one `@graph` (WebSite + Organization/LocalBusiness, whose address must match `ADDRESS`); pages add blocks through `hooks/useJsonLd.js`. **No `Product`/`Offer` markup**: prices are never public and Google rejects a Product without one. FAQ answers stay in the DOM (`hidden`) when collapsed. `RollText` draws glyphs with `::before` so link text is not doubled.
* **A console change is indexable only after a rebuild + upload.**

## Deploy

Static Hostinger (`public/.htaccess`, `docs/DEPLOY_HOSTINGER.md`): no SPA catch-all (real 404s), 301 bare domain -> www, strips trailing slashes, 410s a stale URL. `vercel.json` also exists. **Never delete `public/googled41e542536c1f8f5.html`**: it verifies the Google Search Console property.

## Analytics

`lib/tracker.js` writes each visit to `user_activities` (and a derived row to `event_logs`), read by the console's Insights. `App.jsx` calls **`trackPageView`**, never `trackActivity`: the label comes from `PAGE_ACTIVITY`. A 300ms debounce collapses double effects and redirect hops. `isLocalTraffic()` drops localhost/LAN rows unless `VITE_TRACK_LOCAL=true`; `Ortex.Admin/supabase/maintenance/remove-local-traffic.sql` cleans up old ones (never run by `db push`). Geolocation is IP-based and **consent-gated**: ipapi.co, then ipwho.is when its daily cap runs out.

## Anu, the website voice assistant (`components/ui/live-orty/`)

Gemini Live via `@google/genai`, with a token minted by the `orty-live-token` edge function.

* **UI**: one bottom-right widget morphing (shared `layoutId`) between `Launcher`, `CallPanel` (live / error / summary) and `MiniCall`. `AnuAvatar` draws `public/img/anu.jpg` inside a canvas ring driven by `readLevel()` (it breathes, reacts to the caller's voice, turns red on error), so the caller can see the line is open. The photo is optional: on error it falls back to `Orb`. **No mute button** (owner's decision): a muted line looks dropped, so the mic stays open for the whole call. `recording.js` still exposes an unused `setMicEnabled`.
* **Knowledge**: general facts are `prompt.js`, built from `constants/business.js` and `constants/site.js` plus hand-written content copied from `FAQ.jsx`, `products.js` and `About.jsx`. **A fact changed on those pages must be changed in the prompt too.** Products are live: `catalogue.js` reads `anu_knowledge` (Admin migration 0028, trigger-maintained, anon-readable, realtime), falling back to the 0020 views + `work`. `watchCatalogue()` follows changes during a call (realtime + a 30s version poll), and each `lookup_product` reply carries `catalogue_changed_during_call`, because the system instruction cannot be rewritten mid-call. A product edited in the console is therefore live on the next call with no deploy.
* **`lookup_product` has three tiers, none a refusal**: (1) *listed*, the real product; (2) *standard*, an everyday product in `STANDARD_RANGE` that the console has not been filled in with yet (mirror of the prompt's "WHAT ORTEX MAKES": keep them in step); (3) *custom*, answered with material families, customisation methods, an `ask` list and `closest_we_make`. `classifyItem()` decides `custom`, and only tier 3 becomes "Custom item (not in catalogue)".
* **Matching rules** (each fixed a real mis-answer): products need a hit on name/category/material, not description; `STANDARD_RANGE` matches on the `KINDS` phrase (and a singularised query), not bag-of-words; add-ons come from `KIND_AFFINITY` keyed on what the product IS, with category `AFFINITY` only as fallback (console categories are unreliable). `read()` strips marketplace junk from names (`NAME_NOISE`) because she reads them aloud. A missing material is inferred from the name (confirmed) or the description (unconfirmed: she says the team will confirm); `FITTING_WORDS` stops "metal hooks" making a product metal; a set is always unconfirmed. `moqOf()` treats a minimum of 1 as "not set".
* **The page, not the model, owns the rules of a call**: every `capture_lead` is **merged over what the call already captured** (`callLeadRef`: blanks fall back, sent values win, a sent `items` list replaces ours), then validated by `validateLead` in `leads.js` (real name, 10-digit mobile, numeric quantity per item incl. lakh/crore, timeline, city), and answered with `missing` + a `next` instruction naming the actual product or field. Without the merge, a partial payload failed and she re-asked for details she already had. `end_call` with reason `completed` is refused once (`MAX_END_REFUSALS`) while details are missing. The "Your details" checklist renders the same validated state.
* **Recording**: `recording.js` mixes both voices into one Opus file and, only when the call produced a lead, uploads it to the private `voice-recordings` bucket (Admin migration 0025). Each lead row carries `doc.call = { id, recording, confirmed, complete }`. The Privacy Policy discloses the recording and Gemini processing; **the caller is not told during the call** (owner's decision, 2026-09-12). An in-call notice would be the safer position under the DPDP Act.
* **Call behaviour**: memory in sessionStorage (2h cap). The call auto-opens 5s after load **once per browser session** (`ortex_anu_autocall`). Audio contexts are created before the first `await` (autoplay); a timer-opened call shows "Turn on sound".
* **Audio pipeline**: the mic is captured by an AudioWorklet (`public/anu-mic-worklet.js`, a static file because the CSP allows worklets only from `'self'`; `ScriptProcessorNode` fallback) and must stay on a **zero-gain sink, never `destination`** (it feeds back as a tone). Tuning: explicit echoCancellation/noiseSuppression/AGC, `START_SENSITIVITY_LOW` + 200ms prefix, 500ms end-of-speech silence, `thinkingLevel: MINIMAL`, a playback lead that grows on each mid-reply underrun (120 -> 360ms), captions animate opacity only. Dev builds log underruns and reply latency; `window.__anu` reports output state.
