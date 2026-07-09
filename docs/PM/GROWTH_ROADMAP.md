# Website Growth Roadmap

From the July 2026 marketing/subject-expert audit of `Ortex.Web`. Sequenced so
each phase unblocks the next. Items marked **founder** require business input
that engineering cannot supply — they gate everything trust-related.

## Where the site stands

The lead funnel is sound: artwork uploads work, failed submissions queue and
replay, references are persisted, analytics is consent-gated, and the legal
pages describe what the site actually does. The IA is rationalized: one gallery
(`/work`, real photography only), a dedicated `/oem` landing page, and a
navbar ordered the way a buyer evaluates a manufacturer.

What the site still lacks is **acquisition surface**: no page on it can be
found by a buyer who doesn't already know Ortex exists. That is the ceiling
this roadmap removes.

## Phase 1 — Now: remove the ceiling

| # | Item | Owner | Why first |
|---|------|-------|-----------|
| 1 | GSTIN, CIN, registered address, year founded, founder's note (`constants/founder.js`), client-name permissions (Hyundai, Honda, Cipla, Kotak, UltraTech, TNQ, Medinetix appear in production photos) | **founder** | Blocks items 2, 6, 11. Companies Act requires CIN + registered office display for a Pvt Ltd; the site claims "Private Limited" in its Organization schema. |
| 2 | Trust block in footer + Contact page (GSTIN, CIN, address, grievance officer per IT Rules 2021) | eng (small) | Unblocks enterprise/government procurement. |
| 3 | Category landing pages `/products/:slug` (12) with real photos, SKUs, MOQ/lead-time, FAQ + Product/ItemList/FAQPage schema; `/products` becomes the hub | eng | Targets "keychain manufacturer India"-class queries — the highest-intent organic traffic that exists for this business. |
| 4 | Build-time prerendering of all routes (meta + JSON-LD in static HTML) | eng | The SPA serves an empty `<div>` to non-JS crawlers; nothing above ranks without this. Vercel serves static files before SPA rewrites, so per-route HTML works without SSR. |
| 5 | GA4 + conversion events wired behind the existing consent banner. Remove the two timed popups (WhatsApp tooltip 5s, chatbot auto-open 12s). Rename the chatbot — it is a scripted matcher and must not be marketed as "AI". | eng (small) | Do before any paid traffic, not after. |

## Phase 2 — Next: build the acquisition surface

6. Client logo wall on the homepage (needs #1 permissions).
7. Quote form: optional GSTIN / need-by date / print-method fields, so leads
   arrive quotable without a spec-chasing call.
8. Gate the volume-discount ladder behind quote submission. Indicative unit
   prices stay public (they qualify leads); the discount structure is a
   negotiation floor and is currently scrapeable.
9. Migrate the 924 gallery images off IndiaMART's CDN (`5.imimg.com`) to owned
   storage. If that relationship changes, the gallery goes dark.
10. Re-encode `public/hero-bg.mp4` (90.5 MB → ~3 MB, needs ffmpeg):
    `ffmpeg -i hero-bg.mp4 -t 12 -vf "scale=1920:-2,fps=24" -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an hero-bg-compressed.mp4`

## Phase 3 — This quarter: compound

11. Case studies (2–3) from the named accounts in #1.
12. Per-product detail pages (41 SKUs) with `Product`/`Offer` schema.
13. Content engine: two buying guides per month (e.g. "MDF vs acrylic
    keychains", "lanyard widths: 12/16/20mm", "preparing vector artwork for UV
    printing"), each ending in a quote CTA.
14. `AggregateRating` markup + a review-collection loop (ask every delivered
    order for a Google review).

## Standing decisions

- **Public price book**: keep indicative per-unit prices, hide the discount
  ladder (see #8). Revisit if competitors start quoting against it.
- **Founder note**: `constants/founder.js` renders nothing until written.
  Keep it that way — do not fill it with generated copy.
- **No invented claims**: MOQs, certifications, and lead times on marketing
  pages must come from `constants/products.js` or the business, never from
  copywriting.
