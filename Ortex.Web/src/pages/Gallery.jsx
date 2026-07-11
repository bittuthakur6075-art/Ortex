import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight, MessageSquare, Search, Tag } from "lucide-react"
import { Link } from "react-router-dom"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { photosData } from "../constants/photos"

/**
 * The complete production-photo archive (900+ IndiaMART listing photos), built
 * as a fast browser: search by product name + category chips + paged grid.
 * /work stays the editorial showcase; this page is for a buyer who knows
 * roughly what they want and needs to find it. The photos dataset (~200 KB)
 * only loads with this route's lazy chunk — it never rides the main bundle.
 */
export default function Gallery() {
  useDocumentMetadata(
    "Photo Gallery - Ortex Industries | 900+ Custom Manufacturing Photos",
    "Search the complete Ortex Industries production archive: acrylic keychains, wall clocks, badges, lanyards, fridge magnets, trophies and custom promotional merchandise we manufactured.",
    { path: "/gallery" }
  )

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(photosData.map((p) => p.category).filter(Boolean))).sort()],
    []
  )

  const PAGE_SIZE = 48

  const [activeCategory, setActiveCategory] = useState("All")
  const [query, setQuery] = useState("")
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    let rows = activeCategory === "All" ? photosData : photosData.filter((p) => p.category === activeCategory)
    const q = query.trim().toLowerCase()
    if (q) rows = rows.filter((p) => (p.name || "").toLowerCase().includes(q))
    return rows
  }, [activeCategory, query])

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  // Any filter change restarts paging and closes the lightbox — its index
  // points into `filtered`, which just changed under it.
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

  useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox()
      else if (e.key === "ArrowLeft") showPrev()
      else if (e.key === "ArrowRight") showNext()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [lightboxIndex, closeLightbox, showPrev, showNext])

  const active = lightboxIndex !== null ? filtered[lightboxIndex] : null

  return (
    <div className="bg-background min-h-screen">
      <section className="py-12 bg-secondary border-b border-border/50">
        <div className="lp-wrap text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <span className="text-xs font-bold text-primary tracking-widest uppercase bg-primary/10 px-3 py-1.5 rounded-full inline-block mb-4">
              Complete archive
            </span>
            <h1 className="text-[32px] md:text-[42px] lg:text-5xl font-extrabold mb-4 tracking-tight text-foreground text-balance">
              Photo gallery
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Every production photo in one place — {photosData.length} photographs of orders we manufactured.
              Search by product or browse by category.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-8">
        <div className="lp-wrap">
          {/* Search + category filters */}
          <div className="max-w-md mx-auto mb-6 relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => applyFilter({ query: e.target.value })}
              placeholder="Search products, e.g. keychain, clock, badge…"
              aria-label="Search gallery photos"
              className="w-full pl-11 pr-4 py-3 rounded-full bg-muted border border-border/60 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
            />
          </div>

          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-10">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={activeCategory === cat}
                onClick={() => applyFilter({ category: cat })}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeCategory === cat
                    ? "bg-[#2f50e4] text-white shadow-md shadow-primary/20 scale-[1.03]"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mb-8" aria-live="polite">
            {filtered.length === photosData.length
              ? `${filtered.length} photos`
              : `${filtered.length} of ${photosData.length} photos`}
          </p>

          {/* Denser grid than /work — this page is a finder, not a showcase */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
            {visible.map((photo, index) => (
              <button
                key={`${photo.url}-${index}`}
                type="button"
                onClick={() => setLightboxIndex(index)}
                aria-label={`View ${photo.name} larger`}
                className="group relative bg-card border border-border/60 rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-300 cursor-pointer text-left"
              >
                <div className="aspect-square w-full overflow-hidden bg-muted">
                  <img
                    src={photo.url}
                    alt={photo.name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-2.5 border-t border-border/40">
                  <p className="text-xs font-semibold text-foreground line-clamp-1 group-hover:text-[#2f50e4] transition-colors duration-200">
                    {photo.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Tag className="h-2.5 w-2.5 text-[#2f50e4]" aria-hidden="true" />
                    {photo.category}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {visibleCount < filtered.length && (
            <div className="text-center mt-12">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                Load more
              </button>
              <p className="text-sm text-muted-foreground mt-4">
                Showing {visible.length} of {filtered.length}
              </p>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="text-center py-20 bg-muted/30 rounded-2xl border border-dashed border-border">
              <p className="text-muted-foreground font-medium">
                No photos match {query ? `"${query}"` : "this category"}.
              </p>
              <button
                type="button"
                onClick={() => applyFilter({ category: "All", query: "" })}
                className="mt-4 text-sm font-semibold text-[#2f50e4] hover:text-[#193ee4] transition-colors cursor-pointer"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            role="dialog"
            aria-modal="true"
            aria-label={active.name}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={closeLightbox}
          >
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white/75 hover:text-white p-2.5 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              aria-label="Close gallery"
            >
              <X className="h-7 w-7" />
            </button>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); showPrev() }}
              className="absolute left-4 md:left-8 text-white/75 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              aria-label="Previous image"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>

            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="max-w-3xl w-full flex flex-col bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-neutral-950 relative flex items-center justify-center max-h-[65vh]">
                <img src={active.url} alt={active.name} className="max-w-full max-h-[65vh] object-contain p-2" />
              </div>

              <div className="p-5 md:p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between bg-neutral-900 border-t border-neutral-800">
                <div>
                  <span className="bg-primary/20 text-[#2f50e4] px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block mb-1.5">
                    {active.category}
                  </span>
                  <h2 className="text-lg font-bold text-white tracking-tight leading-snug">{active.name}</h2>
                </div>
                <Link
                  to={`/contact?product=${encodeURIComponent(active.name)}&category=${encodeURIComponent(active.category || "")}`}
                  onClick={closeLightbox}
                  className="flex-none bg-[#2f50e4] hover:bg-[#193ee4] text-white py-3 px-5 font-semibold rounded-xl text-center transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/10"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Enquire
                </Link>
              </div>
            </motion.div>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); showNext() }}
              className="absolute right-4 md:right-8 text-white/75 hover:text-white p-3 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              aria-label="Next image"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
