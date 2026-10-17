import { motion } from "framer-motion"
import { ChevronDown } from "../../components/ui/Icons"
import { SectionHeading, fadeUp } from "../../components/ui/Section"
import { FAQ } from "../../constants/content"

/**
 * Common questions before a quote. <details> keeps every answer in the DOM
 * when collapsed, so crawlers read them and they match the FAQPage JSON-LD
 * that prerender.mjs writes for /contact.
 */
export default function ContactFAQ() {
  return (
    <section className="section-y bg-secondary">
      <div className="lp-wrap max-w-4xl">
        <SectionHeading eyebrow="Before you ask" title="Frequently asked questions">
          Quick answers on minimums, timelines, artwork and invoicing.
        </SectionHeading>
        <motion.div {...fadeUp} className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details key={item.q} className="group bg-background px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-[18px] font-semibold text-foreground">
                <h3 className="text-[18px] font-semibold">{item.q}</h3>
                <ChevronDown className="h-5 w-5 flex-none text-primary transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-[16px] text-[#4b5675] leading-relaxed">{item.a}</p>
            </details>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
