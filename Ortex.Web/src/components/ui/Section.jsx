import { motion } from "framer-motion"

/**
 * Otto-style ease-out (easeOutQuint). Gives reveals a fast start that settles
 * softly, which reads more premium than the browser default ease. Reused across
 * every section so the whole page shares one motion signature.
 */
export const EASE = [0.22, 1, 0.36, 1]

/**
 * The reveal now blurs up (opacity + rise + de-blur) instead of a plain fade,
 * and fires a touch before the element is fully in view (`margin`). Call sites
 * that pass their own `transition` for stagger delay must spread `EASE` in so
 * they keep the shared curve.
 */
export const fadeUp = {
  initial: { opacity: 0, y: 28, filter: "blur(8px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: EASE },
}

/**
 * Masked word reveal, the onething.design line-mask technique done per-word so
 * it stays robust in React without measuring rendered line breaks. Each word
 * sits in an overflow-hidden clip and rises into view, staggered. The full text
 * is exposed to assistive tech via aria-label while the animated words are
 * hidden. Falls back to plain rendering when `text` isn't a string.
 */
export function RevealWords({ text, className = "" }) {
  if (typeof text !== "string") return <span className={className}>{text}</span>
  const words = text.split(" ")
  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]">
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            whileInView={{ y: "0%" }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: EASE, delay: i * 0.06 }}
            aria-hidden="true"
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

/**
 * Section headings were hardcoded at text-[54px], which overflowed on narrow
 * viewports. The scale now steps 32 → 42 → 54 across breakpoints.
 */
export function SectionHeading({ eyebrow, title, children, align = "center", titleClassName = "" }) {
  const alignment = align === "left" ? "text-left" : "text-center mx-auto"
  return (
    <motion.div
      {...fadeUp}
      transition={{ duration: 0.6, ease: EASE }}
      className={`mb-[50px] ${align === "left" ? "" : "max-w-3xl"} ${alignment}`}
    >
      {eyebrow && (
        <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
          {eyebrow}
        </span>
      )}
      <h2 className={`text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-6 text-foreground text-balance ${titleClassName}`}>
        <RevealWords text={title} />
      </h2>
      {children && (
        <p className="text-[18px] font-normal text-foreground">{children}</p>
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
    <section className={`section-y ${bg} ${className}`} {...rest}>
      {children}
    </section>
  )
}
