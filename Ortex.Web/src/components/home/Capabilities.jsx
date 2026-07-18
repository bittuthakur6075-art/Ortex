import { motion } from "framer-motion"
import { capabilities, testimonials } from "../../constants/home"
import { EASE } from "./Section"

/**
 * Otto "Our Core Values" clone for Production standards. The left column
 * (heading, testimonial, CTA) is sticky. The right column is a set of
 * sticky-stacking cards: each card pins near the top of the viewport and the
 * next card scrolls up and stacks over it, leaving a sliver of the card beneath
 * visible (increasing top offset per card). Degrades to a plain stack on mobile.
 */

// One production/process photo per capability, ordered to match `capabilities`:
// in-house manufacturing, unlimited customization, factory-direct pricing,
// prepress proofing.
const rowImages = [
  "/img/build-manufacturing.avif",
  "/img/build-customization.avif",
  "/img/build-pricing.avif",
  "/img/build-proofing.avif",
]

const featured = testimonials[0]
const initials = featured.author
  .split(" ")
  .filter(Boolean)
  .map((n) => n[0])
  .join("")
  .substring(0, 2)
  .toUpperCase()

function Stars() {
  return (
    <div className="flex gap-1 text-[#f5b301]" aria-label="5 out of 5 stars">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 7.1-1.01z" />
        </svg>
      ))}
    </div>
  )
}

function StackCard({ index, title, description, image }) {
  return (
    <div
      className="lg:sticky bg-[#0b0b0d] ring-1 ring-white/10 p-[30px]"
      style={{ top: `calc(7rem + ${index * 16}px)` }}
    >
      <div className="flex items-baseline gap-5">
        <span className="flex-none text-[18px] font-medium tracking-[0.3em] text-white tabular-nums">
          0{index + 1}
        </span>
        <span className="text-[20px] md:text-[24px] font-semibold leading-tight text-white">{title}</span>
      </div>
      <div className="overflow-hidden mt-7">
        <img src={image} alt={title} loading="lazy" className="aspect-[4/2] w-full object-cover" />
      </div>
      <p className="mt-7 text-[16px] font-normal leading-relaxed text-white">{description}</p>
    </div>
  )
}

export default function Capabilities() {
  return (
    <section className="relative section-y bg-white text-neutral-900">
      <div className="relative z-10 lp-wrap">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-14 items-start">

          {/* Left: sticky heading + testimonial block. Sticky lives on a plain
              wrapper; the motion reveal is nested so its inline styles don't
              interfere with stickiness. */}
          <div className="lg:sticky lg:top-28 self-start">
          <motion.div
            initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <span className="block text-[14px] font-semibold uppercase tracking-[0.22em] text-primary mb-3">
              How we build
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-neutral-900">
              Precision, built at scale
            </h2>
            <p className="mt-8 text-[18px] font-normal leading-relaxed text-neutral-900">
              From first proof to final carton, your whole order stays on our own floor. One team owns the cut,
              the print, and the pack, so the finish matches exactly what you approved.
            </p>

            <div className="mt-10">
              <Stars />
              <blockquote className="mt-4 text-[17px] md:text-[18px] font-semibold text-neutral-900">
                &ldquo;{featured.quote}&rdquo;
              </blockquote>

              <figcaption className="mt-6 flex items-center gap-3">
                <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
                  {initials}
                </span>
                <span className="leading-tight">
                  <span className="block text-[15px] font-medium text-neutral-900">{featured.author}</span>
                  <span className="block text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                    {featured.location} · {featured.product}
                  </span>
                </span>
              </figcaption>
            </div>
          </motion.div>
          </div>

          {/* Right: sticky-stacking cards */}
          <div className="flex flex-col gap-6 lg:pb-[30vh]">
            {capabilities.map((item, idx) => (
              <StackCard
                key={item.title}
                index={idx}
                title={item.title}
                description={item.description}
                image={rowImages[idx]}
              />
            ))}
          </div>

        </div>
      </div>
    </section>
  )
}
