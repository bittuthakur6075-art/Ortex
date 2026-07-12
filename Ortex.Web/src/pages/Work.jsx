import { useState, useMemo, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { Search, X, Eye, SearchX } from "lucide-react"
import {
  Category, Key, Clock, Medal, Gift, ClipboardText, Flag, Sticker, Tag,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { workPhotos } from "../constants/home"
import PageHero from "../components/ui/PageHero"
import PhotoLightbox from "../components/ui/PhotoLightbox"

// The photo archive has two labels for one concept ("Badges" from the main
// dataset, "Badges & Lanyards" on a few hand-added photos). Fold them into a
// single filter so the taxonomy is clean; lanyard photos still surface by search.
const CATEGORY_ALIASES = { "Badges & Lanyards": "Badges" }
const normalizeCategory = (c) => CATEGORY_ALIASES[c] || c

// Leading icon per filter chip (iconsax Bulk). Unmapped categories fall back to
// a generic tag.
const CATEGORY_ICONS = {
  All: Category,
  Keychain: Key,
  "Wall Clock": Clock,
  Badges: Medal,
  "Custom Promotional": Gift,
  "Exam Board": ClipboardText,
  Flag: Flag,
  "Fridge Magnet": Sticker,
}

/**
 * The single production-photo page. Merges the former /work (editorial showcase)
 * and /gallery (searchable archive), which showed the same photos in two UIs:
 * workPhotos is photosData plus a handful of extras, so /gallery was redundant
 * and now 301-redirects here. Search by product, filter by category, page the
 * grid, open any photo in the shared PhotoLightbox.
 */
export default function Work() {
  useDocumentMetadata(
    "Our Work - Ortex Industries | Custom Manufacturing Photo Gallery",
    "Browse and search the full Ortex Industries production archive: custom keychains, wall clocks, exam boards, badges, lanyards, fridge magnets, flags, and promotional merchandise we manufactured. No stock imagery.",
    { path: "/work" }
  )

  // "All" first, then categories ordered by photo count (most-used lead, so the
  // rarest is what scrolls off if the row ever overflows).
  const categories = useMemo(() => {
    const counts = new Map()
    for (const p of workPhotos) {
      const c = normalizeCategory(p.category)
      if (c) counts.set(c, (counts.get(c) || 0) + 1)
    }
    const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)
    return ["All", ...ordered]
  }, [])

  const PAGE_SIZE = 48

  const [activeCategory, setActiveCategory] = useState("All")
  const [query, setQuery] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    let rows = activeCategory === "All" ? workPhotos : workPhotos.filter((p) => normalizeCategory(p.category) === activeCategory)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((p) => (p.title || "").toLowerCase().includes(q))
    return rows
  }, [activeCategory, query])

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  // Any filter change restarts paging and closes the lightbox — its index points
  // into `filtered`, which just changed under it.
  const applyFilter = (patch) => {
    if (patch.category !== undefined) setActiveCategory(patch.category)
    if (patch.query !== undefined) setQuery(patch.query)
    setLightboxIndex(null)
    setVisibleCount(PAGE_SIZE)
  }

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const showPrev = useCallback(
    () => setLightboxIndex((i) => (i === 0 ? filtered.length - 1 : i - 1)),
    [filtered.length]
  )
  const showNext = useCallback(
    () => setLightboxIndex((i) => (i === filtered.length - 1 ? 0 : i + 1)),
    [filtered.length]
  )

  const active = lightboxIndex !== null ? filtered[lightboxIndex] : null

  return (
    <div className="bg-background min-h-screen">
      <PageHero title="Our work">
        Search the full archive of real production photography, every photo an order we actually
        manufactured. No stock imagery.
      </PageHero>

      <section className="pt-0 pb-[120px]">
        <div className="lp-wrap">
          {/* Search */}
          <div className="max-w-lg mx-auto mb-7 relative">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground transition-colors peer-focus:text-primary"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => applyFilter({ query: e.target.value })}
              placeholder="Search products, e.g. keychain, clock, badge…"
              aria-label="Search work photos"
              className="peer w-full pl-12 pr-12 py-3.5 rounded-full bg-background border border-border text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200"
            />
            {query && (
              <button
                type="button"
                onClick={() => applyFilter({ query: "" })}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            )}
          </div>

          {/* Category filters — one row: centered when it fits, scrolls when it overflows */}
          <div className="mb-10 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max mx-auto gap-2.5 px-1">
              {categories.map((cat) => {
                const Icon = CATEGORY_ICONS[cat] || Tag
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={activeCategory === cat}
                    onClick={() => applyFilter({ category: cat })}
                    className={`inline-flex flex-shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold border whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                      activeCategory === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent border-border text-foreground hover:border-foreground/40"
                    }`}
                  >
                    <Icon size={16} variant="Bulk" color="currentColor" aria-hidden="true" />
                    {cat === "All" ? "All work" : cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Grid — clean product-tile cards (site design language) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-x-6 gap-y-9">
            {visible.map((photo, index) => (
              <button
                key={`${photo.image}-${index}`}
                type="button"
                onClick={() => setLightboxIndex(index)}
                aria-label={`View ${photo.title} larger`}
                className="group text-left cursor-pointer"
              >
                <div className="relative aspect-square overflow-hidden bg-muted rounded-[4px]">
                  <img
                    src={photo.image}
                    alt={photo.alt || photo.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                  {/* Hover cue: signals the tile opens a larger view */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors duration-300">
                    <span className="grid place-items-center h-11 w-11 rounded-full bg-white/95 text-foreground opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-300">
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                </div>
                <div className="pt-3">
                  <p className="text-[16px] font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors duration-200">
                    {photo.title}
                  </p>
                  {photo.category && (
                    <p className="mt-1 text-[14px] font-medium text-[#4b5675]">{photo.category}</p>
                  )}
                </div>
              </button>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="text-center mt-12">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-full transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                Load more
              </button>
              <p className="text-sm text-muted-foreground mt-4">
                Showing {visible.length} of {filtered.length}
              </p>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 bg-muted/30 border border-dashed border-border rounded-2xl">
              <SearchX className="h-10 w-10 mx-auto text-muted-foreground/70 mb-4" aria-hidden="true" />
              <p className="text-muted-foreground font-medium">
                No work matches {query ? `"${query}"` : "this category"}.
              </p>
              <button
                type="button"
                onClick={() => applyFilter({ category: "All", query: "" })}
                className="mt-4 text-sm font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {active && (
          <PhotoLightbox
            item={{ src: active.image, title: active.title, category: active.category, alt: active.alt }}
            index={lightboxIndex}
            total={filtered.length}
            onClose={closeLightbox}
            onPrev={showPrev}
            onNext={showNext}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
