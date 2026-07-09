import { Link } from "react-router-dom"
import { ArrowRight } from "iconsax-react"
import { featuredIndustries } from "../../constants/home"
import { Section, SectionHeading } from "./Section"

export default function IndustriesPreview() {
  return (
    <Section className="overflow-hidden">
      <div className="lp-wrap">
        <SectionHeading eyebrow="Sectors served" title="Built for how your sector buys">
          Compliance requirements, procurement cycles, and identity standards differ by sector. We work to
          the ones that apply to yours.
        </SectionHeading>
      </div>

      <div className="marquee-container py-4">
        <div className="animate-marquee flex gap-6">
          {[...featuredIndustries, ...featuredIndustries].map((item, idx) => (
            <div
              key={`${item.title}-${idx}`}
              aria-hidden={idx >= featuredIndustries.length}
              className="w-[180px] sm:w-[220px] flex-shrink-0 flex flex-col items-center text-center p-6 premium-card interactive-glow"
            >
              <div className="flex items-center mb-3 text-primary">
                <item.icon size={30} color="currentColor" variant="Bulk" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-card-foreground">{item.title}</h3>
            </div>
          ))}
        </div>
      </div>

      <div className="lp-wrap">
        <div className="text-center mt-12">
          <Link
            to="/industries"
            className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
          >
            See all industries we serve
            <ArrowRight size={16} color="currentColor" className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Section>
  )
}
