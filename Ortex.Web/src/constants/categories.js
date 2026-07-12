// Category landing pages: /products/:slug.
//
// Data-only module — no React imports — because scripts/prerender.mjs imports
// it in Node at build time to bake each category's meta tags and JSON-LD into
// static HTML.
//
// Copy discipline (same rule as the OEM page): every claim below is either
// derived from the SKU data in products.js at module load (MOQ, lead times,
// GST, prices, materials), or already substantiated elsewhere on the site
// (artwork formats, sample policy, Pantone matching). Nothing is invented,
// and derived numbers can never drift from the catalogue.

// Explicit .js extensions: this module is imported both by Vite (which would
// accept extensionless) and by Node in scripts/prerender.mjs (which would not).
import { PRODUCTS } from "./products.js"
import { photosData } from "./photos.js"

export const SITE_URL = "https://www.ortexindustries.in"

// Established site claims, referenced by several FAQ answers.
const ARTWORK_FORMATS = ".AI, .CDR, .DXF, .EPS, .PDF or .SVG (high-res .PNG/.JPG also accepted)"
const SAMPLE_POLICY =
  "Digital mockups (2D/3D layouts) are free for every order. A physical pre-production sample can be manufactured for a nominal fee, refundable on bulk-order confirmation."

/**
 * Derived per-category stats. Defaults to the static products.js catalogue, but
 * accepts a live product list (from the Admin-managed Supabase catalogue) so the
 * same helpers work for both the build-time prerender and the live site.
 */
function statsFor(category, products = PRODUCTS) {
  const skus = products.filter((p) => p.category === category)
  if (!skus.length) {
    // A category with no products yet (e.g. a brand-new Admin category) must not
    // crash Math.min(...[]) → Infinity downstream.
    return { skus: [], count: 0, moqMin: 0, leadMin: 0, leadMax: 0, leadLabel: "0", priceMin: 0, gstLabel: "18%" }
  }
  const moqs = skus.map((p) => p.moq)
  const leads = skus.map((p) => p.leadTimeDays)
  const prices = skus.map((p) => p.basePrice)
  const gstRates = [...new Set(skus.map((p) => p.gstRate))].sort((a, b) => a - b)
  const leadMin = Math.min(...leads)
  const leadMax = Math.max(...leads)
  return {
    skus,
    count: skus.length,
    moqMin: Math.min(...moqs),
    leadMin,
    leadMax,
    // "5" rather than "5–5" when every SKU in the category dispatches alike.
    leadLabel: leadMin === leadMax ? `${leadMin}` : `${leadMin}–${leadMax}`,
    priceMin: Math.min(...prices),
    gstLabel: gstRates.length === 1 ? `${gstRates[0]}%` : `${gstRates[0]}%–${gstRates[gstRates.length - 1]}%`,
  }
}

const moqFaq = (label, s) => ({
  question: `What is the minimum order quantity for ${label}?`,
  answer: `MOQs start at ${s.moqMin} units in this category and vary by product — each card below shows its exact MOQ. Smaller sample runs can be negotiated. ${SAMPLE_POLICY}`,
})

const leadFaq = (label, s) => ({
  question: `How long does a ${label} order take?`,
  answer: `Estimated dispatch is ${s.leadLabel} working days after artwork approval, depending on the product and volume. Orders ship PAN India with tracking; worldwide export is supported.`,
})

const artworkFaq = (label) => ({
  question: `What artwork do you need for custom ${label}?`,
  answer: `Vector files work best for precise cutting and printing: ${ARTWORK_FORMATS}. Our prepress team checks dimensions and sends a mockup for approval before production, and Pantone colour matching is supported.`,
})

/**
 * One entry per catalogue category. `category` must match products.js exactly.
 * `photoCategory` matches photos.js; `photoKeywords` is a fallback name-match
 * for categories the IndiaMART gallery doesn't tag directly.
 */
