import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import {
  Building3, Slider, Award, Document, Flash, Truck, Box, ArrowRight,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

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
      "We manufacture under your label. Nothing we ship on your behalf carries Ortex branding unless you ask for it.",
  },
  {
    icon: Slider,
    title: "Built to your specification",
    description:
      "Custom cuts, sheet thicknesses, finishes, and exact Pantone matching — from your vector artwork, not a template.",
  },
  {
    icon: Award,
    title: "No middleman markup",
    description:
      "You are buying from the factory floor. Volume-tiered pricing with formal GST invoicing and no trading agent in between.",
  },
  {
    icon: Box,
    title: "Single-supplier breadth",
    description:
      "MDF, acrylic, lanyards, badges, examination boards, and corporate merchandise — consolidated under one purchase order.",
  },
]

const process = [
  {
    icon: Document,
    title: "Share your specification",
    description:
      "Send vector artwork (.cdr, .ai, .pdf, .dxf), target volumes, materials, and any packaging or labelling requirements.",
  },
  {
    icon: Flash,
    title: "Costing & technical proof",
    description:
      "Our prepress team validates dimensions and returns a virtual mockup with volume-tiered pricing before tooling begins.",
  },
  {
    icon: Building3,
    title: "Production under your label",
    description:
      "Printing, precision cutting, assembly, and manual quality assurance — all in-house, with no subcontracted stages.",
  },
  {
    icon: Truck,
    title: "Dispatch, white-labelled",
    description:
      "Bulk-packed and shipped under your branding, PAN-India, with tracking. Drop-shipping to your client is supported.",
  },
]

const suitedFor = [
  "Promotional product resellers and trading houses",
  "Corporate gifting companies with their own catalogues",
  "Brand agencies producing client merchandise",
  "Retailers building a private-label accessory range",
  "Event organisers requiring unbranded bulk supply",
]

export default function OEM() {
  useDocumentMetadata(
    "OEM & White Label Manufacturing - Ortex Industries",
    "Contract OEM and white-label manufacturing for MDF, acrylic, lanyards, badges, and corporate merchandise. Produced in-house under your brand, with factory-direct pricing and GST invoicing.",
    { path: "/oem" }
  )

  return (
    <div className="bg-background">

      {/* Hero */}
      <section className="py-16 md:py-24 bg-secondary border-b border-border/50">
        <div className="lp-wrap">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <span className="text-xs font-bold text-primary tracking-widest uppercase bg-primary/10 px-3 py-1.5 rounded-full inline-block mb-5">
              OEM &amp; white label
            </span>
            <h1 className="text-[32px] md:text-[44px] lg:text-[56px] font-medium leading-[1.1] mb-6 text-foreground text-balance">
              We make it. You brand it.
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8">
              Ortex Industries is a contract manufacturer. Resellers, gifting companies, and brand agencies
              use our factory to produce custom MDF, acrylic, lanyard, badge, and merchandise lines under
              their own label — without owning a single machine.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/quote"
                className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Request OEM pricing
                <ArrowRight size={16} color="currentColor" className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/work"
                className="px-6 py-3 border-2 border-border hover:bg-muted text-foreground font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                See our production work
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why OEM with us */}
      <section className="py-20">
        <div className="lp-wrap">
          <div className="text-center max-w-2xl mx-auto mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">
              Why partner with us
            </span>
            <h2 className="text-[32px] md:text-[42px] font-medium leading-tight mb-4 text-foreground text-balance">
              A factory, not a reseller
            </h2>
            <p className="text-[16px] text-muted-foreground">
              Most suppliers in this category outsource. We route, print, assemble, and pack the goods
              ourselves, which is why we can commit to the tolerance you approve.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {propositions.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: Math.min(idx, 3) * 0.08 }}
                className="bg-card rounded-2xl p-8 border border-border hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <div className="text-primary mb-5">
                  <item.icon size={32} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[20px] font-semibold mb-2.5 text-card-foreground">{item.title}</h3>
                <p className="text-[15px] text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How an OEM run works */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap">
          <div className="text-center max-w-2xl mx-auto mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">
              How it runs
            </span>
            <h2 className="text-[32px] md:text-[42px] font-medium leading-tight mb-4 text-foreground text-balance">
              From your spec to your customer
            </h2>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 list-none">
            {process.map((step, idx) => (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: idx * 0.08 }}
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
                <p className="text-[14px] text-muted-foreground leading-relaxed">{step.description}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Who it suits */}
      <section className="py-20">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">
                Who this is for
              </span>
              <h2 className="text-[32px] md:text-[42px] font-medium leading-tight mb-6 text-foreground text-balance">
                Built for people who sell, not manufacture
              </h2>
              <ul className="space-y-4">
                {suitedFor.map((item) => (
                  <li key={item} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 mt-1 text-primary" aria-hidden="true">
                      <Award size={20} color="currentColor" variant="Bulk" />
                    </span>
                    <span className="text-[16px] text-muted-foreground leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-secondary rounded-2xl p-8 md:p-10 border border-border">
              <h3 className="text-[22px] font-semibold text-foreground mb-3">
                Volumes, lead times &amp; terms
              </h3>
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-6">
                Minimum order quantities and production lead times depend on the material, finish, and volume
                of your run. We quote them explicitly, in writing, before you commit — no estimates that move
                later.
              </p>
              <Link
                to="/quote"
                className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Get your OEM quotation
                <ArrowRight size={16} color="currentColor" className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="lp-wrap text-center">
          <h2 className="text-[32px] md:text-[42px] lg:text-[54px] font-medium leading-tight mb-4 text-balance text-primary-foreground">
            Let&rsquo;s talk about your line
          </h2>
          <p className="text-[16px] mb-8 max-w-2xl mx-auto text-primary-foreground/90">
            Send us your specification and we will come back with costing, a technical proof, and a
            production window.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/quote"
              className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              Request OEM pricing
              <ArrowRight size={20} color="currentColor" className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              to="/contact"
              className="px-6 py-3 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              Contact us
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
