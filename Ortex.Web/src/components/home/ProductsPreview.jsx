import { useRef, useState } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { PRODUCT_CATEGORIES, photosForCategory, categoryStats } from "../../constants/categories"
import { fadeUp, EASE } from "./Section"

/**
 * Otto "Our Services & Products" clone: dark section, a large heading top-left,
 * and image cards with overlaid text (eyebrow + title top-left). Otto's hover:
 * - the two hero cards expand (flex-grow) while the sibling shrinks;
 * - the image slowly zooms and a CTA label slides up bottom-left;
 * - the system cursor is hidden and ONE circular arrow follows the pointer
 *   across the whole cards area, so it glides continuously from card to card
 *   instead of resetting per card.
 */

const heroCards = [
  {
    eyebrow: "Premium products",
    title: "Custom made, start to finish.",
    cta: "Browse products",
    image: "/img/products-hero.avif",
    to: "/products",
  },
  {
    eyebrow: "OEM & white-label",
    title: "Your brand, built by us.",
    cta: "Our services",
    image: "/img/hero-oem.avif",
    to: "/oem",
  },
]

const FALLBACK_IMAGE = "/img/welcome-workshop.avif"

/** Image card with overlaid text. The cursor arrow is shared at section level. */
function OverlayCard({ to, image, eyebrow, title, cta, big }) {
  return (
    <Link
      to={to}
      data-big={big ? "true" : "false"}
      className="group relative block h-full w-full overflow-hidden"
    >
      <img
        src={image}
        alt={title}
        loading="lazy"
        className="w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.2]"
      />
      {/* Darkening gradient so the top-left text stays legible */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/25 to-black/50 transition-colors duration-500 group-hover:from-black/80 group-hover:to-black/60" />

      {/* Top-left eyebrow + title */}
      <div className={`absolute inset-x-0 top-0 ${big ? "p-[30px]" : "p-[18px]"}`}>
        {eyebrow && (
          <span className="text-[10px] md:text-[12px] font-medium uppercase tracking-[0.2em] text-white/70 whitespace-nowrap">
            {eyebrow}
          </span>
        )}
        <h3
          className={`mt-2 font-medium text-white leading-snug ${
            big ? "text-[24px] whitespace-nowrap" : "text-[20px] max-w-[18ch]"
          }`}
        >
          {title}
        </h3>
      </div>

      {/* Bottom-left CTA: slides up + fades in on hover */}
      <span className={`absolute text-[11px] font-semibold uppercase tracking-[0.14em] text-white opacity-0 translate-y-3 transition-all duration-500 ease-out group-hover:opacity-100 group-hover:translate-y-0 whitespace-nowrap ${big ? "left-[30px] bottom-[30px]" : "left-[18px] bottom-[18px]"}`}>
        {cta}
      </span>
    </Link>
  )
}

export default function ProductsPreview() {
  const categories = PRODUCT_CATEGORIES.map((entry) => {
    const photo = photosForCategory(entry, 1)[0]
    return {
      slug: entry.slug,
      name: entry.name,
      category: entry.category,
      count: categoryStats(entry).count,
      image: photo?.url || FALLBACK_IMAGE,
    }
  })

  // One shared cursor arrow for the whole cards area, so it glides continuously
  // from card to card (spring-trailed) instead of a per-card reset.
  const areaRef = useRef(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springCfg = { stiffness: 350, damping: 32, mass: 0.5 }
  const sx = useSpring(x, springCfg)
  const sy = useSpring(y, springCfg)
  const [show, setShow] = useState(false)
  const [big, setBig] = useState(false)

  const point = (e) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const handleEnter = (e) => {
    const p = point(e)
    if (p) {
      // Jump to the pointer on entry so the arrow doesn't slide in from origin.
      x.jump(p.x)
      y.jump(p.y)
    }
    setShow(true)
  }

  const handleMove = (e) => {
    const p = point(e)
    if (p) {
      x.set(p.x)
      y.set(p.y)
    }
    const card = e.target.closest?.("[data-big]")
    if (card) setBig(card.dataset.big === "true")
  }

  const size = big ? 60 : 48

  return (
    <section className="py-[140px] bg-[#0b0c0e] text-white overflow-hidden">
      <div className="lp-wrap">
        {/* Heading top-left */}
        <motion.div {...fadeUp} transition={{ duration: 0.7, ease: EASE }}>
          <span className="block text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">
            Product catalog
          </span>
          <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight">
            Our services &amp; products
          </h2>
        </motion.div>

        {/* Cards area — shared cursor arrow lives here */}
        <div
          ref={areaRef}
          onMouseEnter={handleEnter}
          onMouseMove={handleMove}
          onMouseLeave={() => setShow(false)}
          className="relative mt-12 md:mt-16 cursor-none"
        >
          {/* Two hero gateway cards — expanding panels on hover */}
          <div className="flex flex-col lg:flex-row gap-[10px] lg:h-[460px]">
            {heroCards.map((card, idx) => (
              <motion.div
                key={card.eyebrow}
                {...fadeUp}
                transition={{ duration: 0.7, ease: EASE, delay: idx * 0.1 }}
                className="h-[300px] lg:h-full lg:flex-1 lg:hover:flex-[1.6] [will-change:flex-grow] transition-[flex-grow] duration-[770ms] ease-[cubic-bezier(0.76,0,0.24,1)]"
              >
                <OverlayCard
                  to={card.to}
                  image={card.image}
                  eyebrow={card.eyebrow}
                  title={card.title}
                  cta={card.cta}
                  big
                />
              </motion.div>
            ))}
          </div>

          {/* Full category grid — same overlay style */}
          <div className="mt-[10px] grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[10px]">
            {categories.map((cat, idx) => (
              <motion.div
                key={cat.slug}
                {...fadeUp}
                transition={{ duration: 0.6, ease: EASE, delay: Math.min(idx, 3) * 0.08 }}
                className="aspect-square"
              >
                <OverlayCard
                  to={`/products/${cat.slug}`}
                  image={cat.image}
                  title={cat.name}
                  cta="View products"
                />
              </motion.div>
            ))}
          </div>

          {/* Shared cursor-following arrow (spring-trailed) */}
          <motion.span
            aria-hidden="true"
            className="pointer-events-none absolute z-50 grid place-items-center rounded-full bg-primary text-primary-foreground"
            style={{ left: sx, top: sy, x: "-50%", y: "-50%" }}
            animate={{ opacity: show ? 1 : 0, scale: show ? 1 : 0.4, width: size, height: size }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <ArrowRight size={big ? 24 : 20} strokeWidth={2} />
          </motion.span>
        </div>
      </div>
    </section>
  )
}
