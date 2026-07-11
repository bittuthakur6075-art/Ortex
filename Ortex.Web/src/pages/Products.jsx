import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import { PRODUCT_CATEGORIES, categoryStats } from "../constants/categories"
import { CATEGORY_META } from "../constants/products"
import { fadeUp, RevealWords } from "../components/home/Section"
import PageCTA from "../components/ui/PageCTA"

const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`

export default function Products() {
  useDocumentMetadata(
    "Products & Services - Ortex Industries | MDF, Acrylic, Lanyards, Badges & More",
    "Explore Ortex Industries' comprehensive range of customized products including MDF items, acrylic products, lanyards, badges, examination boards, corporate gifts, and branding services.",
    { path: "/products" }
  )

  // The hub renders the real catalogue taxonomy from constants/categories.js —
  // the same 12 categories the quote builder prices — instead of a separate
  // hardcoded marketing list that had drifted from it.
  const categories = PRODUCT_CATEGORIES.map((entry, idx) => {
    const s = categoryStats(entry)
    return {
      slug: entry.slug,
      title: entry.name,
      icon: CATEGORY_META[entry.category]?.icon || "📦",
      description: entry.seoDescription,
      count: s.count,
      priceMin: s.priceMin,
      moqMin: s.moqMin,
      variant: idx % 2 === 0 ? "elevated" : "default",
    }
  })

  return (
    <>
      {/* Page Header */}
      <section className="py-[140px] bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div {...fadeUp} className="max-w-3xl mx-auto">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Catalog
            </span>
            <h1 className="text-[40px] md:text-[64px] font-normal leading-[1.05] mb-6 tracking-tight text-foreground text-balance">
              Products & services
            </h1>
            <p className="text-[18px] font-normal text-foreground leading-relaxed">
              Comprehensive range of premium customized products manufactured in-house with complete branding and customization support.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content Section — lead with the catalogue buyers came for */}
      <section className="py-[140px] bg-background text-left">
        <div className="lp-wrap">

          {/* Product Categories */}
          <motion.div {...fadeUp} className="mb-12 text-center">
            <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase mb-3">
              Browse
            </span>
            <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight mb-4 text-foreground text-balance">
              <RevealWords text="Our product categories" />
            </h2>
            <p className="text-[18px] font-normal text-foreground max-w-2xl mx-auto">
              Explore our comprehensive range of customizable products
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
            {categories.map((item, idx) => (
              <motion.div
                key={item.slug}
                {...fadeUp}
                transition={{ ...fadeUp.transition, delay: Math.min(idx, 5) * 0.08 }}
                className={`group p-[30px] transition-colors duration-300 h-full flex flex-col border border-border ${
                  item.variant === "elevated"
                    ? "bg-card hover:border-primary/50"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <div className="flex items-start space-x-4 flex-1">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-primary/10 flex items-center justify-center text-2xl" aria-hidden="true">
                      {item.icon}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-[20px] font-semibold mb-2 text-foreground">
                      <Link to={`/products/${item.slug}`} className="hover:text-primary transition-colors">
                        {item.title}
                      </Link>
                    </h3>
                    <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">{item.description}</p>
                    <p className="text-[13px] text-muted-foreground mt-3">
                      {item.count} product{item.count > 1 ? "s" : ""} · from{" "}
                      <strong className="text-foreground">{inr(item.priceMin)}/unit</strong> · MOQ from {item.moqMin}
                    </p>
                  </div>
                </div>

                <div className="mt-auto pt-4">
                  <Link
                    to={`/products/${item.slug}`}
                    className="inline-flex items-center text-[14px] font-medium text-muted-foreground hover:text-primary group-hover:text-primary transition-all duration-200"
                  >
                    View products &amp; pricing
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" aria-hidden="true" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Customization Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp} className="space-y-6">
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase">
                Customization
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Complete product customization" />
              </h2>
              <p className="text-[18px] font-normal text-foreground leading-relaxed">
                Every product we manufacture can be fully customized to match your exact specifications. From design and dimensions to colors and branding, we offer unlimited customization options.
              </p>
              <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                Our advanced manufacturing facilities are equipped with UV printing, laser engraving, sublimation, and embossing capabilities, allowing us to deliver premium quality products with your unique branding.
              </p>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="relative"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.25-am-mLVQN.jpeg"
                  alt="Customized products showcase including badges, keychains, and promotional items"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>
          </div>

        </div>
      </section>

      {/* Technical Capabilities Section */}
      <section className="py-[140px] bg-secondary text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <motion.div {...fadeUp} className="relative order-2 lg:order-1">
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src="https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.23-am-rFOY8.jpeg"
                  alt="Professional corporate gifts and promotional merchandise"
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

            <motion.div
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.1 }}
              className="order-1 lg:order-2 space-y-6"
            >
              <span className="block text-[14px] font-semibold text-primary tracking-[0.22em] uppercase">
                Branding services
              </span>
              <h2 className="text-[40px] md:text-[64px] font-normal leading-[1.05] tracking-tight text-foreground text-balance">
                <RevealWords text="Branding & customization services" />
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-[20px] font-semibold mb-2 text-foreground">UV printing</h3>
                  <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                    High-quality UV printing for vibrant, durable designs on various materials including acrylic, MDF, and plastic.
                  </p>
                </div>
                <div>
                  <h3 className="text-[20px] font-semibold mb-2 text-foreground">Laser engraving</h3>
                  <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                    Precise laser engraving for permanent, professional branding on metal, acrylic, wood, and other materials.
                  </p>
                </div>
                <div>
                  <h3 className="text-[20px] font-semibold mb-2 text-foreground">Sublimation & embossing</h3>
                  <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                    Advanced sublimation printing and embossing techniques for premium finishing and unique branding effects.
                  </p>
                </div>
              </div>
            </motion.div>

          </div>
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
