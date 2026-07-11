import { motion } from "framer-motion"
import { fadeUp } from "../home/Section"

/**
 * Shared page hero, matching the Products page: 150px vertical padding on a
 * white background, centered, an 82px medium title and a 20px subhead. Used on
 * every marketing page except the home page (which has its own full-bleed hero).
 * Titles wrap with text-balance rather than a hard nowrap, since page titles
 * vary in length.
 */
export default function PageHero({ title, children, actions, nowrap = false }) {
  return (
    <section className="py-[150px] bg-background">
      <div className="lp-wrap text-center">
        <motion.div {...fadeUp} className={`mx-auto ${nowrap ? "max-w-none" : "max-w-3xl"}`}>
          <h1 className={`text-[48px] md:text-[82px] font-medium leading-[1.05] mb-8 tracking-tight text-foreground ${nowrap ? "whitespace-nowrap" : "text-balance"}`}>
            {title}
          </h1>
          {children && (
            <p className="text-[20px] font-normal text-foreground leading-relaxed max-w-2xl mx-auto">
              {children}
            </p>
          )}
          {actions && (
            <div className="mt-10 flex flex-wrap justify-center gap-2">{actions}</div>
          )}
        </motion.div>
      </div>
    </section>
  )
}
