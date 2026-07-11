import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { fadeUp, EASE } from "./Section"

/**
 * Cloned from the Otto "Welcome" section: a two-line greeting top-left, a large
 * production image on the left with a thin vertical "ENTERING" rail beside it,
 * and a big bottom-right statement that fills in word-by-word on scroll (each
 * word rises from muted grey to solid as the section passes through view — the
 * reason Otto's screenshot catches "Excellence." still grey). Adapted to Ortex.
 */

/** One word of the scroll-linked reveal heading. */
function RevealWord({ progress, range, children }) {
  const opacity = useTransform(progress, range, [0.15, 1])
  const y = useTransform(progress, range, [8, 0])
  const filter = useTransform(progress, range, ["blur(4px)", "blur(0px)"])
  return (
    <span className="relative inline-block mr-[0.28em]">
      <motion.span style={{ opacity, y, filter }} className="inline-block">
        {children}
      </motion.span>
    </span>
  )
}

/** Splits a string into words that reveal sequentially across scroll progress. */
function RevealHeading({ text, className }) {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.35"],
  })
  const words = text.split(" ")
  return (
    <h3 ref={ref} className={className}>
      {words.map((word, i) => {
        const start = i / words.length
        const end = start + 1 / words.length
        return (
          <RevealWord key={i} progress={scrollYProgress} range={[start, end]}>
            {word}
          </RevealWord>
        )
      })}
    </h3>
  )
}

export default function Welcome() {
  return (
    <section className="py-[140px] bg-background overflow-hidden">
      <div className="lp-wrap">
        {/* Top-left greeting */}
        <motion.h2
          {...fadeUp}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-[48px] font-medium leading-[1.08] text-foreground tracking-tight"
        >
          Welcome to <span className="text-primary">Ortex Industries</span>
        </motion.h2>

        {/* Image (left) + vertical ENTERING rail + statement (right) */}
        <div className="mt-12 md:mt-[42px] grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-6 items-end">
          <motion.div
            {...fadeUp}
            transition={{ duration: 0.85, ease: EASE }}
            className="lg:col-span-6 overflow-hidden"
          >
            <motion.img
              src="/img/factory-production-workshop.jpg"
              alt="Inside the Ortex Industries production workshop"
              loading="lazy"
              initial={{ scale: 1.08 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.1, ease: EASE }}
              className="w-full h-full object-cover aspect-[16/11]"
            />
          </motion.div>

          {/* Vertical rail (hidden on small screens) */}
          <div className="hidden lg:flex lg:col-span-1 flex-col items-center justify-end gap-6 h-full pb-3">
            <span className="block w-px h-24 bg-border" aria-hidden="true" />
            <span
              className="text-[12px] font-medium uppercase tracking-[0.45em] text-muted-foreground"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              Entering
            </span>
          </div>

          {/* Scroll-reveal statement + brief, to the right of the image */}
          <div className="lg:col-span-5 lg:pb-2">
            <RevealHeading
              text="A new standard of custom manufacturing Excellence."
              className="text-[30px] md:text-[42px] lg:text-[48px] font-medium leading-[1.08] tracking-tight text-foreground"
            />
            <motion.p
              {...fadeUp}
              transition={{ duration: 0.7, ease: EASE }}
              className="mt-8 text-[18px] font-normal leading-[1.7] text-foreground"
            >
              Ortex Industries is a contract manufacturer of premium customized
              products, from MDF and acrylic items to lanyards, badges, and
              corporate gifts. Every order runs fully in house, with quality
              controlled from raw material through CNC routing, UV printing, and
              packing. We partner with brands on OEM and white-label production,
              scaling from first samples to bulk runs delivered across India and
              worldwide.
            </motion.p>
          </div>
        </div>
      </div>
    </section>
  )
}
