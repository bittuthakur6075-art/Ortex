import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "iconsax-react"
import { capabilities } from "../../constants/home"
import { Section } from "./Section"

/**
 * Replaces the former "Factory Scale. Millimeter Precision." and "Built for B2B
 * Scale & Precision" sections, which made the same claim twice on one page.
 */
export default function Capabilities() {
  return (
    <Section tone="secondary">
      <div className="lp-wrap">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">
              Production standards
            </span>
            <h2 className="text-[32px] md:text-[42px] lg:text-[54px] font-medium leading-tight mb-6 text-foreground text-balance">
              Factory scale, millimetre precision
            </h2>
            <p className="text-[16px] text-muted-foreground leading-relaxed mb-10">
              Every stage — routing, printing, assembly, packing — happens under one roof, so the tolerance
              you approve is the tolerance you receive.
            </p>

            <div className="space-y-7">
              {capabilities.map((item) => (
                <div key={item.title} className="flex gap-4 items-start">
                  <div className="flex-shrink-0 text-primary mt-1">
                    <item.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-[18px] md:text-[20px] font-semibold mb-1.5 text-foreground">{item.title}</h3>
                    <p className="text-[15px] md:text-[16px] font-normal text-muted-foreground leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              to="/about"
              className="mt-10 px-5 py-2.5 border-2 border-border hover:bg-muted font-medium rounded-lg inline-flex items-center transition-all duration-200 active:scale-[0.98] text-foreground"
            >
              Learn more about us
              <ArrowRight size={16} color="currentColor" className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative lg:sticky lg:top-28"
          >
            <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl bg-white premium-card">
              <img
                src="/img/factory-production-workshop.jpg"
                alt="In-house manufacturing workshop with flatbed UV printing and CNC laser cutting at Ortex Industries"
                className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                loading="lazy"
                decoding="async"
              />
            </div>
          </motion.div>

        </div>
      </div>
    </Section>
  )
}
