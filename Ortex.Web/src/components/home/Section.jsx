import { motion } from "framer-motion"

export const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
}

/**
 * Section headings were hardcoded at text-[54px], which overflowed on narrow
 * viewports. The scale now steps 32 → 42 → 54 across breakpoints.
 */
export function SectionHeading({ eyebrow, title, children, align = "center" }) {
  const alignment = align === "left" ? "text-left" : "text-center mx-auto"
  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.5 }}
      className={`mb-[50px] ${align === "left" ? "" : "max-w-2xl"} ${alignment}`}
    >
      {eyebrow && (
        <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">
          {eyebrow}
        </span>
      )}
      <h2 className="text-[32px] md:text-[42px] lg:text-[54px] font-medium leading-tight mb-4 text-foreground text-balance">
        {title}
      </h2>
      {children && (
        <p className="text-[16px] font-normal text-muted-foreground">{children}</p>
      )}
    </motion.div>
  )
}

/**
 * Alternates background between `background` and `secondary` so callers stop
 * hand-threading the tone through every section.
 */
export function Section({ tone = "background", className = "", children, ...rest }) {
  const bg = tone === "secondary" ? "bg-secondary" : tone === "primary" ? "bg-primary text-primary-foreground" : "bg-background"
  return (
    <section className={`py-20 ${bg} ${className}`} {...rest}>
      {children}
    </section>
  )
}
