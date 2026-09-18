import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Link, useSearchParams } from "react-router-dom"
import { ArrowRight, X } from "../components/ui/Icons"
import {
  Printer, Flash, Colorfilter, Box, Clock, ArrowLeft2, ArrowRight2, SearchNormal1,
  Category, Key, Medal, Gift, ClipboardText, Flag, Sticker, Tag, Layer, Card, Note, Shop, Brush2,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { photosForCategory } from "../constants/categories"
import { useCatalog } from "../lib/catalog"
import { productSlugs } from "../lib/catalogCore"
import { getLenis } from "../hooks/useSmoothScroll"
import { fadeUp, RevealWords } from "../components/ui/Section"
import PageCTA from "../components/ui/PageCTA"

const FALLBACK_IMAGE = "/img/welcome-workshop.avif"

// Products per page. The grid is 4-up on desktop, and 16 divides evenly by
// every column count it steps through (4, 2, 1), so a page is always a full
// rectangle rather than a ragged last row. The windowed pager below keeps the
// control short however long the catalogue grows (192 live products is 12 pages).
const PAGE_SIZE = 16

// Leading icon per filter chip, keyed by category SLUG (a display name is
// editable in the console, a slug is the thing the URL is already built from).
// Same treatment as the /work rail. Unmapped categories fall back to a tag.
const CATEGORY_ICONS = {
  all: Category,
  "keychains": Key,
  "acrylic-products": Layer,
  "mdf-products": Box,
  "lanyards": Card,
  "badges": Medal,
  "examination-boards": ClipboardText,
  "clipboards": Note,
  "wall-clocks": Clock,
  "fridge-magnets": Sticker,
  "corporate-gifts": Gift,
  "flags-banners": Flag,
  "promotional-merchandise": Shop,
  "customization-and-branding": Brush2,
}

// Category copy, shown above the grid while a single category is filtered.
// An Admin-set display name / intro wins; this is the hand-tuned fallback, and
// the static SEO description is the last resort. Keyed by category slug.
const CARD_COPY = {
  "keychains": {
    title: "Custom Keychains",
    description: "Bulk keychains made in-house in UV-printed acrylic, debossed leather, moulded silicone and soft-PVC, plus sublimation satin, at factory-direct pricing.",
  },
  "acrylic-products": {
    title: "Acrylic Products",
    description: "Desk standees, name and card holders, paperweights and dashboard idols. Cast acrylic, UV-printed and laser-cut in-house with clean polished edges.",
  },
  "mdf-products": {
    title: "MDF Products",
    description: "Award trophies, examination pads and custom-shape fridge magnets, all CNC-routed and UV-printed in-house from 3 to 9 mm MDF sheet.",
  },
  "lanyards": {
    title: "Lanyards & ID Straps",
    description: "Full-colour sublimation and satin-printed lanyards in bulk, in 16 and 20 mm widths, with metal trigger hooks and safety breakaway options, factory-direct.",
  },
  "badges": {
    title: "Custom Badges",
    description: "Engraved brass name badges with magnet backing, printed tinplate button badges, moulded plastic pin badges and LED light-up badges, made in bulk.",
  },
  "examination-boards": {
    title: "Examination Boards",
    description: "PVC A4 clipboards, foldable exam boards with storage compartments and 6 mm MDF clipboards, custom-branded for schools and institutions.",
  },
  "wall-clocks": {
    title: "Wall Clocks",
    description: "Promotional 8 and 7.5-inch clocks, 15-inch designer pieces, CNC-routed wooden clocks and UV-printed acrylic clocks with reliable quartz movements.",
  },
  "fridge-magnets": {
    title: "Fridge Magnets",
    description: "UV-printed MDF in any shape, transparent acrylic, soft PVC with 2D and 3D embossing, and laser-engraved wooden magnets, all produced in bulk.",
  },
  "corporate-gifts": {
    title: "Corporate Gifts",
    description: "Double-wall insulated steel bottles with laser-engraved logos, plus executive A5 diary and metal pen gift sets, branded in-house with GST invoicing.",
  },
  "flags-banners": {
    title: "Flags & Banners",
    description: "Custom printed polyester flags in bulk: 3×5 ft with double-side printing and 2×3 ft party or election flags on wooden sticks, billed at 12% GST.",
  },
  "clipboards": {
    title: "Clipboards & Pads",
    description: "Custom A4 MDF clipboards with spring clips, branded front and back, made in-house for institutions, events and corporate stationery programmes.",
  },
  "promotional-merchandise": {
    title: "Promotional Merch",
    description: "Cotton twill caps with embroidery or printing, and sublimation-printed mobile popsockets, at factory-direct pricing with volume discounts.",
  },
}

// Customization options, rendered in the home "Workflow process" numbered grid.
const customizationOptions = [
  {
    title: "Your artwork",
    description: "Send vector files in .cdr, .ai, .pdf, or .dxf and we build to them exactly, with no templates or clip-art substitutes.",
  },
  {
    title: "Shape & size",
    description: "Custom cut shapes and dimensions, from a keychain silhouette to a full display board, all made to your spec.",
  },
  {
    title: "Colour matching",
    description: "Exact Pantone matching across every run, so the finish holds to your brand guidelines batch after batch.",
  },
  {
    title: "Materials & finish",
    description: "Pick the sheet thickness, material, and surface finish, from matte acrylic to polished MDF, to suit the product.",
  },
]

// Brand-logo strip for the Otto "We service your vehicle" clone. These are the
// Framer template's generic placeholder marks — decorative only, not real client
// logos. Swap for actual client/partner logos when available.
const brandLogos = Array.from({ length: 11 }, (_, i) => `/img/brand-logos/logo-${i + 1}.svg`)

// Branding methods, rendered in the home "Workflow process" numbered-grid style.
const brandingServices = [
  {
    icon: Printer,
    title: "UV printing",
    description: "Flatbed UV printing lays sharp, full-colour artwork straight onto acrylic, MDF, and plastic, and it stays vivid without fading, cracking, or peeling in use.",
  },
  {
    icon: Flash,
    title: "Laser engraving",
    description: "A focused laser cuts your logo permanently into metal, acrylic, and wood for a crisp, tactile mark that never rubs off or wears away with handling.",
  },
  {
    icon: Colorfilter,
    title: "Sublimation & embossing",
    description: "Dye-sublimation prints edge to edge on fabric, while thermo-embossing raises the finish, the premium touches that make gifting pieces feel considered.",
  },
]

/**
 * Page numbers to render, with `null` standing for an elided run. Keeps the
 * pager a fixed width however many pages the catalogue grows to: the first, the
 * last, and the current page with one neighbour either side.
 */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const wanted = [1, total, current - 1, current, current + 1]
  const pages = [...new Set(wanted)].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const n of pages) {
    if (prev && n - prev > 1) out.push(null)
    out.push(n)
    prev = n
  }
  return out
}

