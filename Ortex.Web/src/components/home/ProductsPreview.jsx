import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "iconsax-react"
import { featuredProducts } from "../../constants/home"
import { Section, SectionHeading, fadeUp } from "./Section"

export default function ProductsPreview() {
  return (
    <Section className="overflow-hidden">
      <div className="lp-wrap">
        <SectionHeading eyebrow="Product catalog" title="What we manufacture">
          From custom keychains and breakaway lanyards to rigid examination boards — every item is produced
          in-house, to your artwork, at wholesale volume.
        </SectionHeading>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredProducts.map((item, idx) => (
            <motion.div
              key={item.title}
              {...fadeUp}
              transition={{ duration: 0.4, delay: Math.min(idx, 3) * 0.06 }}
              className="bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300 text-left"
            >
              <div className="flex items-center mb-4 text-primary">
                <item.icon size={30} color="currentColor" variant="Bulk" aria-hidden="true" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-card-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/products"
            className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
          >
            Explore all products &amp; services
            <ArrowRight size={16} color="currentColor" className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Section>
  )
}
