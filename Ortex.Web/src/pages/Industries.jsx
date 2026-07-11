import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight, Plus } from "lucide-react"
import { Building, Teacher, Bank, Hospital, Calendar, VolumeHigh, Heart, Shop, Flash, Building3, Slider, Setting2, Award, Truck, ShieldTick } from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, EASE, RevealWords } from "../components/home/Section"
import { workPhotos } from "../constants/home"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"

/** Three real production photos per row, cycling the shared pool with wrap. */
function rowPhotos(idx) {
  return Array.from({ length: 3 }, (_, k) => workPhotos[(idx * 3 + k) % workPhotos.length])
}

/**
 * Industries page, laid out after onething.design/industries: a typographic
 * hero, then a clean 3-column grid of industry cards. Each card carries a bold
 * name, a short tagline, a footer row of the products that sector orders most,
 * and a "Explore products" arrow link that slides on hover. We swap onething's
 * fabricated project/client/rating metrics for real product tags, so nothing on
 * the page is invented.
 */
export default function Industries() {
  useDocumentMetadata(
    "Industries We Serve - Ortex Industries | Corporate, Education, Healthcare & More",
    "Ortex Industries serves diverse sectors including corporate organizations, educational institutions, government departments, hospitals, event management, and more with customized products.",
    { path: "/industries" }
  )

  // Single-open accordion, first row expanded by default (Otto /products).
  const [openIdx, setOpenIdx] = useState(0)

  const industries = [
    {
      icon: Building,
      title: "Corporate & enterprise",
      description: "Staff identity, awards, and gifting kept on one brand across every office, desk, and team-wide rollout.",
      tags: ["ID cards", "Lanyards", "Gifts"],
    },
    {
      icon: Teacher,
      title: "Schools & universities",
      description: "Student cards and exam hardware built tough enough to take a full academic year of daily handling.",
      tags: ["Student IDs", "Exam boards", "Nameplates"],
    },
    {
      icon: Bank,
      title: "Government & public sector",
      description: "Official IDs and signage made to standard specs, invoiced GST-clean for straightforward tender procurement.",
      tags: ["Official IDs", "Badges", "Signage"],
    },
    {
      icon: Hospital,
      title: "Hospitals & healthcare",
      description: "Staff and patient identification with clean, hygienic, professionally finished branding for clinical settings.",
      tags: ["Staff IDs", "Badges", "Signage"],
    },
    {
      icon: Calendar,
      title: "Events & exhibitions",
      description: "Passes, badges, and branded merchandise turned around fast and scaled to whatever your attendee count is.",
      tags: ["Passes", "Lanyards", "Merch"],
    },
    {
      icon: VolumeHigh,
      title: "Agencies & resellers",
      description: "White-label products you resell under your own brand, made factory-direct with no middleman markup added.",
      tags: ["Promo", "Gifting", "OEM runs"],
    },
    {
      icon: Heart,
      title: "NGOs & non-profits",
      description: "Affordable volunteer identity and fundraising merchandise at order minimums that suit a smaller campaign.",
      tags: ["Volunteer IDs", "Lanyards", "Merch"],
    },
    {
      icon: Shop,
      title: "Retail & consumer brands",
      description: "Staff badges, packaging add-ons, and loyalty pieces finished to sit right alongside your storefront look.",
      tags: ["Badges", "Packaging", "Loyalty"],
    },
    {
      icon: Flash,
      title: "Startups & SMEs",
      description: "Low-minimum runs of the branded basics a growing team needs, priced straight off the factory floor.",
      tags: ["IDs", "Gifts", "Signage"],
    },
  ]

  const expertise = [
    {
      icon: Building3,
      title: "In-house production",
      description: "Every stage stays under our own roof, from raw sheet to cutting, printing, assembly, and final pack, so quality holds to one standard.",
    },
    {
      icon: ShieldTick,
      title: "Built to sector standards",
      description: "We build to the specs your industry works to, with durable, standards-grade materials and clean GST-compliant procurement.",
    },
    {
      icon: Slider,
      title: "Unlimited customization",
      description: "Send your vector artwork and we match Pantone shades across custom shapes, sheet thicknesses, and surface finishes exactly.",
    },
    {
      icon: Setting2,
      title: "Prepress proofing",
      description: "We check your dimensions and layout before cutting and send a virtual mockup to approve, so mistakes are caught on screen.",
    },
    {
      icon: Award,
      title: "Factory-direct pricing",
      description: "You buy straight from the factory floor with volume-tiered pricing and no trading-agent markup added along the way.",
    },
    {
      icon: Truck,
      title: "PAN India + export delivery",
      description: "Orders are bulk-packed and dispatched by courier with full tracking, across India and worldwide for export buyers.",
    },
  ]

  return (
    <>
      {/* Page Header */}
      <PageHero title="Built for every industry" nowrap>
        Discover our versatile expertise, delivering customized product solutions for every sector, each to the standards it works to.
      </PageHero>

      {/* Industry cards grid (onething 3-column pattern) */}
      <section className="pt-[150px] pb-[140px] bg-[#f9fbfc]">
        <div className="lp-wrap">
          {/* Section intro: heading left, supporting copy right */}
          <motion.div
            {...fadeUp}
            className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between mb-14"
          >
            <div className="max-w-2xl">
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Who we serve
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Sectors we specialize in" />
              </h2>
            </div>
            <p className="text-[18px] font-normal text-foreground leading-relaxed max-w-sm lg:text-right">
              Every sector buys differently. We build to the standard yours works to.
            </p>
          </motion.div>

          {/* Otto /products accordion */}
          <div>
            {industries.map((item, idx) => {
              const isOpen = openIdx === idx
              const photos = rowPhotos(idx)
              return (
                <div key={item.title} className="border-t border-border first:border-t-0 last:border-b">
                  {/* Row header: number, title, circular toggle */}
                  <button
                    type="button"
                    onClick={() => setOpenIdx(isOpen ? -1 : idx)}
                    aria-expanded={isOpen}
                    className="w-full text-left flex items-start justify-between gap-6 pt-7 pb-8 group"
                  >
                    <div>
                      <span className="block text-[13px] font-medium text-muted-foreground tabular-nums tracking-[0.35em] mb-4">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-[32px] md:text-[48px] font-normal leading-[1.02] tracking-tight text-foreground">
                        {item.title}
                      </h3>
                    </div>
                    <span className="mt-1 flex-shrink-0 w-[54px] h-[54px] rounded-full border border-border grid place-items-center text-foreground transition-colors group-hover:border-primary group-hover:text-primary">
                      <Plus
                        className={`h-5 w-5 transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
                      />
                    </span>
                  </button>

                  {/* Expanded content */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.5, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="pb-12 flex flex-col lg:flex-row gap-10">
                          {/* Three production photos */}
                          <div className="grid grid-cols-3 gap-[10px] lg:w-1/2 flex-shrink-0">
                            {photos.map((p, k) => (
                              <div key={k} className="aspect-square overflow-hidden bg-secondary">
                                <img
                                  src={p.image}
                                  alt={p.alt || p.title}
                                  loading="lazy"
                                  decoding="async"
                                  className="w-full h-full object-cover transition-transform duration-[900ms] ease-out hover:scale-[1.06]"
                                />
                              </div>
                            ))}
                          </div>

                          {/* Description + tags + request-a-quote */}
                          <div className="lg:w-1/2 flex flex-col">
                            <p className="text-[18px] font-normal text-[#4b5675] leading-relaxed max-w-md">
                              {item.description}
                            </p>
                            <div className="mt-auto pt-10 flex flex-wrap items-end justify-between gap-6">
                              <div>
                                <span className="block text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
                                  What they order
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {item.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[12px] font-semibold text-primary bg-primary/10 rounded-full px-3 py-[6px] whitespace-nowrap"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <Link
                                to="/quote"
                                className="group/link inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-foreground transition-colors hover:text-primary whitespace-nowrap"
                              >
                                Request a quote
                                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover/link:translate-x-1" />
                              </Link>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Expertise Section — home "Finishing" numbered-grid design */}
      <section className="py-[140px] bg-background text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Why choose us
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground whitespace-nowrap">
              <RevealWords text="Everything under one roof" />
            </h2>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-[42px] gap-y-[80px] list-none">
            {expertise.map((item, idx) => (
              <motion.li
                key={item.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 w-[50px] h-[50px] rounded-[999px] bg-primary/10 flex items-center justify-center text-primary">
                  <item.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] font-medium text-foreground">{item.title}</h3>
                <div className="mt-6 border-t border-primary/20" />
                <p className="mt-6 text-[16px] font-normal text-foreground leading-relaxed line-clamp-3">
                  {item.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Call to Action Section */}
      <PageCTA
        title="Solutions built for your sector"
        primary={{ to: "/contact", label: "Get in touch" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        Tell us about your industry and requirements, and we will recommend the right products, materials, and branding for your organisation.
      </PageCTA>
    </>
  )
}
