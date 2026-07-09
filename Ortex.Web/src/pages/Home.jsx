import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import {
  Settings, Sliders, Globe, ArrowRight,
  Box, Diamond, Contact as ContactIcon, Gift,
  Building2, GraduationCap, Landmark, Calendar, Factory, Layers, Boxes,
  Award, ClipboardList, FileText, Sparkles,
  Stethoscope, Megaphone, Heart, ShoppingBag,
  Truck, Star,
} from "lucide-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/ui/Hero"
import { photosData } from "../constants/photos"

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
  { icon: Award, title: "Badge manufacturing", description: "Acrylic, magnetic, button, metal, and plastic badges." },
  { icon: ClipboardList, title: "Examination boards", description: "Durable acrylic, PVC, and ABS examination boards." },
  { icon: FileText, title: "Custom clipboards", description: "Professional clipboards & writing pads with custom branding." },
  { icon: Gift, title: "Corporate gifting", description: "Branded pens, diaries, bottles, mugs & complete gift solutions." },
  { icon: Sparkles, title: "Branding services", description: "UV printing, laser engraving, sublimation, and embossing." },
]

const featuredIndustries = [
  { icon: Building2, title: "Corporate" },
  { icon: GraduationCap, title: "Education" },
  { icon: Landmark, title: "Government" },
  { icon: Stethoscope, title: "Healthcare" },
  { icon: Calendar, title: "Events" },
  { icon: Megaphone, title: "Marketing" },
  { icon: Heart, title: "NGOs" },
  { icon: ShoppingBag, title: "Retail" },
]

const steps = [
  {
    icon: ClipboardList,
    title: "Specify details",
    description: "Submit product specs, quantities, and logos via our Quote Calculator or contact forms.",
  },
  {
    icon: Sparkles,
    title: "Digital mockup",
    description: "Receive a professional visual layout and sizing proof from our design team for confirmation.",
  },
  {
    icon: Factory,
    title: "In-house production",
    description: "Your order goes into production with high-precision printing, engraving, and strict QC.",
  },
  {
    icon: Truck,
    title: "Express delivery",
    description: "Safe, bulk-packed delivery to your location, supporting PAN India and international export.",
  },
]

const testimonials = [
  {
    author: "N.L. Parthasarathi",
    location: "Kalpakkam, Tamil Nadu",
    date: "05-July-2026",
    product: "Keychains",
    quote: "Excellent build and durability. The print resolution and custom cutting precision exceeded our requirements.",
    rating: 5,
  },
  {
    author: "Rupsha",
    location: "Kolkata, West Bengal",
    date: "25-June-2026",
    product: "Keychains",
    quote: "Highly satisfied with the batch of promotional keychains. Neat finishing, sturdy rings, and perfect bulk packaging.",
    rating: 5,
  },
  {
    author: "Naresh Kumar",
    location: "Delhi, Delhi",
    date: "09-June-2026",
    product: "Indian National Flag",
    quote: "Great flag materials and accurate colors. Perfect execution of standard specifications for bulk order.",
    rating: 5,
  },
  {
    author: "Tahzeeb Fatma",
    location: "New Delhi, Delhi",
    date: "04-June-2026",
    product: "Indian National Flag",
    quote: "Highly professional flag printing with timely shipping. The coordinate responses were excellent.",
    rating: 5,
  },
  {
    author: "Pradeep Matera",
    location: "Bahraich, Uttar Pradesh",
    date: "02-June-2026",
    product: "PVC Keychain",
    quote: "Custom PVC molds match our design proof exactly. Strong durability and vibrant detailing.",
    rating: 5,
  },
  {
    author: "Sushil",
    location: "New Delhi, Delhi",
    date: "07-March-2026",
    product: "Acrylic Keychain",
    quote: "Transparent custom acrylic keychains with precise laser-cut edges. Sturdy design and printing quality.",
    rating: 5,
  },
  {
    author: "Balachandran Aarthy",
    location: "Bengaluru, Karnataka",
    date: "07-January-2026",
    product: "Leather Keychain",
    quote: "Premium leather keychains with neat hot-stamp branding and robust rings. Highly recommended for corporate gifts.",
    rating: 5,
  },
  {
    author: "Mandeep Singh",
    location: "Ludhiana, Punjab",
    date: "11-October-2025",
    product: "Leather Keychain",
    quote: "Good response and quality. The leather keychain finishing is clean, premium, and durable.",
    rating: 5,
  },
  {
    author: "Suman Jha",
    location: "Mumbai, Maharashtra",
    date: "15-September-2025",
    product: "Leather Keychain",
    quote: "Neat stitching and smooth texture. Debossed logo details are sharp and exact to our branding guidelines.",
    rating: 5,
  },
  {
    author: "Lilly Susena Elias Simon",
    location: "Chennai, Tamil Nadu",
    date: "20-May-2025",
    product: "Wooden Mobile Stand",
    quote: "Elegant wooden mobile stands with clean custom engraving. Premium polished wood texture.",
    rating: 5,
  },
  {
    author: "Deepak",
    location: "Jabalpur, Madhya Pradesh",
    date: "06-February-2025",
    product: "Wooden Engraved Keychains",
    quote: "Beautiful engraving finish and rich wood grain texture. Exceeded expectations for promotional gifting.",
    rating: 5,
  },
  {
    author: "S Lal",
    location: "Greater Noida, Uttar Pradesh",
    date: "22-January-2023",
    product: "Promotional Keychain",
    quote: "One of the best promotional product manufacturers. Superb coordination, quick responses, and premium final product.",
    rating: 5,
  },
]

