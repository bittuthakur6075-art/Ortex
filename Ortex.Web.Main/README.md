# Ortex.Web.Main

The Ortex Industries company site, https://ortexindustries.in. React 19, Vite 8, Tailwind v4 and Framer Motion, prerendered to static HTML, in the same design language as [`Ortex.Web`](../Ortex.Web/README.md).

## Quick start

```bash
npm install
cp .env.example .env.development   # optional: without it the contact form queues locally
npm run dev
```

## Build and deploy

```bash
cp .env.production.example .env.production   # Supabase URL + anon key (same as Ortex.Web)
npm run build                                # writes dist/
```

Upload the contents of `dist/` to the domain's `public_html` on Hostinger and turn on "Force HTTPS" in hPanel.

## Pages

| Route | Content |
|---|---|
| `/` | Hero, figures, capabilities, why Ortex, recent work, clients |
| `/about` | Story, figures, expertise, differentiators |
| `/products` | Eight product families, branding methods |
| `/industries` | Ten sectors |
| `/portfolio` | 16 real orders with a category filter and lightbox |
| `/contact` | Enquiry form (into the Admin console), call, email, WhatsApp, map |
| `/privacy`, `/terms` | Legal pages |

Content is edited in `src/constants/content.js` and `src/constants/site.js`. See `CLAUDE.md` for the architecture.
