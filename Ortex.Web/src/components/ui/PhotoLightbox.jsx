import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CloseCircle, ArrowLeft, ArrowRight, Sms, Ruler, Layer, Colorfilter, Printer, Flash } from "iconsax-react"
import { Link } from "react-router-dom"

// Slide-in variants for the premium image transition. `dir` is +1 when moving
// to the next photo, -1 to the previous.
const slide = {
  enter: (dir) => ({ x: dir > 0 ? "55%" : "-55%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? "-55%" : "55%", opacity: 0 }),
}

/**
 * Shared production-photo lightbox for the Work page. Expects a normalised
 * `item`: { src, title, category, alt }. Handles Esc / arrow-key navigation and
 * locks body scroll while open. Parent wraps this in <AnimatePresence> and
 * renders it only when an item is active, so the exit animation runs on close.
 * `index`/`total` (optional) drive the position counter.
 */

// Applies to every product on the site — shown as scannable chips so the panel
// communicates real value instead of one generic paragraph.
const CUSTOMIZABLE = [
  { label: "Size & shape", icon: Ruler },
  { label: "Material", icon: Layer },
  { label: "Colour", icon: Colorfilter },
  { label: "UV printing", icon: Printer },
  { label: "Laser engraving", icon: Flash },
]

export default function PhotoLightbox({ item, description, index, total, onClose, onPrev, onNext }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") onPrev()
      else if (e.key === "ArrowRight") onNext()
    }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose, onPrev, onNext])

  // Slide direction, derived from how the index changed since the last render.
  const prevIndex = useRef(index)
  const direction = typeof index === "number" && index !== prevIndex.current
    ? (index > prevIndex.current ? 1 : -1)
    : 1
  useEffect(() => { prevIndex.current = index }, [index])

  const enquireHref = `/contact?product=${encodeURIComponent(item.title)}&category=${encodeURIComponent(item.category || "")}`
  const hasCounter = typeof index === "number" && typeof total === "number" && total > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2.5 rounded-full hover:bg-white/10 transition-colors duration-150 cursor-pointer"
        aria-label="Close gallery"
      >
        <CloseCircle size={30} color="currentColor" variant="Linear" />
      </button>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPrev() }}
        className="absolute left-4 md:left-8 z-10 grid place-items-center h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white hover:text-primary transition-colors duration-200 cursor-pointer"
        aria-label="Previous image"
      >
        <ArrowLeft size={22} color="currentColor" />
      </button>

      <motion.div
        initial={{ scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 10 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="w-[92vw] md:w-[80vw] md:h-[80vh] flex flex-col md:flex-row bg-background rounded-none overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full aspect-square md:w-auto md:h-full md:aspect-square shrink-0 bg-secondary overflow-hidden">
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.img
              key={item.src}
              src={item.src}
              alt={item.alt || item.title}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 260, damping: 30 },
                opacity: { duration: 0.25, ease: "easeOut" },
              }}
              className="absolute inset-0 w-full h-full object-contain p-5 md:p-8"
            />
          </AnimatePresence>
        </div>

        <div className="flex-1 min-w-0 p-8 md:p-10 flex flex-col text-left overflow-y-auto">
          {/* Header: category + position counter */}
          <div className="flex items-center justify-between gap-4 mb-4">
            {item.category ? (
              <span className="text-[16px] font-semibold uppercase tracking-[0.04em] text-primary">
                {item.category}
              </span>
            ) : <span />}
            {hasCounter && (
              <span className="text-[13px] font-medium text-[#99A1B7] tabular-nums whitespace-nowrap">
                {index + 1} / {total}
              </span>
            )}
          </div>

          <h2 className="text-[32px] font-semibold text-foreground leading-tight">
            {item.title}
          </h2>

          <div className="h-px bg-[#EBEDF3] w-full my-6" />

          <p className="text-[18px] font-normal text-foreground leading-relaxed">
            {description ||
              "Custom manufacturing is fully supported for this product. Request changes to size, shape, material thickness, colour scheme, and branding method."}
          </p>

          {/* What can be customized — scannable chips */}
          <div className="mt-7">
            <p className="text-[14px] font-medium uppercase tracking-[0.04em] text-[#4B5675] mb-3">
              Fully customizable
            </p>
            <div className="flex flex-wrap gap-2">
              {CUSTOMIZABLE.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary bg-primary/10 rounded-full px-3 py-[6px] whitespace-nowrap"
                >
                  <c.icon size={16} color="currentColor" variant="Bulk" aria-hidden="true" />
                  {c.label}
                </span>
              ))}
            </div>
          </div>

          {/* Actions: primary enquiry + secondary self-serve path */}
          <div className="mt-auto pt-8 flex flex-col gap-2.5">
            <Link
              to={enquireHref}
              onClick={onClose}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3.5 px-6 font-semibold rounded-full text-center transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <Sms size={20} color="currentColor" variant="Linear" aria-hidden="true" />
              Enquire about this product
            </Link>
            <Link
              to="/products"
              onClick={onClose}
              className="w-full border border-border hover:border-foreground/40 text-foreground py-3 px-6 font-semibold rounded-full text-center transition-colors duration-200"
            >
              Browse all products
            </Link>
          </div>
        </div>
      </motion.div>

      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onNext() }}
        className="absolute right-4 md:right-8 z-10 grid place-items-center h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white hover:text-primary transition-colors duration-200 cursor-pointer"
        aria-label="Next image"
      >
        <ArrowRight size={22} color="currentColor" />
      </button>
    </motion.div>
  )
}
