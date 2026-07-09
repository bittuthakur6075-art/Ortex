import { motion } from "framer-motion"
import { steps } from "../../constants/home"
import { Section, SectionHeading, fadeUp } from "./Section"

export default function Process() {
  return (
    <Section tone="secondary">
      <div className="lp-wrap">
        <SectionHeading eyebrow="Workflow process" title="From artwork to loading dock">
          A fixed intake-and-proofing pipeline, so the batch you receive matches the vector file you sent.
        </SectionHeading>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 list-none">
          {steps.map((step, idx) => (
            <motion.li
              key={step.title}
              {...fadeUp}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="bg-card rounded-[24px] p-8 shadow-lg text-left relative overflow-hidden border border-border/5 group"
            >
              <div
                aria-hidden="true"
                className="absolute top-4 right-6 text-[54px] font-bold text-primary/10 select-none leading-none pointer-events-none group-hover:text-primary/20 transition-colors duration-300"
              >
                0{idx + 1}
              </div>

              <div className="mb-6 text-primary flex items-center">
                <step.icon size={30} color="currentColor" variant="Bulk" aria-hidden="true" />
              </div>

              <h3 className="text-[20px] font-semibold mb-3 text-foreground">{step.title}</h3>
              <p className="text-[14px] font-normal text-muted-foreground leading-relaxed">{step.description}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </Section>
  )
}
