import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { CloseCircle, ArrowLeft, ArrowRight, Sms, Ruler, Layer, Colorfilter, Printer, Flash } from "iconsax-react"
import { Link } from "react-router-dom"

// One UI's motion, ported from Ortex.Mobile/src/ui/motion.ts (itself after One
// UI 8) so the site and the phone move alike: quick off the mark, a long gentle
// landing, and springs that settle without ever bouncing.
//
// `EASE_OUT` is theme/tokens `motion.easeOut`; `SPRING_PAGE` is that file's
// `SPRING.page`, described there as "a page's content settling after the push".
const EASE_OUT = [0.16, 1, 0.3, 1]
const SPRING_PAGE = { type: "spring", stiffness: 210, damping: 28, mass: 0.9 }
const FADE = 0.22

// Slide variants. `dir` is +1 when moving to the next photo, -1 to the previous.
//
// The travel is SHORT (22%, not the 55% this had) and carries a touch of scale.
// One UI does not throw a panel across the screen: the new content is already
// almost in place when it appears and simply settles, which is what makes it
// read as quick even though the landing is unhurried. A long slide has to move
// fast to not feel slow, and then it reads as a flick rather than a transition.
const OFFSET = 22
const slide = {
  enter: (dir) => ({ x: `${dir > 0 ? OFFSET : -OFFSET}%`, opacity: 0, scale: 0.98 }),
  center: { x: "0%", opacity: 1, scale: 1 },
  exit: (dir) => ({ x: `${dir > 0 ? -OFFSET : OFFSET}%`, opacity: 0, scale: 0.98 }),
}

// Reduced motion: cross-fade in place, no travel and no scale.
const still = {
  enter: { x: "0%", opacity: 0, scale: 1 },
  center: { x: "0%", opacity: 1, scale: 1 },
  exit: { x: "0%", opacity: 0, scale: 1 },
}

/**
 * Shared production-photo lightbox for the Work page. Expects a normalised
 * `item`: { src, title, category, alt }. Handles Esc / arrow-key navigation and
 * locks body scroll while open. Parent wraps this in <AnimatePresence> and
 * renders it only when an item is active, so the exit animation runs on close.
 * `index`/`total` (optional) drive the position counter.
 */

// Applies to every product on the site — shown as scannable chips so the panel
// communicates real value instead of one generic paragraph. Each chip opens to
// say what that actually means on the floor; the wording is the site's own
// (Products.jsx's customization and branding sections), so a visitor is never
// told two different things about the same process. Nothing here states a
// price, a lead time or a minimum: those belong in the quotation.
const CUSTOMIZABLE = [
  {
    label: "Size & shape",
    icon: Ruler,
    detail:
      "Custom cut shapes and dimensions, from a keychain silhouette to a full display board. Send the outline and we cut to it, rather than fitting your idea to a stock template.",
  },
  {
    label: "Material",
    icon: Layer,
    detail:
      "Pick the sheet thickness, material and surface finish, from matte acrylic to polished MDF, to suit the product and the budget for the run.",
  },
  {
    label: "Colour",
    icon: Colorfilter,
    detail:
      "Exact Pantone matching across every run, so the finish holds to your brand guidelines batch after batch, not just on the first order.",
  },
  {
    label: "UV printing",
    icon: Printer,
    detail:
      "Flatbed UV printing lays sharp, full-colour artwork straight onto acrylic, MDF and plastic, and it stays vivid without fading, cracking or peeling in use.",
  },
  {
    label: "Laser engraving",
    icon: Flash,
    detail:
      "A focused laser cuts your logo permanently into metal, acrylic and wood for a crisp, tactile mark that never rubs off or wears away with handling.",
  },
]

export default function PhotoLightbox({ item, description, index, total, onClose, onPrev, onNext }) {
  // Which customization chip is open. It deliberately survives paging to the
  // next photo: the answer is about the factory, not about one product, so
  // closing it under someone who just opened it would be the wrong move.
  const [openDetail, setOpenDetail] = useState(null)
  const reduce = useReducedMotion()

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
  // With one photo in the set both arrows wrap back to the photo already on
  // screen, so they are two controls that visibly do nothing. Drop them.
  const canStep = typeof total !== "number" || total > 1
  const detail = CUSTOMIZABLE.find((c) => c.label === openDetail) || null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: FADE, ease: EASE_OUT }}
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

      {canStep && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          className="absolute left-4 md:left-8 z-10 grid place-items-center h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white hover:text-primary transition-colors duration-200 cursor-pointer"
          aria-label="Previous image"
        >
          <ArrowLeft size={22} color="currentColor" />
        </button>
      )}

      <motion.div
        initial={reduce ? { scale: 1, y: 0 } : { scale: 0.96, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={reduce ? { scale: 1, y: 0 } : { scale: 0.96, y: 10 }}
        transition={reduce ? { duration: FADE, ease: EASE_OUT } : SPRING_PAGE}
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
              variants={reduce ? still : slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                reduce
                  ? { duration: FADE, ease: EASE_OUT }
                  : {
                      x: SPRING_PAGE,
                      scale: SPRING_PAGE,
                      opacity: { duration: FADE, ease: EASE_OUT },
                    }
              }
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

          <h2 className="text-[26px] md:text-[32px] font-semibold text-foreground leading-tight">
            {item.title}
          </h2>

          <div className="h-px bg-[#EBEDF3] w-full my-6" />

          <p className="text-[18px] font-normal text-foreground leading-relaxed">
            {description ||
              "Custom manufacturing is fully supported for this product. Request changes to size, shape, material thickness, colour scheme, and branding method."}
          </p>

          {/* What can be customized — chips that open to say what each one
              means. The panel has room below them, and a chip that only names
              a process leaves the reader to guess at it. */}
          <div className="mt-7">
            <p className="text-[14px] font-medium uppercase tracking-[0.04em] text-[#4B5675] mb-3">
              Fully customizable
            </p>
            <div className="flex flex-wrap gap-2">
              {CUSTOMIZABLE.map((c) => {
                const open = openDetail === c.label
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setOpenDetail(open ? null : c.label)}
                    aria-expanded={open}
                    aria-controls="lightbox-customizable-detail"
                    className={`inline-flex items-center gap-1.5 text-[14px] font-semibold rounded-full px-3 py-[6px] whitespace-nowrap transition-colors duration-200 cursor-pointer ${
                      open
                        ? "bg-primary text-primary-foreground"
                        : "bg-primary/10 text-primary hover:bg-primary/20"
                    }`}
                  >
                    <c.icon size={16} color="currentColor" variant="Bulk" aria-hidden="true" />
                    {c.label}
                  </button>
                )
              })}
            </div>

            <div id="lightbox-customizable-detail" aria-live="polite">
              <AnimatePresence initial={false} mode="wait">
                {detail && (
                  <motion.p
                    key={detail.label}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: FADE, ease: EASE_OUT }}
                    className="overflow-hidden text-[16px] font-normal text-[#4B5675] leading-relaxed"
                  >
                    <span className="block pt-4">{detail.detail}</span>
                  </motion.p>
                )}
              </AnimatePresence>
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

      {canStep && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onNext() }}
          className="absolute right-4 md:right-8 z-10 grid place-items-center h-12 w-12 rounded-full bg-white/20 text-white hover:bg-white hover:text-primary transition-colors duration-200 cursor-pointer"
          aria-label="Next image"
        >
          <ArrowRight size={22} color="currentColor" />
        </button>
      )}
    </motion.div>
  )
}
