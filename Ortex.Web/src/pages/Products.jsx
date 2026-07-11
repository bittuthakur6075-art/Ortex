import { useRef, useState } from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import { Printer, Flash, Colorfilter } from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { PRODUCT_CATEGORIES, photosForCategory } from "../constants/categories"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"

const FALLBACK_IMAGE = "/img/factory-production-workshop.jpg"

// Card-specific copy: short titles that hold one line, and descriptions sized
// to fill ~3 lines. Kept here (not in the shared SEO data) so it only affects
// these product-hub cards. Keyed by category slug.
const CARD_COPY = {
  "keychains": {
    title: "Custom Keychains",
    description: "Bulk keychains made in-house in UV-printed acrylic, debossed leather, moulded silicone and soft-PVC, plus sublimation satin, at factory-direct pricing.",
  },
  "acrylic-products": {
    title: "Acrylic Products",
    description: "Desk standees, name and card holders, paperweights and dashboard idols. Cast acrylic, UV-printed and laser-cut in-house with clean polished edges.",
  },
  "mdf-products": {
    title: "MDF Products",
    description: "Award trophies, examination pads and custom-shape fridge magnets, all CNC-routed and UV-printed in-house from 3 to 9 mm MDF sheet.",
  },
  "lanyards": {
    title: "Lanyards & ID Straps",
    description: "Full-colour sublimation and satin-printed lanyards in bulk, in 16 and 20 mm widths, with metal trigger hooks and safety breakaway options, factory-direct.",
  },
  "badges": {
    title: "Custom Badges",
    description: "Engraved brass name badges with magnet backing, printed tinplate button badges, moulded plastic pin badges and LED light-up badges, made in bulk.",
  },
  "examination-boards": {
    title: "Examination Boards",
    description: "PVC A4 clipboards, foldable exam boards with storage compartments and 6 mm MDF clipboards, custom-branded for schools and institutions.",
  },
  "wall-clocks": {
    title: "Wall Clocks",
    description: "Promotional 8 and 7.5-inch clocks, 15-inch designer pieces, CNC-routed wooden clocks and UV-printed acrylic clocks with reliable quartz movements.",
  },
  "fridge-magnets": {
    title: "Fridge Magnets",
    description: "UV-printed MDF in any shape, transparent acrylic, soft PVC with 2D and 3D embossing, and laser-engraved wooden magnets, all produced in bulk.",
  },
  "corporate-gifts": {
    title: "Corporate Gifts",
    description: "Double-wall insulated steel bottles with laser-engraved logos, plus executive A5 diary and metal pen gift sets, branded in-house with GST invoicing.",
  },
  "flags-banners": {
    title: "Flags & Banners",
    description: "Custom printed polyester flags in bulk: 3×5 ft with double-side printing and 2×3 ft party or election flags on wooden sticks, billed at 12% GST.",
  },
  "clipboards": {
    title: "Clipboards & Pads",
    description: "Custom A4 MDF clipboards with spring clips, branded front and back, made in-house for institutions, events and corporate stationery programmes.",
  },
  "promotional-merchandise": {
    title: "Promotional Merch",
    description: "Cotton twill caps with embroidery or printing, and sublimation-printed mobile popsockets, at factory-direct pricing with volume discounts.",
  },
}

// Customization options, rendered in the home "Workflow process" numbered grid.
const customizationOptions = [
  {
    title: "Your artwork",
    description: "Send vector files in .cdr, .ai, .pdf, or .dxf and we build to them exactly, with no templates or clip-art substitutes.",
  },
  {
    title: "Shape & size",
    description: "Custom cut shapes and dimensions, from a keychain silhouette to a full display board, all made to your spec.",
  },
  {
    title: "Colour matching",
    description: "Exact Pantone matching across every run, so the finish holds to your brand guidelines batch after batch.",
  },
  {
    title: "Materials & finish",
    description: "Pick the sheet thickness, material, and surface finish, from matte acrylic to polished MDF, to suit the product.",
  },
]

