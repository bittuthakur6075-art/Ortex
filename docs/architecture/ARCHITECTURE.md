# Project Memory: Ortex Industries Website

This document provides a comprehensive analysis and developer reference ("memory") for the Ortex Industries website codebase. It outlines the project's purpose, technology stack, directory structure, custom styles, page roles, and key configuration values to serve as context for subsequent development or maintenance tasks.

---

## 1. Project Overview & Business Context

**Ortex Industries** (Ortex Industries Private Limited) is a manufacturer specializing in premium customized products, OEM manufacturing, and white-label production.

*   **Primary Products**: MDF items (magnets, keychains, frames), Acrylic products (keychains, badges, stands), Custom printed lanyards & ID accessories, Examination boards, Customized clipboards, Corporate gifts, and Branding services.
*   **Target Industries**: Corporates, Educational institutions, Government departments, Healthcare facilities, Event management agencies, Retailers, and Marketing agencies.
*   **Service Logistics**: Offers **PAN India** delivery and **worldwide export** support.
*   **Key Business Contacts**:
    *   **Phone & WhatsApp Primary**: `+91-9211947188`
    *   **Phone Secondary**: `+91-8448663297`
    *   **Email**: `sales@ortexindustries.in`
    *   **Business Hours**: Mon–Sat: 9:00 AM – 6:00 PM (Sunday Closed)

---

## 2. Technology Stack & Dependencies

The project is built on a modern frontend React-based single-page application setup, powered by **Vite** and styled using **Tailwind CSS v4.0.0+**.

*   **Core Libraries**:
    *   **React 19** (`^19.2.7`) & **React DOM** (`^19.2.7`)
    *   **Vite 8** (`^8.1.1`) as the build tool and development server.
    *   **React Router DOM 7** (`^7.18.1`) for page navigation.
*   **Styling & Merging**:
    *   **Tailwind CSS 4** (`^4.3.2`) with Vite integration via `@tailwindcss/vite` (`^4.3.2`).
*   **Icons & Motion**:
    *   **Framer Motion 12** (`^12.42.2`) for scroll/fade animations and modal transitions.
    *   **Lucide React 1** (`^1.23.0`) for clean vector icons.
*   **UI Components / Utilities**:
    *   **Sonner** (`^2.0.7`) for rich, customizable toast alerts.
    *   **Oxlint** (`^1.71.0`) as the linter.

---

## 3. Directory Structure

The repository holds three independent npm projects plus shared docs (see the root
`README.md` for the full tree and conventions).

```text
Ortex/
├── Ortex.Web/                      # marketing SPA (React 19 + Vite 8 + Tailwind v4)
│   ├── scripts/                    # routes-meta.mjs, check-meta.mjs, prerender.mjs
│   ├── public/                     # favicon, manifest, robots, .htaccess, img/
│   ├── docs/DEPLOY_HOSTINGER.md
│   └── src/
│       ├── App.jsx                 # route table; pages + LiveOrty are lazy-loaded
│       ├── components/
│       │   ├── home/               # Home-only sections (Welcome, Capabilities, Process …)
│       │   ├── layout/             # Navbar, Footer, ScrollToTop
│       │   └── ui/                 # PageHero, PageCTA, Section (motion primitives),
│       │                           # Hero, LiveOrty, PhotoLightbox, CookieConsent …
│       ├── constants/              # site.js, categories.js, products.js, photos.json, home.js
│       ├── hooks/                  # useDocumentMetadata, useSmoothScroll, useWork
│       ├── lib/                    # supabaseClient, catalog/catalogCore, leads, tracker, uploads, consent
│       └── pages/                  # one component per route
├── Ortex.Admin/                    # admin console
│   ├── supabase/
│   │   ├── migrations/             # schema, RLS, storage policies
│   │   └── functions/              # Deno edge functions; _shared/{http,auth,gemini}.ts
│   ├── test/fixtures/              # sample TallyPrime XML
│   ├── docs/                       # PRD, ENVIRONMENTS, GROWTH_TRACKING, LEADS_AND_RECEIPTS
│   └── src/
│       ├── App.jsx                 # auth gate + module routing
│       ├── components/
│       │   ├── layout/             # AdminLayout, PageHeader
│       │   ├── ui/                 # Ui.jsx kit, Icons.jsx Iconsax adapter, Chart
│       │   ├── editors/            # CustomerFields, ShipToFields, LineItemsEditor, imports
│       │   └── documents/          # DocumentView, ReceiptView (A4 print/PDF)
│       ├── data/
│       │   ├── store/              # repository facade, apiStore/localStore, supabaseClient, sync
│       │   ├── domain/             # schema, domain rules, settings defaults, module registry
│       │   └── seed/               # demo data
│       ├── services/               # notify, users, integrations
│       ├── hooks/                  # useCollection(s)/useSettings/useSorting, useProfile
│       ├── lib/                    # pricing, analytics, format, id, csv, auth, imageUpload
│       └── pages/                  # Login + one page per business module
├── Ortex.Tally.Connector/          # Node CLI: src/{config,source,sync,tallyClient,tallyXml}.js
├── docs/                           # this file, PM backlog/roadmap, guides
└── .github/workflows/ci.yml        # lint + build (Web, Admin), fixture (Connector)
```