export const PRODUCT_CATEGORIES = [
  {
    slug: "keychains",
    category: "Keychains",
    name: "Custom Keychains",
    seoTitle: "Custom Keychain Manufacturer India - Acrylic, Leather, PVC & Silicone | Ortex Industries",
    seoDescription:
      "Bulk custom keychains manufactured in-house: UV-printed acrylic, debossed leather, moulded silicone and soft-PVC, and sublimation satin. Factory-direct pricing with volume discounts.",
    intro:
      "Keychains are our highest-volume product line. Every variant is produced in-house — acrylic cut to custom shapes and UV-printed on both sides, leather hot-stamped or debossed, silicone and soft PVC moulded with 2D/3D raised detail, and satin ribbon printed by sublimation.",
    photoCategory: "Keychain",
    photoKeywords: /keychain|key ring|key chain/i,
    extraFaq: (s) => ({
      question: "Which keychain material should I choose?",
      answer: `Acrylic (from ₹${s.skus.find((p) => p.sku === "KEY-ACR-01")?.basePrice ?? s.priceMin}/pc) suits full-colour logos and custom shapes; leather suits executive gifting with debossed branding; silicone and soft PVC suit high-volume promotions with moulded 3D detail; satin is the lightest and most economical. All variants take a metal ring or clasp.`,
    }),
  },
  {
    slug: "acrylic-products",
    category: "Acrylic products",
    name: "Custom Acrylic Products",
    seoTitle: "Custom Acrylic Products Manufacturer - Standees, Name Plates & Desk Items | Ortex Industries",
    seoDescription:
      "Custom acrylic desk standees, name display holders, card holders, paperweights and dashboard idols. Cast acrylic, UV-printed and laser-cut in-house with polished edges.",
    intro:
      "We cut, polish, and UV-print cast acrylic in-house — desk standees and dashboard idols in custom shapes, clear name displays and card holders with polished edges, and solid acrylic paperweights with embedded branding.",
    photoCategory: null,
    photoKeywords: /acrylic/i,
    extraFaq: () => ({
      question: "What acrylic thicknesses do you work with?",
      answer:
        "Catalogue items use 3 mm clear acrylic for displays and holders and 5 mm cast acrylic for standees and shaped pieces; solid cast blocks are used for paperweights. Custom thicknesses can be quoted on request.",
    }),
  },
  {
    slug: "mdf-products",
    category: "MDF products",
    name: "Custom MDF Products",
    seoTitle: "Custom MDF Products Manufacturer - Trophies, Exam Pads & Magnets | Ortex Industries",
    seoDescription:
      "Custom MDF award trophies, examination pads and custom-shape fridge magnets. CNC-routed and UV-printed in-house from 3–9 mm MDF sheet.",
    intro:
      "MDF is routed, engraved, and printed on our own floor: laser-engraved award trophies with acrylic front plates, UV-printed examination pads, and fridge magnets cut to any shape from 3 mm sheet.",
    photoCategory: null,
    photoKeywords: /\bmdf\b|wooden/i,
    extraFaq: () => ({
      question: "What MDF sheet thicknesses are available?",
      answer:
        "3 mm for magnets and lightweight cut-outs, 6 mm for exam pads and clipboards, and 9 mm for trophies and display pieces. All are finished with UV printing or laser engraving.",
    }),
  },
  {
    slug: "lanyards",
    category: "Lanyards & ID card accessories",
    name: "Custom Lanyards & ID Accessories",
    seoTitle: "Custom Lanyard Manufacturer India - Sublimation & Satin Printed | Ortex Industries",
    seoDescription:
      "Full-colour sublimation and satin-printed lanyards manufactured in bulk — 16 mm and 20 mm widths, metal trigger hooks, safety breakaway options. 12% GST, factory-direct.",
    intro:
      "Lanyards are printed edge-to-edge by heat sublimation — 16 mm polyester with metal trigger hooks, and 20 mm premium satin with safety breakaway clasps for schools, hospitals, and events.",
    photoCategory: null,
    photoKeywords: /lanyard|id card/i,
    extraFaq: () => ({
      question: "Which lanyard width and fittings should I order?",
      answer:
        "16 mm polyester is the standard for conferences and offices; 20 mm satin reads more premium and carries larger logos. Both take full-colour sublimation printing; breakaway safety clasps are recommended wherever lanyards are worn around machinery or by children.",
    }),
  },
  {
    slug: "badges",
    category: "Badge manufacturing",
    name: "Custom Badges",
    seoTitle: "Custom Badge Manufacturer - Metal, Button, Magnetic & LED Badges | Ortex Industries",
    seoDescription:
      "Custom badge manufacturing in bulk: engraved brass name badges with magnet backing, printed tinplate button badges, moulded plastic pin badges and LED light-up badges.",
    intro:
      "We manufacture badges across four constructions: engraved brass name badges on strong magnet backings, custom-printed tinplate button badges, moulded plastic badges with safety pins for events and campaigns, and LED light-up badges.",
    photoCategory: "Badges",
    photoKeywords: /badge/i,
    extraFaq: () => ({
      question: "Magnet, pin, or button backing — which is right?",
      answer:
        "Magnet backings protect clothing and suit daily staff wear (brass name badges). Safety-pin and button constructions are the economical choice for events, campaigns, and one-day wear at high volumes.",
    }),
  },
  {
    slug: "examination-boards",
    category: "Examination boards",
    name: "Examination Boards",
    seoTitle: "Examination Board & Clipboard Manufacturer for Institutions | Ortex Industries",
    seoDescription:
      "Bulk examination boards for schools and institutions: PVC A4 clipboards, foldable exam boards with storage compartments, and 6 mm MDF clipboards with custom branding.",
    intro:
      "Built for institutional procurement: A4 PVC examination clipboards with branded printing, foldable PP boards with built-in stationery storage, and 6 mm MDF clipboards printed on both sides.",
    photoCategory: "Exam Board",
    photoKeywords: /exam|clip ?board/i,
    extraFaq: () => ({
      question: "Can examination boards carry our institution's branding?",
      answer:
        "Yes — every variant is custom-printed. PVC and MDF boards take full-surface UV printing (both sides on MDF), and bulk orders are packed for distribution across examination centres.",
    }),
  },
  {
    slug: "wall-clocks",
    category: "Wall clocks",
    name: "Promotional Wall Clocks",
    seoTitle: "Promotional Wall Clock Manufacturer - Custom Dial Printing | Ortex Industries",
    seoDescription:
      "Custom-branded wall clocks in bulk: 8-inch and 7.5-inch promotional clocks, 15-inch designer clocks, CNC-routed wooden clocks and UV-printed acrylic clocks with quartz movements.",
    intro:
      "Wall clocks with your dial, not a sticker on someone else's: plastic-frame 8-inch rounds and 7.5-inch squares for volume gifting, 15-inch designer and CNC-routed wooden clocks for premium corporate gifts, and laser-cut acrylic clocks — all on quartz movements.",
    photoCategory: "Wall Clock",
    photoKeywords: /clock/i,
    extraFaq: (s) => ({
      question: "What sizes do promotional wall clocks come in?",
      answer: `Catalogue sizes run from 7.5-inch squares (from ₹${s.priceMin}/pc at volume) through 8-inch rounds to 15-inch designer pieces, plus premium wooden and acrylic constructions. Every dial is custom-printed to your artwork.`,
    }),
  },
  {
    slug: "fridge-magnets",
    category: "Fridge magnets",
    name: "Custom Fridge Magnets",
    seoTitle: "Custom Fridge Magnet Manufacturer - MDF, Acrylic, PVC & Wood | Ortex Industries",
    seoDescription:
      "Custom fridge magnets manufactured in bulk: UV-printed MDF in any shape, transparent acrylic, soft PVC with 2D/3D embossing, and laser-engraved wooden magnets.",
    intro:
      "Fridge magnets in four materials, all with rubber magnet backing: MDF cut to any shape with full-colour UV print, transparent acrylic, soft PVC moulded with raised 2D/3D detail, and natural wood with laser engraving.",
    photoCategory: "Fridge Magnet",
    photoKeywords: /magnet/i,
    extraFaq: () => ({
      question: "Which magnet material works best for souvenirs vs. promotions?",
      answer:
        "Soft PVC suits high-volume tourism and souvenir runs (moulded 3D relief); MDF and acrylic suit full-colour brand artwork in custom shapes; engraved wood reads premium for boutique and hospitality gifting.",
    }),
  },
  {
    slug: "corporate-gifts",
    category: "Corporate gifting & merchandise",
    name: "Corporate Gifts",
    seoTitle: "Corporate Gifting Manufacturer India - Bottles, Diary Sets & More | Ortex Industries",
    seoDescription:
      "Corporate gifts branded in-house: double-wall insulated steel bottles with laser-engraved logos and executive A5 diary and metal pen gift sets. Factory-direct with GST invoicing.",
    intro:
      "Executive gifting with your branding applied in-house: 750 ml double-wall insulated steel bottles laser-engraved with your logo, and A5 executive diary sets with metal pens, boxed and ready to present.",
    photoCategory: null,
    photoKeywords: /gift|diary|bottle|pen|mug/i,
    extraFaq: () => ({
      question: "How is branding applied to corporate gifts?",
      answer:
        "Steel bottles are laser-engraved (permanent, no peeling); diaries take deboss or print on PU leather covers. Both ship boxed. For mixed gift hampers across categories, submit one combined quote request.",
    }),
  },
  {
    slug: "flags-banners",
    category: "Flags & banners",
    name: "Custom Flags & Banners",
    seoTitle: "Custom Flag Manufacturer - Printed Polyester Flags in Bulk | Ortex Industries",
    seoDescription:
      "Custom printed polyester flags manufactured in bulk: 3×5 ft flags with double-side printing and 2×3 ft party or election flags on wooden sticks. 12% GST.",
    intro:
      "Knitted polyester flags printed to your artwork: full-size 3×5 ft flags with a double-side printing option, and 2×3 ft party and election flags mounted on wooden sticks for rallies and events.",
    photoCategory: "Flag",
    photoKeywords: /flag/i,
    extraFaq: (s) => ({
      question: "What GST rate applies to flags, and how fast can they ship?",
      answer: `Flags are billed at ${s.gstLabel} GST. Stick flags dispatch in as little as ${s.leadMin} working days after artwork approval — relevant for election and event timelines — and bulk orders ship PAN India with tracking.`,
    }),
  },
  {
    slug: "clipboards",
    category: "Clipboards & writing pads",
    name: "Custom Clipboards & Writing Pads",
    seoTitle: "Custom Clipboard Manufacturer - Branded A4 MDF Clipboards | Ortex Industries",
    seoDescription:
      "Custom A4 MDF clipboards with spring clips, branded front and back. Manufactured in-house for institutions, events, and corporate stationery programmes.",
    intro:
      "A4 clipboards cut from 3 mm MDF with spring clips, custom-branded on both faces — built for institutions, field teams, and event registration desks.",
    photoCategory: null,
    photoKeywords: /clip ?board|writing pad|exam pad/i,
    extraFaq: () => ({
      question: "Can clipboards be produced in custom sizes?",
      answer:
        "The catalogue item is A4 with a spring clip, but MDF is routed in-house, so custom sizes and clip positions can be quoted — describe the requirement in the quote form's notes.",
    }),
  },
  {
    slug: "promotional-merchandise",
    category: "Promotional merchandise",
    name: "Promotional Merchandise",
    seoTitle: "Promotional Merchandise Manufacturer - Caps, Popsockets & Giveaways | Ortex Industries",
    seoDescription:
      "Bulk promotional merchandise: cotton twill caps with embroidery or printing and sublimation-printed mobile popsockets. Factory-direct pricing with volume discounts.",
    intro:
      "Event and campaign giveaways produced at volume: cotton twill caps finished with embroidery or printing, and mobile popsockets with full-colour sublimation tops.",
    photoCategory: "Custom Promotional",
    photoKeywords: /promotional|cap\b|popsocket/i,
    extraFaq: () => ({
      question: "Embroidery or printing on caps — which should I pick?",
      answer:
        "Embroidery is stitched, durable, and reads premium for staff wear; printing reproduces gradients and fine detail at lower cost for giveaways. Both are applied in-house on cotton twill with buckle closures.",
    }),
  },
]

