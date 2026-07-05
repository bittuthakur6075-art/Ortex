# Getting Started

Local setup and orientation for the Ortex Industries website.

## Prerequisites

- Node.js 20+ and npm.

## Setup

```bash
npm install      # install dependencies
npm run dev      # Vite dev server with HMR (URL printed in terminal — not always :5173)
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot-module reload. |
| `npm run build` | Production build to `dist/`. |
| `npm run preview` | Serve the built `dist/` locally. |
| `npm run lint` | Oxlint over the codebase. |

There is no automated test suite — "testing" a change means building clean and exercising the running app.

## Where things live

| You want to change… | Go to |
|---|---|
| A page / route | `src/pages/*.jsx` + register the `<Route>` in `src/App.jsx` |
| The header, footer, or scroll behavior | `src/components/layout/` |
| Reusable UI (hero, chatbot, animated text) | `src/components/ui/` |
| Phone / email / WhatsApp CTA values | `src/constants/site.js` |
| Design tokens, colors, dark-mode overrides | `src/index.css` (Tailwind v4 `@theme`) |
| Per-page `<title>` / meta description | the `useDocumentMetadata(...)` call at the top of each page |

## Data & persistence

There is no backend. Lead capture persists to `localStorage`:

- Contact form → key `ortex_submissions`
- Quote calculator → key `ortex_quotes`

See `docs/PM/PRODUCT_BACKLOG.md` for the plan to route these to a real backend.

## Further reading

- `docs/Architecture/ARCHITECTURE.md` — full codebase + business-context reference.
- `docs/PM/PRODUCT_BACKLOG.md` — product/feature backlog.
- `CLAUDE.md` (repo root) — the condensed guide for working in this repo.
