import { motion } from "framer-motion"
import { founderNote, hasFounderNote } from "../../constants/founder"
import { Section } from "./Section"

/**
 * Renders nothing until a real note is written. See constants/founder.js —
 * the section is deliberately absent rather than filled with placeholder copy,
 * because a generic founder's note is worse than no founder's note.
 */
export default function FounderNote() {
  if (!hasFounderNote()) return null

  const paragraphs = founderNote.body.trim().split(/\n{2,}/)

  return (
    <Section>
      <div className="lp-wrap">
        <motion.figure
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center"
        >
          <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-6">
            A note from our founder
          </span>

          {founderNote.portrait && (
            <img
              src={founderNote.portrait}
              alt={founderNote.name}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-8 shadow-lg"
              loading="lazy"
              decoding="async"
            />
          )}

          <blockquote className="space-y-5">
            {paragraphs.map((para, idx) => (
              <p
                key={idx}
                className={
                  idx === 0
                    ? "text-[22px] md:text-[26px] font-medium leading-snug text-foreground text-balance"
                    : "text-[16px] text-muted-foreground leading-relaxed"
                }
              >
                {para}
              </p>
            ))}
          </blockquote>

          <figcaption className="mt-10">
            <span className="block font-semibold text-foreground">{founderNote.name}</span>
            {founderNote.title && (
              <span className="block text-sm text-muted-foreground mt-0.5">{founderNote.title}</span>
            )}
          </figcaption>
        </motion.figure>
      </div>
    </Section>
  )
}
