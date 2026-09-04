# Ortex Industries — Digital Platform

Monorepo for the digital infrastructure of **Ortex Industries** (customised MDF/acrylic
products, lanyards, badges, corporate gifts, OEM/white-label manufacturing).

| App | Path | Stack | Purpose |
|---|---|---|---|
| Marketing site | [`Ortex.Web/`](Ortex.Web/README.md) | React 19 · Vite 8 · Tailwind v4 · Framer Motion | Public website, catalogue, quote wizard, lead capture, Live Orty voice assistant |
| Admin console | [`Ortex.Admin/`](Ortex.Admin/README.md) | React 19 · Vite 8 · Tailwind v4 · Supabase | Quote-to-cash back office: enquiries → quotations → GST invoices → payments, plus growth, social and automation modules |
| Tally connector | [`Ortex.Tally.Connector/`](Ortex.Tally.Connector/README.md) | Node CLI | Pushes Admin records into TallyPrime through its local XML gateway |

The three apps are **independent npm projects** (no root workspace). The connector must
run on the Windows PC where TallyPrime is open and shares nothing with the Admin except
the `doc.tally` field written back onto each Supabase record.

## Quick start

```bash
# Marketing site
cd Ortex.Web && npm install && npm run dev

# Admin console (needs Supabase env vars — see Ortex.Admin/.env.example)
cd Ortex.Admin && npm install && npm run dev

# Tally connector (Windows + TallyPrime running)
cd Ortex.Tally.Connector && npm install && cp config.example.json config.json && npm run dry-run
```

Both front-ends expose `dev`, `build`, `preview` and `lint` (Admin also has `test`);
the connector has `start`, `once`, `dry-run` and `fixture`. CI (`.github/workflows/ci.yml`) runs lint + build for both
front-ends and the XML fixture for the connector on every push to `Development` / `main`.

## Repository layout

```text
Ortex/
├── Ortex.Web/                 # marketing SPA
│   ├── docs/                  # app-specific guides (Hostinger deploy)
│   ├── public/                # static assets, .htaccess, robots, manifest
│   ├── scripts/               # build-time SEO: meta check + prerender
│   └── src/
│       ├── components/{home,layout,ui}/
│       ├── constants/         # site copy, catalogue, photos
│       ├── hooks/
│       ├── lib/               # Supabase client, leads, tracker, catalog
│       └── pages/
├── Ortex.Admin/               # admin console
│   ├── docs/                  # PRD, environments, growth + leads specs
│   ├── public/
│   ├── supabase/
│   │   ├── functions/         # Deno edge functions (+ _shared: http, auth, gemini, telecaller)
│   │   └── migrations/
│   ├── test/fixtures/         # sample TallyPrime XML for the import flow
│   └── src/
│       ├── components/{layout,ui,editors,documents}/
│       ├── data/{store,domain,seed}/   # repository facade + stores, schema/rules, demo data
│       ├── services/          # notify, users, integrations, telecaller
│       ├── hooks/             # useCollection, useProfile …
│       ├── lib/               # pure helpers: pricing, analytics, format, auth
│       └── pages/             # one file per admin page (+ telecaller/ AI caller module)
├── Ortex.Tally.Connector/     # Node CLI (src/, test/)
├── docs/                      # cross-cutting: architecture, backlog, guides
├── .github/workflows/ci.yml
└── CLAUDE.md                  # working notes for AI coding assistants
```

## Conventions

- **Imports**: relative paths today; both front-ends also resolve `@/` to `src/`
  (`vite.config.js` + `jsconfig.json`) for new code.
- **Style**: double quotes, no semicolons, 2-space indent (`.editorconfig`), LF line
  endings (`.gitattributes`). `npm run lint` runs oxlint with each app's `.oxlintrc.json`.
- **Files**: components `PascalCase.jsx`; hooks `useThing.js`; everything else
  `camelCase.js`. Pure logic lives in `lib/`, React state in `hooks/`, persistence in
  `data/`, outbound integrations in `services/`.
- **Never commit** build archives, screenshots or `.env` files — the root `.gitignore`
  covers all three apps.

## Documentation

- `docs/architecture/ARCHITECTURE.md` — system narrative, data flows, design system
- `docs/pm/PRODUCT_BACKLOG.md`, `docs/pm/GROWTH_ROADMAP.md` — roadmap and status
- `docs/guides/GETTING_STARTED.md`, `docs/guides/META_SETUP.md` — setup guides
- `Ortex.Web/docs/DEPLOY_HOSTINGER.md` — static deploy of the marketing site
- `Ortex.Admin/docs/ENVIRONMENTS.md` — staging vs production Supabase projects
