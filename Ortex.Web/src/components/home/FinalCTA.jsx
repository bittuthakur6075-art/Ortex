import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "iconsax-react"
import { fadeUp } from "./Section"

export default function FinalCTA() {
  return (
    <section className="py-20 bg-primary text-primary-foreground">
      <div className="lp-wrap text-center">
        <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
          <span className="block text-[14px] font-medium text-primary-foreground/80 tracking-[0.1em] uppercase mb-1">
            Get started
          </span>
          <h2 className="text-[32px] md:text-[42px] lg:text-[54px] font-medium leading-tight mb-4 text-balance text-primary-foreground">
            Ready to secure your production run?
          </h2>
          <p className="text-[16px] font-normal mb-8 max-w-2xl mx-auto text-primary-foreground/90">
            Get a transparent, volume-discounted quotation with a full GST breakdown. Talk directly to our
            manufacturing engineers.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/quote"
              className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              Get a quote
              <ArrowRight size={20} color="currentColor" className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              to="/contact"
              className="px-6 py-3 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              Contact us
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