/**
 * Combined photo pool — images sourced from the Photos page (IndiaMART gallery)
 * and the original portfolio. getDailyPhotos() picks a different set of 8 every
 * 24 hours using a date-seeded shuffle so every visitor sees the same selection
 * for a given calendar day, and the grid refreshes automatically at midnight.
 */
const photoPool = [
  // ── Photos page (IndiaMART gallery) ──────────────────────────────────────
  ...photosData.map(p => ({ image: p.url, title: p.name, alt: p.name })),
  // ── Original portfolio images ─────────────────────────────────────────────
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/1c8810a9aab598f2852aa43694b1e810.jpg", title: "Custom printed lanyards", alt: "Yellow polyester lanyard with custom full-colour printing and metal hardware" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/df12dcba362d2a4018c92cdfe42fe5ea.jpg", title: "Magnetic metal badges", alt: "Set of circular magnetic metal badges in yellow and blue" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/348f14b4519831287f42e8843fa4ccf1.png", title: "Acrylic name badges", alt: "Acrylic name badge with healthcare branding and magnetic backing" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/bfcd631b36b72777ed9b93146eab51d1.jpg", title: "MDF wall art & signage", alt: "MDF wall-mounted clocks with printed tourism design" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/361faf75782d94ec7db0ed3a259f5d50.jpg", title: "Souvenir fridge magnets", alt: "Decorative souvenir magnet with I Love Haflong design featuring scenic landscape imagery" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/458febc687a80adf5b027abd1ebdf24b.jpg", title: "Promotional spinner toys", alt: "Vibrant multicolor spinner fidget toys with customizable center area for branding" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/56315942c1152cce539bfd626e71bd74.jpg", title: "Flower-shaped sticky notes", alt: "Decorative flower-shaped sticky notes with colorful petals" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/01c646b1bb21e4fbef8b388744992828.jpg", title: "Novelty highlighters", alt: "Syringe-shaped highlighters with medical-themed design in bright colors" },
]

/**
 * Date-seeded pseudo-random shuffle — returns the same 8 photos for all users
 * on a given calendar day, then automatically rotates to a fresh set the next day.
 */
function getDailyPhotos(pool, count = 8) {
  const today = new Date()
  // Seed = YYYYMMDD as an integer — changes once every 24 h
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()

  // Simple seeded PRNG (mulberry32)
  let t = seed
  function rand() {
    t = (t + 0x6d2b79f5) | 0
    let v = Math.imul(t ^ (t >>> 15), 1 | t)
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v)
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296
  }

  // Fisher-Yates shuffle using seeded PRNG
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  return shuffled.slice(0, count)
}

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
}

const homeSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.ortexindustries.in/#organization",
      "name": "Ortex Industries",
      "legalName": "Ortex Industries Private Limited",
      "url": "https://www.ortexindustries.in/",
      "logo": {
        "@type": "ImageObject",
        "@id": "https://www.ortexindustries.in/#logo",
        "url": "https://www.ortexindustries.in/img/logo.png",
        "caption": "Ortex Industries Logo"
      },
      "image": {
        "@id": "https://www.ortexindustries.in/#logo"
      },
      "description": "Manufacturer of premium customized products including MDF and acrylic items, lanyards, ID badges, examination boards, and corporate gifts. OEM and white-label production with PAN India delivery and worldwide export.",
      "email": "sales@ortexindustries.in",
      "telephone": "+91-9211947188",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "New Delhi",
        "addressRegion": "Delhi",
        "addressCountry": "IN"
      },
      "contactPoint": {
        "@type": "ContactPoint",
        "telephone": "+91-9211947188",
        "contactType": "sales",
        "email": "sales@ortexindustries.in",
        "areaServed": ["IN", "Worldwide"],
        "availableLanguage": ["en", "hi"]
      }
    },
    {
      "@type": "WebSite",
      "@id": "https://www.ortexindustries.in/#website",
      "url": "https://www.ortexindustries.in/",
      "name": "Ortex Industries",
      "description": "Premium Customized Products, Manufacturing & Corporate Gifting",
      "publisher": {
        "@id": "https://www.ortexindustries.in/#organization"
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://www.ortexindustries.in/products?search={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      },
      "inLanguage": "en-IN"
    },
    {
      "@type": "LocalBusiness",
      "@id": "https://www.ortexindustries.in/#localbusiness",
      "name": "Ortex Industries",
      "image": "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.24-am-2-AChL5.jpeg",
      "url": "https://www.ortexindustries.in/",
      "telephone": "+91-9211947188",
      "priceRange": "$$",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": "New Delhi",
        "addressRegion": "Delhi",
        "addressCountry": "IN"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "28.6139",
        "longitude": "77.2090"
      },
      "openingHoursSpecification": {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday"
        ],
        "opens": "09:00",
        "closes": "18:30"
      }
    }
  ]
}