export default function Products() {
  useDocumentMetadata(
    "Custom MDF, Acrylic, Lanyard & Badge Products | Ortex",
    "Browse Ortex Industries' custom products: MDF and acrylic items, lanyards, badges, exam boards and corporate gifts, all branded in-house with GST quotations.",
    { path: "/products" }
  )

  // The hub renders the live catalogue managed in the Admin panel (with the
  // static constants as fallback): every product, filtered by category.
  const { products, categories } = useCatalog()

  const [category, setCategory] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [ready, setReady] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const gridRef = useRef(null)

  // Every product with the URL the prerender gave it. `productSlugs` is run
  // over the WHOLE list (not per category) so the numeric suffix a duplicate
  // name gets here is the one scripts/prerender.mjs baked into the static
  // pages; a per-category slug map would drift and link to a 404.
  const catalogue = useMemo(() => {
    const slugs = productSlugs(products)
    const byName = new Map(categories.map((c) => [c.category, c]))
    return products
      .map((p) => {
        // A product whose category the console has retired has no landing page
        // to link to, so it is not offered here.
        const entry = byName.get(p.category)
        if (!entry) return null
        return {
          ...p,
          path: `/products/${entry.slug}/${slugs.get(p.id)}`,
          categorySlug: entry.slug,
          categoryName: entry.name,
        }
      })
      .filter(Boolean)
  }, [products, categories])

  // Card image fallbacks, resolved once per category: the Admin image, else a
  // real production photo, else the workshop shot. Only a third of the live
  // catalogue carries a photo of its own, so most cards land on this.
  const categoryImages = useMemo(() => {
    const map = new Map()
    for (const c of categories) {
      map.set(c.slug, c.image || photosForCategory(c, 1)[0]?.url || FALLBACK_IMAGE)
    }
    return map
  }, [categories])

  // Filter chips: only categories that actually have something to show.
  const filters = useMemo(() => {
    const counts = new Map()
    for (const p of catalogue) counts.set(p.categorySlug, (counts.get(p.categorySlug) || 0) + 1)
    return categories
      .filter((c) => counts.get(c.slug))
      // The chip carries the console's own category name ("Acrylic products"),
      // not the SEO display name ("Custom Acrylic Products"): the rail is one
      // scrolling row, and the longer titles push half of it off the screen.
      .map((c) => ({ slug: c.slug, name: c.category || c.name, count: counts.get(c.slug) }))
  }, [catalogue, categories])

  const visible = useMemo(() => {
    let rows = category ? catalogue.filter((p) => p.categorySlug === category) : catalogue
    const q = query.trim().toLowerCase()
    if (q) {
      // Name, material, SKU and category only — never the description. A
      // description is long enough to contain almost any word, and matching on
      // it is what once answered "wedding invitation cards" with an acrylic
      // keychain; a buyer reads that as us not making what they asked for.
      rows = rows.filter((p) =>
        `${p.name} ${p.material} ${p.sku} ${p.categoryName}`.toLowerCase().includes(q)
      )
    }
    return rows
  }, [catalogue, category, query])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 1), pageCount)
  const start = (safePage - 1) * PAGE_SIZE
  const pageItems = visible.slice(start, start + PAGE_SIZE)

  const activeEntry = category ? categories.find((c) => c.slug === category) : null
  const activeCopy = activeEntry
    ? {
        title: activeEntry._live?.displayName?.trim() || CARD_COPY[activeEntry.slug]?.title || activeEntry.name,
        description:
          activeEntry._live?.intro?.trim() ||
          CARD_COPY[activeEntry.slug]?.description ||
          activeEntry.seoDescription,
      }
    : null

  // The query string is read AFTER mount, never during the first render: this
  // page is prerendered (scripts/prerender.mjs) with no filter applied, and
  // applying ?category= while React is hydrating would not match that markup.
  useEffect(() => {
    const pageFromUrl = Number(searchParams.get("page"))
    setCategory(searchParams.get("category") || "")
    setQuery(searchParams.get("q") || "")
    setPage(pageFromUrl > 0 ? pageFromUrl : 1)
    setReady(true)
    // Once, on mount: from here on this component owns the query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ...and written back, so a filtered page can be linked, bookmarked and
  // shared. `replace` keeps the back button pointing at the previous PAGE.
  useEffect(() => {
    if (!ready) return
    const next = new URLSearchParams()
    if (category) next.set("category", category)
    if (query.trim()) next.set("q", query.trim())
    if (safePage > 1) next.set("page", String(safePage))
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true })
  }, [ready, category, query, safePage, searchParams, setSearchParams])

  const goToPage = (next) => {
    setPage(next)
    // Jump to the top of the grid, not the top of the page, so the filter rail
    // stays in view. Lenis owns the scroll position while it is running.
    const el = gridRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 120
    const lenis = getLenis()
    if (lenis) lenis.scrollTo(top, { immediate: true })
    else window.scrollTo(0, top)
  }

  // Typing re-filters in place: the grid is right under the box, so scrolling
  // to it would pull the search field the person is still using off the screen.
  const onSearch = (value) => {
    setQuery(value)
    setPage(1)
  }

  // The category rail is one row that scrolls when it does not fit, and on a
  // desktop there is nothing to say so: no scrollbar (it is hidden), no touch
  // to discover it with. These arrows are that signal, and each appears ONLY
  // while there is something left to reach in its direction. Both start false
  // so the prerendered markup and the first client render agree; the measure
  // happens in the effect below, after mount.
  const railRef = useRef(null)
  const [rail, setRail] = useState({ left: false, right: false })

  const measureRail = useCallback(() => {
    const el = railRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setRail({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 })
  }, [])

  useEffect(() => {
    const el = railRef.current
    if (!el) return
    measureRail()
    el.addEventListener("scroll", measureRail, { passive: true })
    window.addEventListener("resize", measureRail)
    return () => {
      el.removeEventListener("scroll", measureRail)
      window.removeEventListener("resize", measureRail)
    }
    // filters.length: the live catalogue arrives after the static fallback, and
    // a different number of chips is a different scroll width.
  }, [measureRail, filters.length])

  const scrollRail = (direction) => {
    const el = railRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.7), behavior: "smooth" })
  }

  return (
    <>
      {/* Page Header */}
      <section className="section-y-hero bg-background">
        <div className="lp-wrap text-center">
          <div className="hero-in max-w-3xl mx-auto">
            <h1 className="text-[36px] sm:text-[48px] md:text-[82px] font-medium leading-[1.05] mb-8 tracking-tight text-foreground text-balance">
              Products & Services
            </h1>
            <p className="text-[20px] font-normal text-foreground leading-relaxed max-w-2xl mx-auto">
              Comprehensive range of premium customized products manufactured in-house with complete branding and customization support.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content Section — lead with the catalogue buyers came for */}
      <section className="pt-0 pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background text-left">
        <div className="lp-wrap">

          {/* Catalogue — every product, filtered by category */}
          <div className="mb-20">

            {/* Search — the same control the /work archive uses */}
            <div className="max-w-lg mx-auto mb-7 relative">
              <SearchNormal1
                size={18}
                color="currentColor"
                variant="Linear"
                className="absolute left-5 top-1/2 -translate-y-1/2 text-[#78829D] transition-colors peer-focus:text-primary"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search products, e.g. keychain, clock, badge…"
                aria-label="Search products"
                className="peer w-full pl-12 pr-14 py-3.5 rounded-full bg-background border border-[#EBEDF3] text-[16px] text-foreground placeholder:text-[16px] placeholder:font-medium placeholder:text-[#78829D] focus:outline-none focus:border-primary/80 transition-all duration-200 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => onSearch("")}
                  aria-label="Clear search"
                  className="absolute top-1/2 -translate-y-1/2 right-3 w-[24px] h-[24px] grid place-items-center rounded-full bg-[#EBEDF3] text-[#071437] hover:bg-primary/10 hover:text-primary transition-all duration-150 cursor-pointer"
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </div>

            {/* Category filters — one row: centred when it fits, scrolls when
                it overflows, with an arrow at each end that is only there while
                that direction still has chips to reach. */}
            <div className="relative mb-8">
              <div
                ref={railRef}
                className="overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="group"
                aria-label="Filter products by category"
              >
                <div className="flex w-max mx-auto gap-2.5 px-1">
                {[{ slug: "", name: "All products", count: catalogue.length }, ...filters].map((f) => {
                  const active = category === f.slug
                  const Icon = CATEGORY_ICONS[f.slug || "all"] || Tag
                  return (
                    <button
                      key={f.slug || "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => { setCategory(f.slug); goToPage(1) }}
                      className={`inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-transparent border-[#EBEDF3] text-foreground hover:border-foreground/40"
                      }`}
                    >
                      <Icon
                        size={16}
                        variant="Bulk"
                        color={active ? "currentColor" : "#78829D"}
                        aria-hidden="true"
                      />
                      {f.name}
                      <span className="opacity-60 tabular-nums">{f.count}</span>
                    </button>
                  )
                })}
                </div>
              </div>

              {/* Scroll affordances. The gradient lets the row slide UNDER the
                  arrow rather than stopping dead at it, which is what tells you
                  there is more there. Hidden from assistive tech: the chips
                  themselves are already reachable by tab and by screen reader,
                  so these would only add two controls that go nowhere new. */}
              {rail.left && (
                <div className="absolute inset-y-0 left-0 flex items-center pr-8 bg-gradient-to-r from-background via-background to-transparent">
                  <button
                    type="button"
                    onClick={() => scrollRail(-1)}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="w-9 h-9 rounded-full border border-[#EBEDF3] bg-background text-foreground grid place-items-center transition-colors duration-200 hover:text-primary hover:border-primary/40 cursor-pointer"
                  >
                    <ArrowLeft2 size={16} color="currentColor" variant="Linear" />
                  </button>
                </div>
              )}
              {rail.right && (
                <div className="absolute inset-y-0 right-0 flex items-center pl-8 bg-gradient-to-l from-background via-background to-transparent">
                  <button
                    type="button"
                    onClick={() => scrollRail(1)}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="w-9 h-9 rounded-full border border-[#EBEDF3] bg-background text-foreground grid place-items-center transition-colors duration-200 hover:text-primary hover:border-primary/40 cursor-pointer"
                  >
                    <ArrowRight2 size={16} color="currentColor" variant="Linear" />
                  </button>
                </div>
              )}
            </div>

            {/* The filtered category in its own words, and the way through to
                its landing page, where the deeper SEO content lives. */}
            {activeCopy && (
              <div className="mb-10 max-w-3xl">
                <h2 className="text-[28px] md:text-[32px] font-medium leading-tight tracking-tight text-foreground mb-3">
                  {activeCopy.title}
                </h2>
                <p className="text-[16px] font-normal text-[#4b5675] leading-relaxed">
                  {activeCopy.description}
                </p>
                <Link
                  to={`/products/${activeEntry.slug}`}
                  className="mt-4 inline-flex items-center gap-2 text-[15px] font-semibold text-primary hover:gap-3 transition-all duration-200"
                >
                  See the full {activeEntry.name} page
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            )}

            <p className="text-[14px] text-muted-foreground mb-6" aria-live="polite">
              {visible.length
                ? `Showing ${start + 1}–${start + pageItems.length} of ${visible.length} product${visible.length === 1 ? "" : "s"}`
                : query.trim()
                  ? `Nothing matches "${query.trim()}". Try a different word, or ask us: we make to order.`
                  : "Nothing in this category yet. Pick another, or ask us: we make to order."}
            </p>

            {/* Product grid. Keyed on the filter + page so the cards replay
                their entrance instead of swapping content in place. */}
            <div
              ref={gridRef}
              key={`${category}-${safePage}`}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-[30px] gap-y-[50px]"
            >
              {pageItems.map((p, idx) => (
                <motion.div
                  key={p.id}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: Math.min(idx, 5) * 0.06 }}
                >
                  <Link
                    to={p.path}
                    className="group flex flex-col h-full rounded-[24px] [corner-shape:squircle] bg-card transition-colors duration-300 overflow-hidden"
                  >
                    {/* The photo carries the card's radius on all four corners,
                        not just the two the card's own clip would give it. */}
                    <div className="aspect-square overflow-hidden rounded-[24px] [corner-shape:squircle] bg-muted">
                      <img
                        src={p.images?.[0] || categoryImages.get(p.categorySlug) || FALLBACK_IMAGE}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                      />
                    </div>
                    <div className="flex flex-col flex-1 pt-5">
                      <span className="block text-[12px] font-semibold text-[#4b5675] uppercase mb-2">
                        {p.categoryName}
                      </span>
                      <h3 className="text-[20px] font-semibold mb-2 text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {p.name}
                      </h3>
                      {/* Material is a detail-page fact, not a listing one: it
                          is still SEARCHED on here, just not printed on a card.
                          See ProductDetail.jsx. */}
                      {/* The clamp and the flex grow must not share an element:
                          `flex-1` stretches the -webkit-box past its two lines,
                          so a third line shows through the hidden overflow with
                          the ellipsis still drawn at line two. */}
                      <div className="flex-1">
                        <p className="text-[15px] font-normal text-[#4b5675] leading-relaxed line-clamp-2">
                          {p.description}
                        </p>
                      </div>
                      {/* A minimum of 1 is the console's default for "not set",
                          so it is never presented to a buyer as a real MOQ. */}
                      {(p.moq > 1 || p.leadTimeDays > 0) && (
                        <div className="mt-5 pt-4 border-t border-border/70 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-muted-foreground">
                          {p.moq > 1 && (
                            <span className="inline-flex items-center gap-1.5">
                              <Box size={15} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
                              MOQ {p.moq} {p.unit}
                            </span>
                          )}
                          {p.moq > 1 && p.leadTimeDays > 0 && (
                            <span className="text-border" aria-hidden="true">·</span>
                          )}
                          {p.leadTimeDays > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <Clock size={15} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
                              {p.leadTimeDays}d dispatch
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <nav aria-label="Product pages" className="mt-16 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage === 1}
                  aria-label="Previous page"
                  className="w-11 h-11 rounded-full border border-border bg-card text-foreground grid place-items-center transition-colors duration-200 hover:text-primary hover:border-primary/40 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ArrowLeft2 size={18} color="currentColor" variant="Linear" aria-hidden="true" />
                </button>

                {pageWindow(safePage, pageCount).map((n, i) =>
                  n === null ? (
                    <span key={`gap-${i}`} className="w-11 h-11 grid place-items-center text-muted-foreground" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      onClick={() => goToPage(n)}
                      aria-label={`Page ${n}`}
                      aria-current={n === safePage ? "page" : undefined}
                      className={`w-11 h-11 rounded-full text-[14px] font-semibold tabular-nums transition-colors duration-200 ${
                        n === safePage
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground border border-border hover:text-primary hover:border-primary/40"
                      }`}
                    >
                      {n}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage === pageCount}
                  aria-label="Next page"
                  className="w-11 h-11 rounded-full border border-border bg-card text-foreground grid place-items-center transition-colors duration-200 hover:text-primary hover:border-primary/40 disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ArrowRight2 size={18} color="currentColor" variant="Linear" aria-hidden="true" />
                </button>
              </nav>
            )}
          </div>

        </div>
      </section>

      {/* Customization — home "Workflow process" numbered grid, on footer-dark bg */}
      <section className="section-y bg-[#010101] text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-white/50 tracking-[0.22em] uppercase mb-3">
              Customization
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-white text-balance">
              <RevealWords text="Built to your spec" />
            </h2>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[42px] list-none">
            {customizationOptions.map((option, idx) => (
              <motion.li
                key={option.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 text-[36px] font-semibold leading-none text-white/50 tabular-nums">
                  0{idx + 1}
                </div>

                <h3 className="text-[24px] font-medium text-white">{option.title}</h3>
                <div className="mt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.2)" }} />
                <p className="mt-8 text-[16px] font-normal text-white/70 leading-relaxed line-clamp-3">
                  {option.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Otto "We service your vehicle" clone: black logo strip (marquee) above
          an indigo banner with a heading left and two-line copy right */}
      <section>
        {/* Logo strip */}
        <div className="bg-[#0a0a0a] py-[56px] overflow-hidden">
          <div className="relative overflow-hidden">
            <div className="animate-marquee flex items-center gap-[80px]" style={{ animationDuration: "28s" }}>
              {[...brandLogos, ...brandLogos].map((src, idx) => (
                <img
                  key={`${src}-${idx}`}
                  src={src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-12 w-auto flex-shrink-0 object-contain"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Indigo banner */}
        <div className="bg-[#1a237e] text-white py-[40px]">
          <div className="lp-wrap flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-white max-w-2xl">
              Your brand, made real
            </h2>
            <p className="text-[15px] md:text-[16px] leading-relaxed text-white/75 max-w-xs lg:text-right">
              From first sample to full production run, we manufacture it to your exact spec.
            </p>
          </div>
        </div>
      </section>

      {/* Branding services — home "Workflow process" numbered-grid design */}
      <section className="section-y bg-secondary text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Finishing
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
              <RevealWords text="Put your brand on anything" />
            </h2>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[42px] list-none">
            {brandingServices.map((service, idx) => (
              <motion.li
                key={service.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 w-[50px] h-[50px] rounded-[999px] bg-primary/10 flex items-center justify-center text-primary">
                  <service.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] font-medium text-foreground">{service.title}</h3>
                <div className="mt-6 border-t border-primary/20" />
                <p className="mt-6 text-[16px] font-normal text-foreground leading-relaxed line-clamp-3">
                  {service.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Call to Action Section */}
      <PageCTA
        title="Spotted the one? Let's price it."
        primary={{ to: "/quote", label: "Get a quote" }}
        secondary={{ to: "/contact", label: "Talk to us" }}
      >
        Share your requirements and we'll come back with materials, MOQ, and pricing tailored to your run.
      </PageCTA>
    </>
  )
}
