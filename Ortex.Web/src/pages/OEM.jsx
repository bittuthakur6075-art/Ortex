import { useRef, useEffect } from "react"
import { motion, useMotionValue } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import {
  Building3, Slider, Award, Document, Flash, Truck, Box,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"
import PageHero from "../components/ui/PageHero"

// Otto /products reveal easing: a symmetric ease-in-out at ~0.8s, opacity +
// translate only (no blur). Rise distance is tiered by element role.
const OTTO_EASE = [0.44, 0, 0.56, 1]

/**
 * OEM / white-label is a stated business line that previously had no landing
 * page — it appeared only as one bullet on /about, one FAQ answer, and a clause
 * in the hero. Buyers searching "OEM keychain manufacturer" or "private label
 * corporate gifts" had nowhere to land.
 *
 * Every claim below is one the site already substantiates elsewhere (in-house
 * production, Pantone matching, vector intake, GST invoicing, PAN-India
 * dispatch). No MOQs, lead times, or certifications are asserted here — those
 * are real commitments and must come from the business, not from copy.
 */

const propositions = [
  {
    icon: Building3,
    title: "Your brand, our factory",
    description:
      "We produce under your label, never under ours.",
  },
  {
    icon: Slider,
    title: "Made to your spec",
    description:
      "Custom cuts, finishes, and exact Pantone from your files.",
  },
  {
    icon: Award,
    title: "No middleman markup",
    description:
      "Factory-floor pricing, volume-tiered, on a formal GST bill.",
  },
  {
    icon: Box,
    title: "Single-supplier breadth",
    description:
      "MDF, acrylic, lanyards, badges, and gifts on one order.",
  },
]

const process = [
  {
    icon: Document,
    title: "Share your spec",
    description:
      "Send vector artwork (.cdr, .ai, .pdf, .dxf) with target volumes, materials, and any packaging notes.",
  },
  {
    icon: Flash,
    title: "Costing & proof",
    description:
      "Our prepress team validates your dimensions and returns a virtual mockup with volume-tiered pricing.",
  },
  {
    icon: Building3,
    title: "In-house production",
    description:
      "Printing, precision cutting, assembly, and manual quality assurance, all in-house with nothing subcontracted.",
  },
  {
    icon: Truck,
    title: "Dispatch, white-labelled",
    description:
      "Bulk-packed and shipped under your branding across India, with tracking and drop-shipping supported.",
  },
]

const suitedFor = [
  "Promotional product resellers and trading houses",
  "Corporate gifting firms with their own catalogue",
  "Brand and creative agencies producing client merch",
  "Retailers launching a private-label accessory range",
  "Event and exhibition organisers buying in bulk",
]

export default function OEM() {
  useDocumentMetadata(
    "OEM & White Label Manufacturing - Ortex Industries",
    "Contract OEM and white-label manufacturing for MDF, acrylic, lanyards, badges, and corporate merchandise. Produced in-house under your brand, with factory-direct pricing and GST invoicing.",
    { path: "/oem" }
  )

  // Otto /products image effect: translateY-only parallax, no scale. Driven off
  // a plain scroll listener (Lenis fires native scroll events) so it stays in
  // sync with the smooth scroll instead of relying on Framer's useScroll. The
  // image layer is oversized (140% tall) so the ±14% drift never exposes an edge.
  const bannerRef = useRef(null)
  const bannerY = useMotionValue("0%")

  useEffect(() => {
    const el = bannerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      // 0 as the section enters from the bottom, 1 as it leaves past the top.
      const progress = (vh - rect.top) / (vh + rect.height)
      const clamped = Math.max(0, Math.min(1, progress))
      bannerY.set(`${(clamped * 28 - 14).toFixed(2)}%`)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [bannerY])

  return (
    <div className="bg-background">

      {/* Hero */}
      <PageHero title="We make it. You brand it." nowrap>
        We are the contract factory behind other brands, making custom MDF, acrylic, lanyard, and badge lines under your own label.
      </PageHero>

      {/* Image with scroll parallax, Otto /products style, 50px side padding */}
      <section ref={bannerRef}>
        <div className="px-[50px]">
          <div className="relative h-[75vh] min-h-[520px] overflow-hidden">
            <motion.div
              style={{ y: bannerY }}
              className="absolute left-0 right-0 top-[-20%] h-[140%] will-change-transform"
            >
              <img
                src="/img/hero-oem.avif"
                alt="Laser engraving custom parts on the Ortex production floor"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </motion.div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
            <div className="absolute inset-0 flex items-end">
              <div className="w-full p-8 md:p-14">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.8, ease: OTTO_EASE }}
                  className="max-w-3xl text-[32px] md:text-[52px] font-medium leading-[1.1] tracking-tight text-white text-balance"
                >
                  From your files to finished stock, produced under your brand.
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.8, ease: OTTO_EASE, delay: 0.12 }}
                  className="mt-6 max-w-xl text-[16px] md:text-[18px] font-normal leading-relaxed text-white/80"
                >
                  One factory for MDF, acrylic, lanyards, badges, and merchandise, packed and shipped white-labelled to you or straight to your client.
                </motion.p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why OEM with us — Industries "Why choose us" numbered-grid design */}
      <section className="py-[140px] bg-background">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Why partner with us
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-6 text-foreground whitespace-nowrap">
              <RevealWords text="A factory, not a middleman" />
            </h2>
            <p className="text-[18px] font-normal text-foreground leading-relaxed">
              Most suppliers in this category quietly outsource. We route, print, assemble, and pack every order under our own roof.
            </p>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-[42px] gap-y-[80px] list-none">
            {propositions.map((item, idx) => (
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
                <p className="mt-6 text-[16px] font-normal text-foreground leading-relaxed line-clamp-2">
                  {item.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* How an OEM run works — dark numbered-grid (Otto customization design) */}
      <section className="py-[140px] bg-[#0b0c0e] text-white">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="text-center mb-[50px]">
            <span className="block text-[14px] font-semibold text-white/50 tracking-[0.22em] uppercase mb-3">
              How it runs
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-6 text-white whitespace-nowrap">
              <RevealWords text="From your spec to dispatch" />
            </h2>
            <p className="text-[18px] font-normal text-white/60 leading-relaxed max-w-2xl mx-auto">
              Every white-label order runs the same four steps under our own roof. You send the specification, we cost and proof it, produce it under your label, and dispatch it packed for you or straight to your customer.
            </p>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[42px] list-none">
            {process.map((step, idx) => (
              <motion.li
                key={step.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.08 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 text-[36px] font-semibold leading-none text-white/40 tabular-nums">
                  0{idx + 1}
                </div>
                <h3 className="text-[24px] font-medium text-white">{step.title}</h3>
                <div className="mt-6 border-t border-white/20" />
                <p className="mt-6 text-[16px] font-normal text-white/60 leading-relaxed">{step.description}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Who it suits */}
      <section className="py-[140px]">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <motion.div {...fadeUp}>
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
                Who this is for
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="You sell it, we make it" />
              </h2>

              {/* Numbered, divided audience list */}
              <ul className="mt-10">
                {suitedFor.map((item, idx) => (
                  <li
                    key={item}
                    className="flex items-center gap-5 border-t border-border py-5 last:border-b"
                  >
                    <span className="flex-shrink-0 w-10 text-[24px] font-medium text-primary tabular-nums">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[20px] font-medium text-foreground leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
              <div className="overflow-hidden">
                <img
                  src="/img/oem-floor.avif"
                  alt="Ortex Industries manufacturing floor with in-house UV printing and laser engraving"
                  loading="lazy"
                  decoding="async"
                  className="w-full aspect-[4/2] object-cover"
                />
              </div>

              <div className="bg-[#010101] text-white p-[30px]">
                <h3 className="text-[24px] font-semibold text-white mb-2">
                  Clear terms, quoted upfront
                </h3>
                <p className="text-[16px] font-normal text-white/70 mb-6 whitespace-nowrap">
                  Volumes, lead times, and pricing confirmed in writing before you commit.
                </p>
                <Link
                  to="/quote"
                  className="group inline-flex items-center gap-2 text-[16px] font-semibold text-white transition-colors hover:text-primary"
                >
                  Request OEM pricing
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <PageCTA
        title="Your label. Our line. Zero compromise."
        primary={{ to: "/quote", label: "Request pricing" }}
        secondary={{ to: "/contact", label: "Contact us" }}
      >
        Send your spec, get back costing, a technical proof, and a production window. Every unit made under your
        brand.
      </PageCTA>

    </div>
  )
}
