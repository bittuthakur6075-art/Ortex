import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import { Box, Diamond, Contact, Award, ClipboardList, FileText, Gift, Sparkles, ArrowRight } from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"

export default function Products() {
  useDocumentMetadata(
    "Products & Services - Ortex Industries | MDF, Acrylic, Lanyards, Badges & More",
    "Explore Ortex Industries' comprehensive range of customized products including MDF items, acrylic products, lanyards, badges, examination boards, corporate gifts, and branding services."
  )

  const categories = [
    {
      icon: Box,
      title: "MDF products",
      description: "Premium quality fridge magnets, keychains, photo frames, name plates, and office accessories with complete customization options",
      variant: "elevated"
    },
    {
      icon: Diamond,
      title: "Acrylic products",
      description: "Crystal-clear acrylic keychains, badges, name plates, display stands, and signages with UV printing and laser engraving",
      variant: "default"
    },
    {
      icon: Contact,
      title: "Lanyards & ID card accessories",
      description: "Polyester, satin, and woven lanyards with custom printing. Complete range of ID cards, badges, and access passes",
      variant: "elevated"
    },
    {
      icon: Award,
      title: "Badge manufacturing",
      description: "Acrylic, magnetic, button, metal, and plastic badges for corporate, events, schools, and promotional purposes",
      variant: "default"
    },
    {
      icon: ClipboardList,
      title: "Examination boards",
      description: "Durable acrylic, PVC, and ABS examination boards with storage compartments. Perfect for educational institutions",
      variant: "elevated"
    },
    {
      icon: FileText,
      title: "Customized clipboards & writing pads",
      description: "Professional clipboards and writing pads with custom branding, available in various sizes and materials",
      variant: "default"
    },
    {
      icon: Gift,
      title: "Corporate gifting & promotional merchandise",
      description: "Branded pens, diaries, water bottles, mugs, power banks, and complete corporate gift solutions",
      variant: "elevated"
    },
    {
      icon: Sparkles,
      title: "Customization & branding services",
      description: "UV printing, laser engraving, sublimation, embossing, and complete branding solutions for all products",
      variant: "default"
    }
  ]

  return (
    <>
      {/* Page Header */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight text-foreground text-balance">
              Products & services
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Comprehensive range of premium customized products manufactured in-house with complete branding and customization support.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Main Content Section */}
      <section className="py-20 bg-background text-left">
        <div className="lp-wrap">
          
          {/* Customization Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center mb-20">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="space-y-6"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground text-balance">
                Complete product customization
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">
                Every product we manufacture can be fully customized to match your exact specifications. From design and dimensions to colors and branding, we offer unlimited customization options.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Our advanced manufacturing facilities are equipped with UV printing, laser engraving, sublimation, and embossing capabilities, allowing us to deliver premium quality products with your unique branding.
              </p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
                <img 
                  src="https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.25-am-mLVQN.jpeg" 
                  alt="Customized products showcase including badges, keychains, and promotional items" 
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>

          {/* Product Categories */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-12 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-foreground text-balance">
              Our product categories
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore our comprehensive range of customizable products
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {categories.map((item, idx) => (
              <motion.div 
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={`group rounded-2xl p-6 transition-all duration-300 h-full flex flex-col border border-border/50 ${
                  item.variant === "elevated" 
                    ? "bg-card shadow-lg hover:shadow-xl hover:-translate-y-1" 
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                <div className="flex items-start space-x-4 flex-1">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <item.icon className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-2 text-foreground">{item.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                  </div>
                </div>
                
                <div className="mt-auto pt-4">
                  <Link to="/contact" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-primary group-hover:text-primary transition-all duration-200">
                    Learn more
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

      {/* Technical Capabilities Section */}
      <section className="py-20 bg-secondary text-left">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative order-2 lg:order-1"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl">
                <img 
                  src="https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.23-am-rFOY8.jpeg" 
                  alt="Professional corporate gifts and promotional merchandise" 
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="order-1 lg:order-2 space-y-6"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground text-balance">
                Branding & customization services
              </h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">UV printing</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    High-quality UV printing for vibrant, durable designs on various materials including acrylic, MDF, and plastic.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Laser engraving</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Precise laser engraving for permanent, professional branding on metal, acrylic, wood, and other materials.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Sublimation & embossing</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Advanced sublimation printing and embossing techniques for premium finishing and unique branding effects.
                  </p>
                </div>
              </div>
            </motion.div>

          </div>
        </div>
      </section>
    </>
  )
}
