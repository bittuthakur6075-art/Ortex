import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowLeft, ArrowRight, CloseCircle } from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import PageHero from "../components/ui/PageHero"
import PageCTA from "../components/ui/PageCTA"
import { fadeUp, EASE } from "../components/ui/Section"
import { getLenis } from "../hooks/useSmoothScroll"
import { PORTFOLIO, PORTFOLIO_CATEGORIES, portfolioImage, portfolioThumb } from "../constants/content"

const FILTERS = ["All", ...PORTFOLIO_CATEGORIES]

/** Full-screen photo viewer: Esc closes, arrow keys step, page scroll is locked while open. */
function Lightbox({ items, index, onClose, onStep }) {
  const item = items[index]

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowRight") onStep(1)
      else if (e.key === "ArrowLeft") onStep(-1)
    }
    document.addEventListener("keydown", onKey)
    const lenis = getLenis()
    lenis?.stop()
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      lenis?.start()
      document.body.style.overflow = ""
    }
  }, [onClose, onStep])

  const navBtn = "grid place-items-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-[70] bg-[#050E28]/95 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      onClick={onClose}
    >
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 text-white/70 text-[14px]">
        <span className="tabular-nums">{index + 1} / {items.length}</span>
        <button type="button" onClick={onClose} aria-label="Close" className={navBtn}>
          <CloseCircle size={24} color="currentColor" />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center gap-3 px-3 sm:px-6" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => onStep(-1)} aria-label="Previous photo" className={`${navBtn} hidden sm:grid flex-none`}>
          <ArrowLeft size={22} color="currentColor" />
        </button>
        <AnimatePresence mode="wait" initial={false}>
          <motion.img
            key={item.image}
            src={portfolioImage(item.image)}
            alt={item.title}
            className="max-h-full max-w-full object-contain"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE }}
          />
        </AnimatePresence>
        <button type="button" onClick={() => onStep(1)} aria-label="Next photo" className={`${navBtn} hidden sm:grid flex-none`}>
          <ArrowRight size={22} color="currentColor" />
        </button>
      </div>

      <div className="px-4 sm:px-6 py-6 text-center text-white" onClick={(e) => e.stopPropagation()}>
        <p className="text-[12px] uppercase tracking-[0.2em] text-white/50">{item.category}</p>
        <h2 className="mt-2 text-[20px] md:text-[24px] font-semibold">{item.title}</h2>
        <p className="mt-2 max-w-2xl mx-auto text-[15px] text-white/70 leading-relaxed">{item.description}</p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={() => onStep(-1)} aria-label="Previous photo" className={`${navBtn} sm:hidden`}>
            <ArrowLeft size={22} color="currentColor" />
          </button>
          <Link
            to={`/contact?product=${encodeURIComponent(item.title)}`}
            className="lp-pill-btn primary sm"
          >
            Order something similar
          </Link>
          <button type="button" onClick={() => onStep(1)} aria-label="Next photo" className={`${navBtn} sm:hidden`}>
            <ArrowRight size={22} color="currentColor" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function Portfolio() {
  useDocumentMetadata(
    "Portfolio: Products We Have Made | Ortex Industries",
    "Real orders from the Ortex Industries floor: printed lanyards, magnetic and acrylic badges, MDF wall clocks, souvenir magnets and promotional stationery.",
    { path: "/portfolio" }
  )

  const [filter, setFilter] = useState("All")
  const [open, setOpen] = useState(null)

  const items = useMemo(
    () => (filter === "All" ? PORTFOLIO : PORTFOLIO.filter((p) => p.category === filter)),
    [filter]
  )
  const count = (f) => (f === "All" ? PORTFOLIO.length : PORTFOLIO.filter((p) => p.category === f).length)

  const close = () => setOpen(null)
  const step = (dir) => setOpen((i) => (i === null ? i : (i + dir + items.length) % items.length))

  return (
    <>
      <PageHero title="Our portfolio of custom products">
        Recent orders from our floor, photographed before dispatch. Open any photo for the details.
      </PageHero>

      <section className="pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-background">
        <div className="lp-wrap">
          <div role="tablist" aria-label="Filter by category" className="flex flex-wrap justify-center gap-2 mb-12">
            {FILTERS.map((f) => {
              const active = f === filter
              return (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setFilter(f); setOpen(null) }}
                  className={`px-5 py-2.5 rounded-full text-[15px] font-medium border transition-colors duration-200 cursor-pointer ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:border-primary/50 hover:text-primary"
                  }`}
                >
                  {f} <span className={active ? "text-white/70" : "text-[#78829D]"}>{count(f)}</span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[12px] md:gap-[20px]">
            {items.map((item, idx) => (
              <motion.button
                key={item.image}
                type="button"
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: (idx % 4) * 0.05 }}
                onClick={() => setOpen(idx)}
                className="group text-left cursor-pointer"
              >
                <div className="overflow-hidden bg-secondary aspect-square">
                  <img
                    src={portfolioThumb(item.image)}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </div>
                <p className="mt-3 text-[12px] uppercase tracking-[0.16em] text-[#78829D]">{item.category}</p>
                <h2 className="mt-1 text-[15px] md:text-[17px] font-semibold text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </h2>
                <p className="mt-1 text-[14px] text-[#4b5675] leading-relaxed line-clamp-2">{item.description}</p>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <AnimatePresence>
        {open !== null && items[open] && <Lightbox items={items} index={open} onClose={close} onStep={step} />}
      </AnimatePresence>

      <PageCTA
        title="Want something like this?"
        primary={{ to: "/contact", label: "Get a quote" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        Every piece here was made to a client's brief. Yours could be next.
      </PageCTA>
    </>
  )
}
