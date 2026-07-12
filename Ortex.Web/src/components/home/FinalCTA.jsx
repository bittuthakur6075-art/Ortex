import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { fadeUp, EASE } from "./Section"

export default function FinalCTA() {
  return (
    <section className="py-[80px] bg-primary text-primary-foreground">
      <div className="lp-wrap">
        <motion.div
          {...fadeUp}
          transition={{ duration: 0.7, ease: EASE }}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-10"
        >
          <div className="lg:max-w-2xl">
            <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight mb-4 text-balance text-primary-foreground">
              Your brand. Our floor. One order away.
            </h2>
            <p className="text-[16px] font-normal max-w-2xl text-primary-foreground/90">
              Get a volume-tiered quote with a clear GST breakdown in minutes. Factory-direct pricing, no
              middleman markup.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-none">
            <Link
              to="/quote"
              className="w-full sm:w-[200px] px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-full inline-flex items-center justify-center transition-all duration-200 active:scale-[0.98]"
            >
              Get a quote
            </Link>
            <Link
              to="/contact"
              className="w-full sm:w-[200px] px-6 py-3 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-full inline-flex items-center justify-center transition-all duration-200 active:scale-[0.98]"
            >
              Contact us
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