export default function Home() {
  useDocumentMetadata(
    "Ortex Industries — Custom Manufacturing, Corporate Gifting & Branding",
    "Ortex Industries manufactures premium customized products: MDF & acrylic items, lanyards, ID badges, examination boards & corporate gifts. In-house production, OEM & worldwide export.",
    { 
      path: "/", 
      image: HOME_OG,
      keywords: "Ortex Industries, custom manufacturing, corporate gifting, MDF items, acrylic keychains, lanyards, ID badges, brand promotion, OEM manufacturing, custom branding, New Delhi",
      schema: homeSchema
    }
  )

  // Get today's auto-rotated selection of 8 photos
  const dailyPhotos = getDailyPhotos(photoPool)

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
      <section className="py-20 bg-background overflow-hidden">
        <div className="lp-wrap mb-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              What we manufacture
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A comprehensive range of customizable products, produced in-house with complete branding support
            </p>
          </motion.div>
        </div>

        {/* Full width marquee container */}
        <div className="marquee-container py-4">
          <div className="animate-marquee flex gap-6">
            {/* Double the list to create a seamless scrolling animation */}
            {[...featuredProducts, ...featuredProducts].map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="w-[280px] sm:w-[320px] flex-shrink-0 bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300 text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-card-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lp-wrap">
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

      {/* How We Work Section */}
      <section className="py-20 bg-background border-t border-border">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground tracking-tight text-balance">
              How we bring your designs to life
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Our streamlined 4-step manufacturing process makes B2B customization simple and stress-free.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 relative">
            {/* Connection Line for Desktop */}
            <div className="hidden md:block absolute top-[32px] left-[12%] right-[12%] h-0.5 bg-border -z-10" />

            {steps.map((step, idx) => (
              <motion.div
                key={step.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex flex-col items-center text-center group"
              >
                {/* Step icon container */}
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full bg-card border-2 border-border group-hover:border-primary flex items-center justify-center shadow-sm transition-all duration-300 relative z-10">
                    <step.icon className="h-7 w-7 text-primary transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  {/* Step Number */}
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-background">
                    {idx + 1}
                  </span>
                </div>

                <h3 className="text-lg font-bold mb-2 text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed px-2">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Preview Section */}
      <section className="py-20 bg-secondary overflow-hidden">
        <div className="lp-wrap mb-10">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Trusted across industries
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From corporates and schools to government and events, we deliver sector-specific solutions.
            </p>
          </motion.div>
        </div>

        {/* Full width marquee container */}
        <div className="marquee-container py-4">
          <div className="animate-marquee flex gap-6">
            {/* Double the list to create a seamless scrolling animation */}
            {[...featuredIndustries, ...featuredIndustries].map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="w-[180px] sm:w-[220px] flex-shrink-0 flex flex-col items-center text-center bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
                  <item.icon className="h-6 w-6 text-primary" aria-hidden="true" />
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
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Recent Work Section — Auto-rotating daily from Photos + Portfolio pool */}
      <section className="py-20 bg-background border-t border-border">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground text-balance">
              Recent work
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Fresh picks from our production floor — this showcase updates daily with new products from our gallery
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {dailyPhotos.map((item, idx) => (
              <motion.div
                key={item.title + idx}
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
              to="/photos"
              className="px-6 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
            >
              Browse full photo gallery
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20 bg-secondary overflow-hidden">
        <div className="text-center mb-16 px-4">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-foreground tracking-tight text-balance">
              What our customers say
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Genuine customer feedback and ratings from verified buyers across India.
            </p>
          </motion.div>
        </div>

        {/* Marquee Row */}
        <div className="marquee-container-secondary mt-8">
          <div className="animate-marquee-slow py-4 flex gap-6">
            {[...testimonials, ...testimonials].map((t, idx) => (
              <div
                key={`${t.author}-${idx}`}
                className="w-[320px] md:w-[360px] flex-shrink-0 bg-card rounded-2xl p-6 border border-border/80 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300 text-left"
              >
                <div>
                  {/* Rating Stars */}
                  <div className="flex gap-1 mb-4">
                    {[...Array(t.rating)].map((_, i) => (
                      <Star key={i} className="h-4.5 w-4.5 fill-primary text-primary" />
                    ))}
                  </div>
                  {/* Quote */}
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed italic mb-6">
                    "{t.quote}"
                  </p>
                </div>
                {/* Author Info */}
                <div className="pt-4 border-t border-border/40 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm flex-shrink-0">
                    {t.author.split(" ").filter(Boolean).map(n => n[0]).join("").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-foreground text-sm truncate">{t.author}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.location} • <span className="font-semibold text-primary">{t.product}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">{t.date}</p>
                  </div>
                </div>
              </div>
            ))}
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
