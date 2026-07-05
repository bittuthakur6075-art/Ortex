# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Marketing/lead-gen single-page app for **Ortex Industries** — a manufacturer of customized products (MDF/acrylic items, lanyards, corporate gifts, OEM/white-label production). The site is a client-side React SPA with no backend: lead capture (Contact form, Quote calculator) persists to `localStorage`, not a server.

## Commands

```bash
npm run dev       # Vite dev server with HMR
npm run build     # Production build to dist/
npm run preview   # Serve the production build locally
npm run lint      # Oxlint
```

There is no test suite. `npm run dev` may land on a port other than 5173 if it's in use — check the terminal output for the actual URL.

## Architecture

- **Stack**: React 19 + Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite`, configured in-CSS, no `tailwind.config.js`), React Router 7, Framer Motion, Lucide icons, Sonner toasts.
- **Routing** (`src/App.jsx`): `BrowserRouter` wrapping a fixed shell — `<ScrollToTop />`, `<Navbar />`, routed `<main>`, `<Footer />`, `<Chatbot />`, and the Sonner `<Toaster />`. Routes: `/`, `/about`, `/products`, `/industries`, `/portfolio`, `/contact`, `/quote`, `/privacy`, `/terms`, `/cookies`, `/acceptable-use`. Add a new page by creating `src/pages/*.jsx` and registering a `<Route>` here.
- **Pages** (`src/pages/`) are self-contained top-level views. Each page calls `useDocumentMetadata` (`src/hooks/`) at the top to set `<title>`/`<meta description>` for SEO.
- **Components** are split by role: `src/components/layout/` is the persistent chrome (`Navbar`, `Footer`, `ScrollToTop`), `src/components/ui/` is reusable UI (`Hero`, `Chatbot`, `RollText`). Component-scoped CSS (`Footer.css`, `Hero.css`) sits next to its component.
- **Shared config** lives in `src/constants/site.js` — business contact details (`CONTACT`) and the `whatsappLink()` deep-link builder. Reference these instead of re-hardcoding phone/email/WhatsApp values in new code; the shell (`Navbar`/`Footer`) already does. (Existing inline copies inside prose — chatbot scripts, legal pages, SEO descriptions — are content, not config, and are left as-is.)
- **Styling system** is centralized in `src/index.css` using Tailwind v4's `@theme`:
  - Design tokens are HSL CSS variables (`--primary`, `--background`, `--foreground`, `--whatsapp`, etc.). Reference them via Tailwind's `bg-*/text-*` utilities, not hard-coded colors.
  - Dark mode is a `.dark` class toggled on `document.documentElement` by `Navbar.jsx` (reads `localStorage` + OS preference); tokens have dark overrides so the switch is instant.
  - Default box-shadows are overridden to `none` — the design is intentionally flat. `.lp-wrap` is the custom responsive container (Bootstrap-like max-widths) used instead of Tailwind's `container`.
  - Use `cn()` (`src/utils/cn.js`, clsx + tailwind-merge) for conditional/merged class names.

## Data & integrations (no backend)

- **Contact form** (`Contact.jsx`): validates inputs, reads a `?product=` query param to pre-fill the message, saves submissions to `localStorage` key `ortex_submissions`.
- **Quote calculator** (`QuoteCalculator.jsx`): multi-step wizard with a client-side pricing engine (base cost + material specs × quantity, tiered volume discounts); saves RFQs to `localStorage` key `ortex_quotes`.
- **WhatsApp/phone CTAs** in the shell resolve through `src/constants/site.js` (`whatsappLink()`, `CONTACT`) — update the numbers/message there and both `Navbar` and `Footer` follow.

## Reference docs

The `docs/` tree mirrors the Webority house layout (Architecture / guides / PM):

- `docs/Architecture/ARCHITECTURE.md` — detailed narrative of business context, stack, directory structure, design tokens, and per-page logic (the former `project_memory.md`).
- `docs/PM/PRODUCT_BACKLOG.md` — product-manager audit and feature backlog (the former `product_manager_suggestions.md`).
- `docs/guides/GETTING_STARTED.md` — local setup, commands, and where to change common things.