export function categoryBySlug(slug) {
  return PRODUCT_CATEGORIES.find((c) => c.slug === slug) || null
}

export function categoryStats(entry, products = PRODUCTS) {
  return statsFor(entry.category, products)
}

export function categoryFaqs(entry, products = PRODUCTS) {
  const s = statsFor(entry.category, products)
  const label = entry.name.toLowerCase().replace(/^custom |^promotional /, "")
  // extraFaq may return null for Admin-created categories with no bespoke FAQ.
  return [moqFaq(label, s), leadFaq(label, s), artworkFaq(label), entry.extraFaq?.(s)].filter(Boolean)
}

/** Real production photos for a category: tagged matches first, then name matches. */
export function photosForCategory(entry, limit = 8) {
  const seen = new Set()
  const out = []
  const push = (p) => {
    if (!seen.has(p.url) && out.length < limit) {
      seen.add(p.url)
      out.push(p)
    }
  }
  if (entry.photoCategory) {
    for (const p of photosData) if (p.category === entry.photoCategory) push(p)
  }
  if (out.length < limit) {
    for (const p of photosData) if (entry.photoKeywords.test(p.name)) push(p)
  }
  return out
}

/** JSON-LD for a category page. Shared by the page (runtime) and prerender (build). */
export function buildCategorySchema(entry, products = PRODUCTS) {
  const s = statsFor(entry.category, products)
  const url = `${SITE_URL}/products/${entry.slug}`
  const photos = photosForCategory(entry, s.count)

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: entry.name,
    url,
    numberOfItems: s.count,
    itemListElement: s.skus.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "Product",
        name: p.name,
        sku: p.sku,
        description: p.description,
        material: p.material,
        ...((p.images?.[0] || photos[i]?.url) ? { image: p.images?.[0] || photos[i].url } : {}),
        brand: { "@type": "Brand", name: "Ortex Industries" },
        offers: {
          "@type": "Offer",
          price: p.basePrice,
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
          eligibleQuantity: { "@type": "QuantitativeValue", minValue: p.moq, unitText: p.unit },
        },
      },
    })),
  }

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: categoryFaqs(entry).map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }

  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Products", item: `${SITE_URL}/products` },
      { "@type": "ListItem", position: 3, name: entry.name, item: url },
    ],
  }

  return [itemList, faqPage, breadcrumbs]
}
