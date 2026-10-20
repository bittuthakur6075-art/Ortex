import { useState } from "react"
import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight, Plus } from "../components/ui/Icons"
import { Building, Teacher, Bank, Hospital, Calendar, VolumeHigh, Heart, Shop, Flash, Building3, Slider, Setting2, Award, Truck, ShieldTick } from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, EASE, RevealWords } from "../components/ui/Section"
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
    "Custom Products for Schools, Hospitals & Corporates | Ortex",
    "Custom products for corporates, schools, universities, government departments, hospitals and event companies, manufactured in-house by Ortex Industries.",
    { path: "/industries" }
  )

  // Single-open accordion, first row expanded by default (Otto /products).
  const [openIdx, setOpenIdx] = useState(0)

  // Each sector's copy names what it actually orders, and every product it
  // lists links to that category page, so the page passes buyers (and
  // crawlers) on to the catalogue instead of ending in tags.
  const industries = [
    {
      icon: Building,
      title: "Corporate & enterprise",
      description:
        "Employee ID lanyards and card holders, metal name badges, joining kits and festive gift hampers, all printed in your exact brand colours. HR, admin and marketing teams order from one supplier on one GST invoice, so every office and every new joiner receives the same branded set.",
      links: [["Lanyards & ID holders", "/products/lanyards"], ["Corporate gifts", "/products/corporate-gifts"], ["Name badges", "/products/badges"]],
    },
    {
      icon: Teacher,
      title: "Schools & universities",
      description:
        "Examination boards and clipboards printed with the school name and crest, student ID lanyards with safety breakaways, and MDF or acrylic trophies for annual day and sports day. Built to take a full academic year of daily handling and ordered in bulk for every class.",
      links: [["Exam boards", "/products/examination-boards"], ["Student lanyards", "/products/lanyards"], ["Trophies & momentos", "/products/mdf-products"]],
    },
    {
      icon: Bank,
      title: "Government & public sector",
      description:
        "Official ID cards and lanyards, department badges, flags and acrylic name plates made to the specification in your work order. Every order carries a formal GST quotation and tax invoice, which keeps purchase files and tender paperwork straightforward.",
      links: [["ID cards & lanyards", "/products/lanyards"], ["Badges", "/products/badges"], ["Flags & banners", "/products/flags-banners"]],
    },
    {
      icon: Hospital,
      title: "Hospitals & healthcare",
      description:
        "Staff lanyards with safety breakaway clasps, engraved doctor and nurse name badges on magnet backings, and clear acrylic signage and desk name holders for wards and reception. Clean, professional finishes that hold up to daily wear in clinical settings.",
      links: [["Hospital lanyards", "/products/lanyards"], ["Name badges", "/products/badges"], ["Acrylic signage", "/products/acrylic-products"]],
    },
    {
      icon: Calendar,
      title: "Events & exhibitions",
      description:
        "Conference lanyards, visitor and delegate passes, button badges and branded giveaways, produced in volume to your attendee count and dispatched to the venue city. Send the event date with your enquiry and we plan production around it.",
      links: [["Event lanyards", "/products/lanyards"], ["Promotional merchandise", "/products/promotional-merchandise"], ["Keychains", "/products/keychains"]],
    },
    {
      icon: VolumeHigh,
      title: "Agencies & resellers",
      description:
        "White-label keychains, magnets, lanyards and gift sets that you sell under your own brand. We make them factory-direct with no middleman margin, pack them plain or in your branding, and ship to you or straight to your client.",
      links: [["OEM & white label", "/oem"], ["Keychains", "/products/keychains"], ["Fridge magnets", "/products/fridge-magnets"]],
    },
    {
      icon: Heart,
      title: "NGOs & non-profits",
      description:
        "Volunteer ID lanyards, campaign badges, donation boxes and fundraising merchandise at minimum order quantities that suit a smaller campaign, quoted with GST so your accounts stay clean for donors and audits.",
      links: [["Volunteer lanyards", "/products/lanyards"], ["Badges", "/products/badges"], ["Acrylic donation boxes", "/products/acrylic-products"]],
    },
    {
      icon: Shop,
      title: "Retail & consumer brands",
      description:
        "Staff name badges, showroom key holders, acrylic standees and brochure holders for the counter, plus fridge magnets and keychains to hand to customers. Finished to match your store design and your brand colours.",
      links: [["Acrylic standees", "/products/acrylic-products"], ["Showroom key holders", "/products/mdf-products"], ["Fridge magnets", "/products/fridge-magnets"]],
    },
    {
      icon: Flash,
      title: "Startups & SMEs",
      description:
        "The branded basics a growing team needs, in small runs: ID lanyards, welcome kits, custom wall clocks and diary and pen sets. You get factory pricing from the first order, with a free digital mockup before anything goes into production.",
      links: [["Welcome kits & gifts", "/products/corporate-gifts"], ["Wall clocks", "/products/wall-clocks"], ["Lanyards", "/products/lanyards"]],
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
      <PageHero title="Custom products for every industry" nowrap>
        Lanyards, ID cards, badges, exam boards, trophies and corporate gifts, made in-house for corporates, schools, hospitals, government offices and event organisers across India.
      </PageHero>

      {/* Industry cards grid (onething 3-column pattern) */}
      <section className="pt-[88px] sm:pt-[112px] lg:pt-[150px] pb-[72px] sm:pb-[96px] lg:pb-[140px] bg-[#f9fbfc]">
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

                  {/* Expanded content. Every row stays in the HTML (collapsed to zero
                      height and inert when closed) so each sector's copy and links
                      are in the prerendered page, not only the open one. */}
                  <motion.div
                    initial={false}
                    animate={isOpen ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                    className="overflow-hidden"
                    inert={!isOpen}
                  >
                    <div className="pb-12 flex flex-col lg:flex-row gap-10">
                      {/* Three production photos */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-[10px] lg:w-1/2 flex-shrink-0">
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
                              {item.links.map(([label, to]) => (
                                <Link
                                  key={label}
                                  to={to}
                                  className="text-[12px] font-semibold text-primary bg-primary/10 rounded-full px-3 py-[6px] whitespace-nowrap transition-colors hover:bg-primary hover:text-primary-foreground"
                                >
                                  {label}
                                </Link>
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
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Expertise Section — home "Finishing" numbered-grid design */}
      <section className="section-y bg-background text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Why choose us
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
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
        title="One supplier. Your whole sector, covered."
        primary={{ to: "/contact", label: "Get in touch" }}
        secondary={{ to: "/products", label: "Browse products" }}
      >
        Tell us your industry and volumes. We will spec the right products, materials, and branding for your
        organisation.
      </PageCTA>
    </>
  )
}
