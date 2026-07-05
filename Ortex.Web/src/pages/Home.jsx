import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import {
  Settings, Sliders, Globe, ArrowRight,
  Box, Diamond, Contact as ContactIcon, Gift,
  Building2, GraduationCap, Landmark, Calendar, Factory, Layers, Boxes,
} from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/ui/Hero"

const HOME_OG = "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.24-am-2-AChL5.jpeg"

const stats = [
  { icon: Factory, value: "100%", label: "In-house production" },
  { icon: Boxes, value: "8+", label: "Product categories" },
  { icon: Layers, value: "10+", label: "Industries served" },
  { icon: Globe, value: "PAN India + Export", label: "Delivery reach" },
]

const capabilities = [
  {
    icon: Settings,
    title: "In-house manufacturing",
    description: "State-of-the-art facilities for complete production control and quality assurance",
  },
  {
    icon: Sliders,
    title: "Complete customization",
    description: "Tailored solutions to match your exact specifications and branding requirements",
  },
  {
    icon: Globe,
    title: "Global reach",
    description: "Serving customers across India and worldwide with reliable export support",
  },
]

const featuredProducts = [
  { icon: Box, title: "MDF products", description: "Magnets, keychains, photo frames, name plates & office accessories." },
  { icon: Diamond, title: "Acrylic products", description: "Keychains, badges, name plates & display stands with UV printing." },
  { icon: ContactIcon, title: "Lanyards & ID accessories", description: "Custom-printed lanyards, ID cards, badges & access passes." },
  { icon: Gift, title: "Corporate gifting", description: "Branded pens, diaries, bottles, mugs & complete gift solutions." },
]

const featuredIndustries = [
  { icon: Building2, title: "Corporate" },
  { icon: GraduationCap, title: "Education" },
  { icon: Landmark, title: "Government" },
  { icon: Calendar, title: "Events" },
]

const portfolioPreview = [
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/1c8810a9aab598f2852aa43694b1e810.jpg",
    title: "Custom printed lanyards",
    alt: "Yellow polyester lanyard with custom full-colour printing and metal hardware",
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/df12dcba362d2a4018c92cdfe42fe5ea.jpg",
    title: "Magnetic metal badges",
    alt: "Set of circular magnetic metal badges in yellow and blue",
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/348f14b4519831287f42e8843fa4ccf1.png",
    title: "Acrylic name badges",
    alt: "Acrylic name badge with healthcare branding and magnetic backing",
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/bfcd631b36b72777ed9b93146eab51d1.jpg",
    title: "MDF wall art & signage",
    alt: "MDF wall-mounted clocks with printed tourism design",
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/361faf75782d94ec7db0ed3a259f5d50.jpg",
    title: "Souvenir fridge magnets",
    alt: 'Decorative souvenir magnet with "I Love Haflong" design featuring scenic landscape imagery',
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/458febc687a80adf5b027abd1ebdf24b.jpg",
    title: "Promotional spinner toys",
    alt: "Vibrant multicolor spinner fidget toys with customizable center area for branding",
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/56315942c1152cce539bfd626e71bd74.jpg",
    title: "Flower-shaped sticky notes",
    alt: "Decorative flower-shaped sticky notes with colorful petals",
  },
  {
    image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/01c646b1bb21e4fbef8b388744992828.jpg",
    title: "Novelty highlighters",
    alt: "Syringe-shaped highlighters with medical-themed design in bright colors",
  },
]

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
}

export default function Home() {
  useDocumentMetadata(
    "Ortex Industries - Premium Customized Products for Businesses Worldwide",
    "Ortex Industries specializes in manufacturing premium customized products including MDF products, acrylic items, lanyards, badges, and corporate gifts. Serving businesses across India and worldwide.",
    { path: "/", image: HOME_OG }
  )

  return (
    <>
      {/* Hero Section */}
      <Hero />

      {/* Trust / Stats Strip */}
      <section className="py-12 bg-background border-b border-border">
        <div className="lp-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <stat.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <div className="text-xl md:text-2xl font-bold text-foreground leading-tight">{stat.value}</div>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Our core capabilities
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Delivering excellence through advanced manufacturing and customization expertise
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {capabilities.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-card rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 border border-border text-left"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                  <item.icon className="h-7 w-7 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-card-foreground">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Preview Section */}
      <section className="py-20 bg-background">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              What we manufacture
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A comprehensive range of customizable products, produced in-house with complete branding support
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300 text-left h-full"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-primary" aria-hidden="true" />
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
              Explore all products & services
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-left"
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6 tracking-tight text-foreground text-balance">
                Why businesses choose Ortex Industries
              </h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Complete in-house manufacturing</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Our advanced production facilities ensure complete quality control from raw materials to finished products, delivering consistent excellence in every order.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Unlimited customization options</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    From design to branding, we offer complete customization services including UV printing, laser engraving, sublimation, and embossing to match your exact requirements.
                  </p>
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-2 text-foreground">Competitive pricing with premium quality</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Direct manufacturing capabilities allow us to offer competitive pricing without compromising on quality, making premium products accessible for businesses of all sizes.
                  </p>
                </div>
              </div>

              <Link
                to="/about"
                className="mt-8 px-5 py-2.5 border-2 border-border hover:bg-muted font-medium rounded-lg inline-flex items-center transition-all duration-200 active:scale-[0.98] text-foreground"
              >
                Learn more about us
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl bg-white">
                <img
                  src="/img/krishna-key-holder.jpg"
                  alt="Handcrafted MDF Krishna key holder with hooks and floral design by Ortex Industries"
                  className="w-full h-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* Industries Preview Section */}
      <section className="py-20 bg-background">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Trusted across industries
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From corporates and schools to government and events, we deliver sector-specific solutions.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredIndustries.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="flex flex-col items-center text-center bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <item.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-card-foreground">{item.title}</h3>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/industries"
              className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              See all industries we serve
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Portfolio Preview Section */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Recent work
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A glimpse of the custom products we've delivered for organisations across sectors
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {portfolioPreview.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="group rounded-xl overflow-hidden bg-card border border-border/50 hover:shadow-xl transition-all duration-300"
              >
                <div className="aspect-square overflow-hidden bg-muted">
                  <img
                    src={item.image}
                    alt={item.alt}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-foreground line-clamp-1">{item.title}</h3>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/portfolio"
              className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              View full portfolio
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Call to Action Section */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="lp-wrap text-center">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-balance text-primary-foreground">
              Ready to bring your ideas to life?
            </h2>
            <p className="text-lg mb-8 max-w-2xl mx-auto opacity-90 text-primary-foreground/90">
              Get in touch with our team to discuss your requirements and receive a customized quote for your project.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/quote"
                className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Get a quote
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                to="/contact"
                className="px-6 py-3 border-2 border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Contact us today
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  )
}
