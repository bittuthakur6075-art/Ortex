import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "../../components/ui/Icons"
import { fadeUp } from "../../components/ui/Section"

const steps = [
  { title: "Pick product and material", description: "Choose from MDF, acrylic, lanyards, badges, and more." },
  { title: "Set size and quantity", description: "Enter your dimensions and how many units you need." },
  { title: "See instant pricing", description: "Get volume-tiered, factory-direct pricing on the spot." },
]

/** "Have your specs ready?" full-width image banner with the three-step dark card attached (OEM style). */
export default function QuoteBanner() {
  return (
    <section className="section-y bg-[#f9fbfc]">
      <div className="px-4 sm:px-6 lg:px-[50px]">
        <div className="relative aspect-[4/2] overflow-hidden">
          <img
            src="/img/contact-products.avif"
            alt="Custom lanyards, acrylic keychains, badges and MDF items made by Ortex Industries"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
          <div className="absolute inset-0 flex items-end">
            <motion.div {...fadeUp} className="w-full p-8 md:p-14">
              <span className="block text-[14px] font-semibold text-white/80 tracking-[0.22em] uppercase mb-3">
                Have your specs ready?
              </span>
              <h2 className="max-w-3xl text-[32px] md:text-[52px] font-medium leading-[1.1] tracking-tight text-white text-balance">
                Get a quote in minutes
              </h2>
              <p className="mt-5 max-w-3xl text-[16px] md:text-[18px] font-normal leading-relaxed text-white/80">
                Skip the back and forth. Pick a product, set your size and quantity, and our team sends a fast, factory-direct quotation straight to you.
              </p>
              <Link
                to="/quote"
                className="group mt-8 inline-flex items-center gap-2 px-7 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-full transition-all duration-200 active:scale-[0.98]"
              >
                Open the quote builder
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Three steps in one dark card, attached to the banner (OEM numbered-grid design) */}
        <motion.div
          {...fadeUp}
          className="bg-[#010101] p-8 md:p-12 grid grid-cols-1 md:grid-cols-3 gap-[42px]"
        >
          {steps.map((step, idx) => (
            <div key={step.title}>
              <div className="mb-8 text-[36px] font-semibold leading-none text-white/40 tabular-nums">
                0{idx + 1}
              </div>
              <h3 className="text-[24px] font-medium text-white">{step.title}</h3>
              <div className="mt-6 h-px bg-white/20" />
              <p className="mt-6 text-[16px] font-normal text-white/60 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
