import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, ChevronLeft, ChevronRight, MessageSquare, Tag, Grid } from "lucide-react"
import { Link } from "react-router-dom"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { workPhotos } from "../constants/home"

/**
 * Replaces the old /portfolio and /photos pages, which were two grids of the
 * same thing under different names. /portfolio additionally presented seven
 * Unsplash stock photos as "our recent manufacturing projects" — those are gone.
 * Everything here is a photograph of an order we actually produced.
 */
export default function Work() {
  useDocumentMetadata(
    "Our Work - Ortex Industries | Custom Manufacturing Gallery",
    "Browse real production photography from Ortex Industries: custom keychains, wall clocks, exam boards, badges, lanyards, fridge magnets, flags, and promotional merchandise.",
    { path: "/work" }
  )

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(workPhotos.map((p) => p.category).filter(Boolean))).sort()],
    []
  )

  // 900+ photographs. Rendering them all at once produced a ~2.6 MB DOM, so the
  // grid pages in. The lightbox still walks the full filtered set.
  const PAGE_SIZE = 32

  const [activeCategory, setActiveCategory] = useState("All")
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const filtered = useMemo(
    () => (activeCategory === "All" ? workPhotos : workPhotos.filter((p) => p.category === activeCategory)),
    [activeCategory]
  )

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  const closeLightbox = useCallback(() => setLightboxIndex(null), [])
  const showPrev = useCallback(
    () => setLightboxIndex((i) => (i === 0 ? filtered.length - 1 : i - 1)),
    [filtered.length]
  )
  const showNext = useCallback(
    () => setLightboxIndex((i) => (i === filtered.length - 1 ? 0 : i + 1)),
    [filtered.length]
  )

  // The old gallery trapped users in the lightbox with no keyboard escape.
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
              Production archive
            </span>
            <h1 className="text-[32px] md:text-[42px] lg:text-5xl font-extrabold mb-4 tracking-tight text-foreground text-balance">
              Our work
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Real production photography of custom promotional merchandise, corporate gifts, and office
              accessories we manufactured. No stock imagery.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-8">
        <div className="lp-wrap">
          <div className="flex flex-wrap justify-center gap-2 md:gap-3 mb-12">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={activeCategory === cat}
                onClick={() => {
                  setActiveCategory(cat)
                  setLightboxIndex(null)
                  setVisibleCount(PAGE_SIZE)
                }}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeCategory === cat
                    ? "bg-[#466EFA] text-white shadow-md shadow-primary/20 scale-[1.03]"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                }`}
              >
                {cat === "All" ? "All work" : cat}
              </button>
            ))}
          </div>

          <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {visible.map((photo, index) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                  key={photo.image}
                  className="group relative bg-card border border-border/60 rounded-2xl overflow-hidden hover:shadow-xl hover:border-primary/30 transition-all duration-300 flex flex-col"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxIndex(index)}
                    aria-label={`View ${photo.title} larger`}
                    className="aspect-square w-full overflow-hidden bg-muted relative cursor-pointer"
                  >
                    <img
                      src={photo.image}
                      alt={photo.alt || photo.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300"
                    />
                    {photo.category && (
                      <span className="absolute top-3 left-3 bg-background/80 backdrop-blur-md text-foreground text-[10px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border border-border/40 flex items-center gap-1">
                        <Tag className="h-2.5 w-2.5 text-[#466EFA]" aria-hidden="true" />
                        {photo.category}
                      </span>
                    )}
                  </button>

                  <div className="p-4 flex-grow flex flex-col justify-between items-start border-t border-border/40 bg-card/60">
                    <h2 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug group-hover:text-[#466EFA] transition-colors duration-200">
                      {photo.title}
                    </h2>
                    <div className="mt-3 flex items-center justify-between w-full">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        <Grid className="h-3 w-3" aria-hidden="true" />
                        Quick view
                      </span>
                      <Link
                        to={`/contact?product=${encodeURIComponent(photo.title)}&category=${encodeURIComponent(photo.category || "")}`}
                        className="text-xs font-bold text-[#466EFA] hover:text-[#2f57e0] flex items-center gap-1.5 transition-colors duration-150"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        Inquire
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>

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
              <p className="text-muted-foreground font-medium">No work found in this category.</p>
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
            aria-label={active.title}
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
              className="max-w-4xl w-full flex flex-col md:flex-row bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="md:w-3/5 aspect-square md:aspect-auto md:h-[550px] bg-neutral-950 relative flex items-center justify-center">
                <img
                  src={active.image}
                  alt={active.alt || active.title}
                  className="max-w-full max-h-full object-contain p-2"
                />
              </div>

              <div className="md:w-2/5 p-6 md:p-8 flex flex-col justify-between bg-neutral-900 text-left border-t md:border-t-0 md:border-l border-neutral-800">
                <div className="space-y-6">
                  {active.category && (
                    <span className="bg-primary/20 text-[#466EFA] px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block">
                      {active.category}
                    </span>
                  )}
                  <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight leading-snug">
                    {active.title}
                  </h2>
                  <div className="h-px bg-neutral-800 w-full" />
                  <p className="text-neutral-400 text-sm leading-relaxed">
                    Custom manufacturing is fully supported for this product. Request changes to size, shape,
                    material thickness, colour scheme, and branding method (UV printing or laser engraving).
                  </p>
                </div>

                <div className="pt-8">
                  <Link
                    to={`/contact?product=${encodeURIComponent(active.title)}&category=${encodeURIComponent(active.category || "")}`}
                    onClick={closeLightbox}
                    className="w-full bg-[#466EFA] hover:bg-[#2f57e0] text-white py-3.5 px-6 font-semibold rounded-xl text-center transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary/10"
                  >
                    <MessageSquare className="h-5 w-5" aria-hidden="true" />
                    Enquire about this product
                  </Link>
                </div>
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
