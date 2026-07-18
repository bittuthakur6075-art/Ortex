import { motion } from "framer-motion"
import { steps } from "../../constants/home"
import { Section, SectionHeading, fadeUp, EASE } from "./Section"

export default function Process() {
  return (
    <Section>
      <div className="lp-wrap">
        <SectionHeading eyebrow="Workflow process" title="How we make your order">
          Every job follows the same four steps, from the file you upload to the boxes that reach your dock, so
          what you approve is exactly what ships.
        </SectionHeading>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[42px] list-none">
          {steps.map((step, idx) => (
            <motion.li
              key={step.title}
              {...fadeUp}
              transition={{ duration: 0.6, ease: EASE, delay: idx * 0.1 }}
              className="text-left relative overflow-hidden group"
            >
              <div className="mb-8 text-[36px] font-semibold leading-none text-primary/50 tabular-nums">
                0{idx + 1}
              </div>

              <h3 className="text-[20px] md:text-[24px] font-medium text-foreground">{step.title}</h3>
              <div className="mt-6 border-t border-primary/40" />
              <p className="mt-6 text-[16px] font-normal text-foreground leading-relaxed line-clamp-2">{step.description}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </Section>
  )
}