// Brand-logo strip for the Otto "We service your vehicle" clone. These are the
// Framer template's generic placeholder marks — decorative only, not real client
// logos. Swap for actual client/partner logos when available.
const brandLogos = Array.from({ length: 11 }, (_, i) => `/img/brand-logos/logo-${i + 1}.svg`)

// Branding methods, rendered in the home "Workflow process" numbered-grid style.
const brandingServices = [
  {
    icon: Printer,
    title: "UV printing",
    description: "Flatbed UV printing lays sharp, full-colour artwork straight onto acrylic, MDF, and plastic, and it stays vivid without fading, cracking, or peeling in use.",
  },
  {
    icon: Flash,
    title: "Laser engraving",
    description: "A focused laser cuts your logo permanently into metal, acrylic, and wood for a crisp, tactile mark that never rubs off or wears away with handling.",
  },
  {
    icon: Colorfilter,
    title: "Sublimation & embossing",
    description: "Dye-sublimation prints edge to edge on fabric, while thermo-embossing raises the finish, the premium touches that make gifting pieces feel considered.",
  },
]

export default function Products() {
  useDocumentMetadata(
    "Products & Services - Ortex Industries | MDF, Acrylic, Lanyards, Badges & More",
    "Explore Ortex Industries' comprehensive range of customized products including MDF items, acrylic products, lanyards, badges, examination boards, corporate gifts, and branding services.",
    { path: "/products" }
  )

  // The hub renders the real catalogue taxonomy from constants/categories.js —
  // the same 12 categories the quote builder prices — instead of a separate
  // hardcoded marketing list that had drifted from it.
  const categories = PRODUCT_CATEGORIES.map((entry) => {
    const copy = CARD_COPY[entry.slug]
    return {
      slug: entry.slug,
      title: copy?.title || entry.name,
      description: copy?.description || entry.seoDescription,
      image: photosForCategory(entry, 1)[0]?.url || FALLBACK_IMAGE,
    }
  })

  // One shared cursor-following arrow over the cards area, spring-trailed, same
  // as the home ProductsPreview. The native cursor is hidden across the grid.
  const areaRef = useRef(null)
  const cx = useMotionValue(0)
  const cy = useMotionValue(0)
  const springCfg = { stiffness: 350, damping: 32, mass: 0.5 }
  const sx = useSpring(cx, springCfg)
  const sy = useSpring(cy, springCfg)
  const [showCursor, setShowCursor] = useState(false)

  const pointerPos = (e) => {
    const rect = areaRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }
  const onCursorEnter = (e) => {
    const p = pointerPos(e)
    if (p) { cx.jump(p.x); cy.jump(p.y) }
    setShowCursor(true)
  }
  const onCursorMove = (e) => {
    const p = pointerPos(e)
    if (p) { cx.set(p.x); cy.set(p.y) }
  }

  return (
    <>
      {/* Page Header */}
      <section className="py-[150px] bg-background">
        <div className="lp-wrap text-center">
          <motion.div {...fadeUp} className="max-w-3xl mx-auto">
            <h1 className="text-[48px] md:text-[82px] font-medium leading-[1.05] mb-8 tracking-tight text-foreground whitespace-nowrap">
              Products & Services
            </h1>
            <p className="text-[20px] font-normal text-foreground leading-relaxed max-w-2xl mx-auto">
              Comprehensive range of premium customized products manufactured in-house with complete branding and customization support.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content Section — lead with the catalogue buyers came for */}
      <section className="pt-0 pb-[140px] bg-background text-left">
        <div className="lp-wrap">

          {/* Product Categories — Otto "Our Services" numbered cards */}
          <div
            ref={areaRef}
            onMouseEnter={onCursorEnter}
            onMouseMove={onCursorMove}
            onMouseLeave={() => setShowCursor(false)}
            className="relative cursor-none mb-20"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-[30px] gap-y-[50px]">
              {categories.map((item, idx) => (
                <motion.div
                  key={item.slug}
                  {...fadeUp}
                  transition={{ ...fadeUp.transition, delay: Math.min(idx, 5) * 0.06 }}
                >
                  <Link
                    to={`/products/${item.slug}`}
                    className="group flex flex-col h-full rounded-[4px] bg-card transition-colors duration-300 overflow-hidden"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={item.image}
                        alt={item.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                      />
                    </div>
                    <div className="flex flex-col flex-1 pt-5">
                      <h3 className="text-[24px] font-semibold mb-3 text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-[16px] font-normal text-[#4b5675] leading-relaxed line-clamp-3">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>

            {/* Shared cursor-following arrow (spring-trailed) */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute z-50 grid place-items-center rounded-full bg-primary text-primary-foreground"
              style={{ left: sx, top: sy, x: "-50%", y: "-50%" }}
              animate={{ opacity: showCursor ? 1 : 0, scale: showCursor ? 1 : 0.4, width: 48, height: 48 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <ArrowRight size={20} strokeWidth={2} />
            </motion.span>
          </div>

        </div>
      </section>

      {/* Customization — home "Workflow process" numbered grid, on footer-dark bg */}
      <section className="py-[140px] bg-[#010101] text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-white/50 tracking-[0.22em] uppercase mb-3">
              Customization
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-white whitespace-nowrap">
              <RevealWords text="Built to your spec" />
            </h2>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[42px] list-none">
            {customizationOptions.map((option, idx) => (
              <motion.li
                key={option.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 text-[36px] font-semibold leading-none text-white/50 tabular-nums">
                  0{idx + 1}
                </div>

                <h3 className="text-[24px] font-medium text-white">{option.title}</h3>
                <div className="mt-4 border-t" style={{ borderColor: "rgba(255,255,255,0.2)" }} />
                <p className="mt-8 text-[16px] font-normal text-white/70 leading-relaxed line-clamp-3">
                  {option.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Otto "We service your vehicle" clone: black logo strip (marquee) above
          an indigo banner with a heading left and two-line copy right */}
      <section>
        {/* Logo strip */}
        <div className="bg-[#0a0a0a] py-[56px] overflow-hidden">
          <div className="relative overflow-hidden">
            <div className="animate-marquee flex items-center gap-[80px]" style={{ animationDuration: "28s" }}>
              {[...brandLogos, ...brandLogos].map((src, idx) => (
                <img
                  key={`${src}-${idx}`}
                  src={src}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-12 w-auto flex-shrink-0 object-contain"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Indigo banner */}
        <div className="bg-[#1a237e] text-white py-[40px]">
          <div className="lp-wrap flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-[36px] md:text-[52px] font-normal leading-[1.05] tracking-tight text-white max-w-2xl">
              Your brand, made real
            </h2>
            <p className="text-[15px] md:text-[16px] leading-relaxed text-white/75 max-w-xs lg:text-right">
              From first sample to full production run, we manufacture it to your exact spec.
            </p>
          </div>
        </div>
      </section>

      {/* Branding services — home "Workflow process" numbered-grid design */}
      <section className="py-[140px] bg-secondary text-left">
        <div className="lp-wrap">
          <motion.div {...fadeUp} className="mb-[50px] max-w-2xl mx-auto text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Finishing
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground whitespace-nowrap">
              <RevealWords text="Put your brand on anything" />
            </h2>
          </motion.div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[42px] list-none">
            {brandingServices.map((service, idx) => (
              <motion.li
                key={service.title}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: idx * 0.1 }}
                className="text-left relative overflow-hidden group"
              >
                <div className="mb-8 w-[50px] h-[50px] rounded-[999px] bg-primary/10 flex items-center justify-center text-primary">
                  <service.icon size={24} color="currentColor" variant="Bulk" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] font-medium text-foreground">{service.title}</h3>
                <div className="mt-6 border-t border-primary/20" />
                <p className="mt-6 text-[16px] font-normal text-foreground leading-relaxed line-clamp-3">
                  {service.description}
                </p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      {/* Call to Action Section */}
      <PageCTA
        title="Have a product in mind?"
        primary={{ to: "/quote", label: "Get a quote" }}
        secondary={{ to: "/contact", label: "Talk to us" }}
      >
        Share your requirements and we'll get back with materials, MOQ, and pricing tailored to your project.
      </PageCTA>
    </>
  )
}
