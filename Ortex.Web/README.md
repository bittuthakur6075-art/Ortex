# Ortex.Web — Marketing Site

Public website for Ortex Industries: brand story, product catalogue, industries,
quote calculator, contact/lead capture and the **Live Orty** voice assistant.

- **Stack**: React 19, Vite 8, Tailwind CSS v4, React Router v7, Framer Motion, Lenis, Iconsax icons (via `components/ui/Icons.jsx`, the same set as the Admin).
- **Backend**: none of its own. Reads the live catalogue and writes leads through the
  browser Supabase client (`src/lib/supabaseClient.js`); the voice assistant talks to the
  `orty-live-token` / `orty-chat` edge functions deployed from `Ortex.Admin/supabase`.
- **Static output**: `npm run build` verifies route metadata, builds to `dist/` and
  prerenders every static route so crawlers get real `<title>`/OG tags.

## Commands

```bash
npm install
npm run dev       # Vite dev server with HMR
npm run build     # check-meta → vite build → prerender
npm run preview   # serve dist/ locally
npm run lint      # oxlint (.oxlintrc.json)
```

Copy `.env.example` to `.env` and fill in the Supabase URL/anon key to enable the live
catalogue, lead submission and Live Orty locally.

## Source layout

```text
src/
├── App.jsx                 # route table, lazy pages, Live Orty mount
├── main.jsx
├── index.css               # Tailwind v4 @theme tokens + global styles
├── components/
│   ├── home/               # sections used only by the Home page
│   ├── layout/             # Navbar, Footer, ScrollToTop
│   └── ui/                 # shared: PageHero, PageCTA, Section (motion), LiveOrty …
├── constants/              # site.js (contact), categories, products, photos, founder
├── hooks/                  # useDocumentMetadata, useSmoothScroll, useWork
├── lib/                    # supabaseClient, catalog, leads, tracker, uploads, consent
└── pages/                  # one file per route
scripts/                    # routes-meta.mjs (single source of route SEO), check-meta, prerender
public/                     # favicon, manifest, robots, .htaccess, img/
docs/DEPLOY_HOSTINGER.md    # static hosting guide (Apache); vercel.json covers Vercel
```

Every page calls `useDocumentMetadata()` first. When adding a route, register it in
`src/App.jsx` **and** `scripts/routes-meta.mjs`; `npm run build` fails if they drift.
