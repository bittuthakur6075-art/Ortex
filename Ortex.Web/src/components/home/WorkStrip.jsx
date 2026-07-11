import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "iconsax-react"
import { getDailyPhotos } from "../../constants/home"
import { Section, SectionHeading, fadeUp, EASE } from "./Section"

/**
 * The previous copy read "a real-time window into our manufacturing floor,
 * showcasing custom orders completed and packed for delivery today." Nothing
 * here is real-time — getDailyPhotos() shuffles a fixed archive once a day.
 * The copy now says what the section actually does.
 */
export default function WorkStrip() {
  const dailyPhotos = getDailyPhotos()

  return (
    <Section>
      <div className="lp-wrap">
        <SectionHeading eyebrow="Our work" title="Product we have actually shipped">
          A selection from our production archive, rotating daily. Every photograph is of a real order we
          manufactured — no stock imagery.
        </SectionHeading>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {dailyPhotos.map((item, idx) => (
            <motion.div
              key={item.title + idx}
              {...fadeUp}
              transition={{ duration: 0.6, ease: EASE, delay: Math.min(idx, 3) * 0.08 }}
              className="group overflow-hidden premium-card interactive-glow hover:-translate-y-1.5 transition-transform duration-300"
            >
              <div className="aspect-square overflow-hidden bg-muted">
                <img
                  src={item.image}
                  alt={item.alt}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-foreground line-clamp-1">{item.title}</h3>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/work"
            className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
          >
            Browse our full work gallery
            <ArrowRight size={16} color="currentColor" className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Section>
  )
}
