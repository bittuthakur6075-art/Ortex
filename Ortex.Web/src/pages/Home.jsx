import { motion } from "framer-motion"
import { Link } from "react-router-dom"
import {
  Setting2, Slider, Global, ArrowRight,
  Box, MagicStar, Profile2User, Gift,
  Building, Teacher, Bank, Calendar, Building3, Layer,
  Award, Document, DocumentText, Flash,
  Activity, VolumeHigh, Heart, Bag,
  Truck, Star,
} from "iconsax-react"
import useDocumentMetadata from "../hooks/useDocumentMetadata"
import Hero from "../components/ui/Hero"

const HOME_OG = "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.24-am-2-AChL5.jpeg"

const stats = [
  { icon: Building3, value: "100%", label: "In-house production" },
  { icon: Box, value: "8+", label: "Product categories" },
  { icon: Layer, value: "10+", label: "Industries served" },
  { icon: Global, value: "PAN-INDIA", label: "Worldwide reach" },
]

const capabilities = [
  {
    icon: Setting2,
    title: "Factory Direct",
    description: "CNC routing & high-resolution direct UV printing.",
  },
  {
    icon: Slider,
    title: "Custom Branding",
    description: "Pantone matching & vector file proofing.",
  },
  {
    icon: Global,
    title: "Global Delivery",
    description: "Fast national shipping & secure bulk cargo.",
  },
]

const featuredProducts = [
  { icon: Box, title: "MDF Manufacturing", description: "Custom shape keychains, magnets, and desk organizers cut from high-density 3.2mm/5.5mm MDF sheet." },
  { icon: MagicStar, title: "Acrylic Customization", description: "Sandwich-layered keychains (scratch prevention), laser-polished badges, and name displays." },
  { icon: Profile2User, title: "Lanyards & ID Straps", description: "Textured polyester and satin-finish lanyards (12mm/16mm/20mm) with breakaway safety attachments." },
  { icon: Award, title: "Badge Production", description: "Laser-cut acrylic, custom-printed tinplate button, magnetic, and plastic molded badges." },
  { icon: Document, title: "Examination Boards", description: "High-impact PVC and ABS examination clipboards with custom surface-branding overlays." },
  { icon: DocumentText, title: "Corporate Clipboards", description: "Custom-branded writing pads and rigid clipboards cut to custom sizes with spring clips." },
  { icon: Gift, title: "Custom Merchandise", description: "Fully customized executive diary sets, bottles, thermal mugs, and branding accessories." },
  { icon: Flash, title: "Industrial Branding", description: "Advanced flatbed UV printing, precise laser engraving, dye-sublimation, and thermo-embossing." },
]

const featuredIndustries = [
  { icon: Building, title: "Corporate" },
  { icon: Teacher, title: "Education" },
  { icon: Bank, title: "Government" },
  { icon: Activity, title: "Healthcare" },
  { icon: Calendar, title: "Events" },
  { icon: VolumeHigh, title: "Marketing" },
  { icon: Heart, title: "NGOs" },
  { icon: Bag, title: "Retail" },
]