---

## 4. Key Configurations & Styling System

### 4.1. Tailwind v4 `@theme` (in `src/index.css`)
The project utilizes Tailwind v4's direct CSS `@theme` configuration. The layout overrides standard Tailwind shadows to maintain a flat/flat-bordered aesthetic:

*   **Shadow overrides**: All default box shadows (`--shadow`, `--shadow-md`, `--shadow-lg`, etc.) are explicitly configured to `none`.
*   **Font Family**: Custom sans font defined as `"Inter", sans-serif`.
*   **Theme Color Tokens (HSL)**:
    *   `--background`: HSL `0 0% 100%` (Dark: `222 47% 11%`)
    *   `--foreground`: HSL `222 47% 11%` (Dark: `0 0% 98%`)
    *   `--primary`: HSL `217 91% 60%`
    *   `--secondary`: HSL `200 33.3% 98.2%` (#f9fbfc) (Dark: `240 4% 16%`)
    *   `--accent`: HSL `217 91% 50%`
    *   `--whatsapp`: HSL `142 71% 49%` (Brand color helper for WhatsApp integration)

### 4.2. Layout Container Wrapper (`.lp-wrap`)
To control layout widths symmetrically, a custom container class `.lp-wrap` is implemented in `src/index.css` following Keystone specs:
```css
.lp-wrap {
  width: 100%;
  padding-left: 12px;
  padding-right: 12px;
  margin-left: auto;
  margin-right: auto;
}
/* Breakpoint Max Widths */
@media (min-width: 576px)  { .lp-wrap { max-width: 540px; } }
@media (min-width: 768px)  { .lp-wrap { max-width: 720px; } }
@media (min-width: 992px)  { .lp-wrap { max-width: 960px; } }
@media (min-width: 1200px) { .lp-wrap { max-width: 1140px; } }
@media (min-width: 1400px) { .lp-wrap { max-width: 1320px; } }
@media (min-width: 1590px) { .lp-wrap { max-width: 1440px; } }
```

---

## 5. Main Component & Page Logic

### 5.1. SEO Metadata Injection
The custom hook `src/hooks/useDocumentMetadata.js` dynamically updates `<title>` and `<meta name="description">` on mount. It is called at the beginning of each page component with specific descriptions to preserve good SEO practices.

### 5.2. Routing Context (`src/App.jsx`)
`App.jsx` handles routing using `react-router-dom`. It is wrapped in `<Router>` (BrowserRouter) and contains:
1.  `<ScrollToTop />` ensuring smooth transitions.
2.  `<Navbar />` (Sticky header).
3.  `<main className="flex-grow">` containing route paths: `/`, `/about`, `/products`, `/industries`, `/portfolio`, `/contact`, `/quote` (interactive quote builder), `/privacy`, and `/terms`.
4.  `<Footer />`
5.  `<LiveOrty />` (lazy-loaded) — the voice assistant.
6.  `<Toaster />` from `sonner` for application notifications.

### 5.3. Contact Submissions Form (`src/pages/Contact.jsx`)
*   **Validation**: Validates inputs for name, email (regex matching), phone (digit checking), selected productInterest, and message length.
*   **Query Params**: On mount, if a `product` parameter is specified via URL search query, it pre-populates the messaging field with product-specific details and maps categories dynamically.
*   **Data Handling**: Saves mock JSON objects in local storage under key `"ortex_submissions"`.

### 5.4. Quote Calculator (`src/pages/QuoteCalculator.jsx`)
*   **Multi-step Wizard**: Guides B2B buyers through 4 stages: Product Selection, Custom Design Specs configuration (thickness, size, outer-shape cut, materials), Quantity definition (MOQ warnings), and Buyer Info capture.
*   **Estimate**: Indicative pre-tax total from catalogue base prices × quantity; final pricing and any discounts are set in the Admin quotation.
*   **Logo Attachment**: Supports file upload (SVGs, PDFs, High-Res PNGs) and saves structured RFQs to local storage key `"ortex_quotes"`.

### 5.5. Theme Switcher Context (`src/components/layout/Navbar.jsx`)
*   Monitors `darkMode` state reading from local storage preferences or OS presets.
*   Fires side-effect to add/remove `.dark` class from `document.documentElement`, shifting global HSL variables instantly.