const steps = [
  {
    icon: Document,
    title: "Artwork submission",
    description: "Upload vector formats (.cdr, .ai, .pdf, or .dxf) and spec requirements using our B2B Quote Builder.",
  },
  {
    icon: Flash,
    title: "Technical proofing",
    description: "Our in-house prepress design team evaluates dimensions and sends a virtual mockup layout for approval.",
  },
  {
    icon: Building3,
    title: "Direct manufacturing",
    description: "Your batch undergoes printing, precision cutting, assembly, and strict manual quality assurance check.",
  },
  {
    icon: Truck,
    title: "Cargo dispatch",
    description: "Orders are bulk-packed in heavy-duty cardboard and shipped via express courier with full tracking support.",
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
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/481096172/WM/HE/AO/143706925/corporate-gift-acrylic-keychain-500x500.jpeg", title: "Corporate gift acrylic keychain", alt: "Custom branded corporate gift acrylic keychain" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/481100200/UR/IJ/UG/143706925/hyundai-printed-leather-key-chain-500x500.jpeg", title: "Hyundai printed leather key chain", alt: "Branded leather keychain with Hyundai logo" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/481091231/PX/XM/CX/143706925/honda-promotional-leather-keychain-500x500.png", title: "Honda promotional leather keychain", alt: "Promotional leather keychain for Honda" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/5/512168567/DY/DE/DS/143706925/promotional-and-customized-keychains-500x500.jpg", title: "Promotional & customized keychains", alt: "Assorted promotional and customized keychains" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/12/569941121/XQ/ZJ/HG/143706925/whatsapp-image-2025-12-23-at-06-17-36-2-500x500.jpeg", title: "T-shirt shaped silicone keychains", alt: "Colorful T-shirt shaped silicone keychains" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2024/11/463781034/EE/FO/MO/143706925/event-acrylic-keychain-500x500.jpg", title: "Event acrylic keychain", alt: "Custom event acrylic keychain" },
  { image: "https://5.imimg.com/data5/SELLER/PDFImage/2024/12/474630789/NL/FO/AG/143706925/advertising-acrylic-keychain-500x500.png", title: "Advertising acrylic keychain", alt: "Branded advertising acrylic keychain" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/481090402/JU/WR/UB/143706925/acrylic-keychain-in-chennai-500x500.jpeg", title: "Acrylic keychain in Chennai", alt: "Custom acrylic keychain produced for Chennai client" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/481088805/OD/JM/JU/143706925/custom-acrylic-keychains-500x500.jpeg", title: "Custom acrylic keychains", alt: "Set of custom acrylic keychains" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/481092106/NF/FY/PN/143706925/plain-leather-key-ring-500x500.jpeg", title: "Plain leather key ring", alt: "Elegant plain leather key ring" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/1/573795810/WN/GX/PY/143706925/prem-motor-7-5inch-500x500.jpeg", title: "7.5 inch promotional wall clock", alt: "Promotional square wall clock 7.5 inch" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/1/573804766/LV/IM/KQ/143706925/cipla-15-iinch-500x500.jpeg", title: "15 inch designer promotional wall clock", alt: "Large designer promotional wall clock" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/2/586971663/RO/MA/YK/143706925/chatgpt-image-feb-22-2026-04-39-50-pm-500x500.png", title: "Premium designer wooden wall clock", alt: "Elegant wooden wall clock for corporate gifts" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/2/586971679/JR/HK/IO/143706925/chatgpt-image-feb-22-2026-04-35-28-pm-500x500.png", title: "Premium designer MDF wall clock", alt: "MDF wall clock for promotional & corporate gifting" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/3/588539946/GP/IM/CZ/143706925/customized-acrylic-watch-500x500.jpeg", title: "Customized acrylic watch", alt: "Custom acrylic wall clock" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2023/9/346322532/QM/VZ/UO/143706925/acrylic-fancy-wall-clock-500x500.jpg", title: "Acrylic fancy wall clock", alt: "Fancy acrylic wall clock" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/4/506195244/QF/EB/BF/143706925/customize-acrylic-dashboard-500x500.jpeg", title: "Custom acrylic dashboard", alt: "Customized acrylic dashboard accessory" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/4/602634900/YA/NI/IH/143706925/whatsapp-image-2026-04-23-at-12-34-32-pm-500x500.jpeg", title: "Premium storage exam board", alt: "Premium quality storage exam board" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/6/620543604/RO/NK/WF/143706925/mdf-exam-pad-manufacturer-500x500.jpg", title: "MDF exam pad", alt: "MDF exam pad manufacturer" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2024/9/454900945/MY/KH/EI/143706925/customize-exam-clip-board-500x500.jpeg", title: "Custom exam clipboard", alt: "Customized exam clipboard" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/2/587603905/MI/ZQ/KS/143706925/whatsapp-image-2026-02-27-at-4-20-23-pm-500x500.jpeg", title: "Custom printed round badges", alt: "Custom printed round fridge magnets and promotional badges" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/3/591664244/QG/QI/RW/143706925/whatsapp-image-2026-03-16-at-12-21-25-pm-1-500x500.jpeg", title: "Lotus plastic lighting badges", alt: "Light-up lotus shaped plastic badges" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/2/586969920/VP/TA/PY/143706925/whatsapp-image-2026-02-25-at-7-01-44-pm-1-500x500.jpeg", title: "Plastic safety pin badge", alt: "Moulded plastic badge with safety pin" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/484451444/XK/DL/AE/143706925/acrylic-fridge-magnet-500x500.jpeg", title: "Acrylic fridge magnet", alt: "Custom acrylic fridge magnet" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/10/551181820/QG/OT/ET/143706925/wood-mdf-fridge-magnet-500x500.jpeg", title: "Wood MDF fridge magnet", alt: "Wooden MDF fridge magnet" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/5/509315459/IP/JM/SW/143706925/custom-fridge-magnet-500x500.png", title: "Custom fridge magnet", alt: "Custom printed fridge magnet" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/4/506193229/IZ/YR/PU/143706925/wooden-fridge-magnet-500x500.jpeg", title: "Wooden fridge magnet", alt: "Natural wood fridge magnet" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2023/9/345285655/XS/TQ/EP/143706925/plain-acrylic-name-display-holder-500x500.jpg", title: "Acrylic name display holder", alt: "Plain acrylic name display holder" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2025/1/482070645/GT/ZV/FZ/143706925/promotional-cotton-cap-500x500.jpg", title: "Promotional cotton cap", alt: "Custom branded cotton cap" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2023/9/346287326/CU/SK/EL/143706925/acrylic-name-card-holder-500x500.jpg", title: "Acrylic name card holder", alt: "Clear acrylic name card holder" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2023/9/345279309/HP/MS/YC/143706925/acrylic-paper-weight-500x500.jpeg", title: "Acrylic paper weight", alt: "Custom acrylic paper weight" },
  { image: "https://5.imimg.com/data5/SELLER/Default/2026/5/609883285/GL/CR/KR/143706925/sublimation-mobile-popsocket-500x500.jpeg", title: "Sublimation mobile popsocket", alt: "Custom sublimation mobile popsocket" },
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

export default function Home() {
  useDocumentMetadata(
    "Ortex Industries - Premium Customized Products for Businesses Worldwide",
    "Ortex Industries specializes in manufacturing premium customized products including MDF products, acrylic items, lanyards, badges, and corporate gifts. Serving businesses across India and worldwide.",
    { path: "/", image: HOME_OG }
  )

  // Get today's auto-rotated selection of 8 photos
  const dailyPhotos = getDailyPhotos(photoPool)

  return (
    <>
      {/* Hero Section */}
      <Hero />

      {/* Trust / Stats Strip */}
      <section className="py-12 bg-background">
        <div className="lp-wrap">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, idx) => (
              <motion.div
                key={stat.label}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <div className="text-[32px] font-medium text-primary leading-none">{stat.value}</div>
                <p className="text-[14px] font-normal uppercase text-muted-foreground mt-3">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section className="py-20 bg-secondary">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">PRODUCTION STANDARDS</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-foreground text-balance">
              Factory Scale. Millimeter Precision.
            </h2>
            <p className="text-[16px] font-normal text-muted-foreground max-w-2xl mx-auto">
              From custom vector routing to Pantone-matched UV printing, we handle high-volume B2B contract orders with absolute quality assurance.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {capabilities.map((item, idx) => (
              <motion.div
                key={item.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-card rounded-[24px] p-8 shadow-lg text-center"
              >
                <div className="flex justify-center mb-4 text-primary">
                  <item.icon size={30} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-[24px] leading-tight font-semibold mb-3 text-black">{item.title}</h3>
                <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Products Preview Section */}
      <section className="py-20 bg-background overflow-hidden">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">PRODUCT CATALOG</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-foreground text-balance">
              B2B Product Offerings
            </h2>
            <p className="text-[16px] font-normal text-muted-foreground max-w-2xl mx-auto">
              From custom keychains and breakaway lanyards to rigid examination boards, all items are produced in-house to support direct wholesale requirements.
            </p>
          </motion.div>
        </div>

        {/* Responsive B2B Grid (4 Columns) */}
        <div className="lp-wrap">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredProducts.map((item, idx) => (
              <div
                key={`${item.title}-${idx}`}
                className="bg-card rounded-2xl p-6 border border-border hover:border-primary/50 hover:shadow-lg transition-all duration-300 text-left"
              >
                <div className="flex items-center mb-4 text-primary">
                  <item.icon size={30} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
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
              <ArrowRight size={16} color="currentColor" className="h-4 w-4" aria-hidden="true" />
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
              <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1 text-left">B2B PARTNERSHIP</span>
              <h2 className="text-[54px] font-medium leading-tight mb-6 text-foreground text-balance text-left">
                Built for B2B Scale & Precision
              </h2>

              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 text-primary mt-1">
                    <Building3 size={24} color="currentColor" variant="Bulk" />
                  </div>
                  <div>
                    <h3 className="text-[20px] font-semibold mb-2 text-foreground">100% In-house manufacturing</h3>
                    <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                      Absolute quality control from raw materials to CNC routing, direct UV printing, and packaging, ensuring zero defects and strict tolerance limits.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 text-primary mt-1">
                    <Slider size={24} color="currentColor" variant="Bulk" />
                  </div>
                  <div>
                    <h3 className="text-[20px] font-semibold mb-2 text-foreground">Unlimited customization options</h3>
                    <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                      Upload your vector designs (.cdr, .ai, .pdf, or .dxf) and match Pantone colors exactly on custom cuts, sheet thicknesses, and finishes.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="flex-shrink-0 text-primary mt-1">
                    <Award size={24} color="currentColor" variant="Bulk" />
                  </div>
                  <div>
                    <h3 className="text-[20px] font-semibold mb-2 text-foreground">Direct factory-direct pricing</h3>
                    <p className="text-[16px] font-normal text-muted-foreground leading-relaxed">
                      Cut out trading agents and middleman markups by 20–35% with transparent volume-tiered pricing and formal B2B invoicing.
                    </p>
                  </div>
                </div>
              </div>

              <Link
                to="/about"
                className="mt-8 px-5 py-2.5 border-2 border-border hover:bg-muted font-medium rounded-lg inline-flex items-center transition-all duration-200 active:scale-[0.98] text-foreground"
              >
                Learn more about us
                <ArrowRight size={16} color="currentColor" className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="aspect-[4/3] rounded-2xl overflow-hidden shadow-2xl bg-white premium-card">
                <img
                  src="/img/factory-production-workshop.jpg"
                  alt="State-of-the-art in-house manufacturing workshop featuring flatbed UV printing and CNC laser cutting at Ortex Industries"
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* How We Work Section */}
      <section className="py-20 bg-background">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">WORKFLOW PROCESS</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-foreground tracking-tight text-balance">
              Our Four-Step Production Pipeline
            </h2>
            <p className="text-[16px] font-normal text-muted-foreground max-w-2xl mx-auto">
              Our streamlined intake and proofing pipeline eliminates guesswork, ensuring your bulk order matches your vector artwork exactly.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <motion.div
                key={step.title}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-card rounded-[24px] p-8 shadow-lg text-left relative overflow-hidden border border-border/5 group"
              >
                {/* Large Background Step Number */}
                <div className="absolute top-4 right-6 text-[54px] font-bold text-primary/10 select-none leading-none pointer-events-none group-hover:text-primary/20 transition-colors duration-300">
                  0{idx + 1}
                </div>

                {/* Icon Container */}
                <div className="mb-6 text-primary flex items-center">
                  <step.icon size={30} color="currentColor" variant="Bulk" />
                </div>

                <h3 className="text-[20px] font-semibold mb-3 text-foreground">{step.title}</h3>
                <p className="text-[14px] font-normal text-muted-foreground leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Preview Section */}
      <section className="py-20 bg-secondary overflow-hidden">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">SECTORS SERVED</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-foreground text-balance">
              Tailored Solutions by Industry
            </h2>
            <p className="text-[16px] font-normal text-muted-foreground max-w-2xl mx-auto">
              We engineer custom accessories, promotional merchandise, and identity solutions to meet the compliance and procurement standards of every sector.
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
                className="w-[180px] sm:w-[220px] flex-shrink-0 flex flex-col items-center text-center p-6 premium-card interactive-glow"
              >
                <div className="flex items-center mb-3 text-primary">
                  <item.icon size={30} color="currentColor" variant="Bulk" className="text-primary" aria-hidden="true" />
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
      </section>

      {/* Recent Work Section — Auto-rotating daily from Photos + Portfolio pool */}
      <section className="py-20 bg-background">
        <div className="lp-wrap">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }} className="text-center mb-[50px]">
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">PRODUCTION GALLERY</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-foreground text-balance">
              Daily Production Output
            </h2>
            <p className="text-[16px] font-normal text-muted-foreground max-w-2xl mx-auto">
              A real-time window into our manufacturing floor, showcasing custom orders completed and packed for delivery today.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {dailyPhotos.map((item, idx) => (
              <motion.div
                key={item.title + idx}
                {...fadeUp}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="group overflow-hidden premium-card interactive-glow"
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
        <div className="text-center mb-[50px] px-4">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <span className="block text-[14px] font-medium text-primary tracking-[0.1em] uppercase mb-1">CLIENT REVIEWS</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-foreground tracking-tight text-balance">
              Verified Procurement Reviews
            </h2>
            <p className="text-[16px] font-normal text-muted-foreground max-w-2xl mx-auto">
              Read feedback from corporate supply-chain managers, education heads, and promotional buyers on our bulk delivery performance.
            </p>
          </motion.div>
        </div>

        {/* Marquee Row */}
        <div className="marquee-container-secondary mt-8">
          <div className="animate-marquee-slow py-4 flex gap-6">
            {[...testimonials, ...testimonials].map((t, idx) => (
              <div
                key={`${t.author}-${idx}`}
                className="w-[320px] md:w-[360px] flex-shrink-0 p-6 flex flex-col justify-between text-left bg-card rounded-none border-none shadow-none"
              >
                <div>
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
            <span className="block text-[14px] font-medium text-primary-foreground/80 tracking-[0.1em] uppercase mb-1">GET STARTED</span>
            <h2 className="text-[54px] font-medium leading-tight mb-4 text-balance text-primary-foreground">
              Ready to Secure Your Production Run?
            </h2>
            <p className="text-[16px] font-normal mb-8 max-w-2xl mx-auto opacity-90 text-primary-foreground/90">
              Get a transparent, volume-discounted quotation with full GST breakdown. Talk directly to our manufacturing engineers today.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/quote"
                className="px-6 py-3 bg-background text-foreground hover:bg-background/90 font-semibold rounded-lg inline-flex items-center gap-2 transition-all duration-200 active:scale-[0.98]"
              >
                Get a quote
                <ArrowRight size={20} color="currentColor" className="h-5 w-5" aria-hidden="true" />
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
