import {
  Setting2, Slider,
  Box, MagicStar, Profile2User, Gift,
  Building, Teacher, Bank, Calendar, Building3,
  Award, Document, DocumentText, Flash,
  Activity, VolumeHigh, Heart, Bag,
  Truck,
} from "iconsax-react"
import { photosData } from "./photos"

export const HOME_OG = "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/whatsapp-image-2026-06-25-at-6.53.24-am-2-AChL5.jpeg"

export const stats = [
  { icon: Building3, value: "100%", label: "In-house production" },
  { icon: Truck, value: "4-day", label: "Dispatch turnaround" },
  { icon: Box, value: "10-unit", label: "Minimum order" },
  { icon: Award, value: "5-star", label: "Every customer review" },
]

/**
 * Merged from the old "Capabilities" and "Why Choose Us" sections, which made
 * the same scale-and-precision claim twice on one page.
 */
export const capabilities = [
  {
    icon: Building3,
    title: "100% in-house manufacturing",
    description:
      "Every stage stays under our own roof, from raw sheet to CNC routing, direct UV printing, assembly, and final packing. Nothing is subcontracted out, so quality is checked at each step and the batch you receive holds to one consistent standard.",
  },
  {
    icon: Slider,
    title: "Unlimited customization",
    description:
      "Send your vector artwork in .cdr, .ai, .pdf, or .dxf and we build to it exactly. We match Pantone shades across custom cut shapes, sheet thicknesses, and surface finishes, so the finished run reflects your brand precisely instead of a close approximation.",
  },
  {
    icon: Award,
    title: "Factory-direct pricing",
    description:
      "You buy straight from the factory floor, with no trading agents and no middleman markup added along the way. Pricing stays transparent and tiered by volume, and every order ships with a formal GST invoice for clean, accountable procurement.",
  },
  {
    icon: Setting2,
    title: "Prepress proofing",
    description:
      "Before a single sheet is cut, our in-house design team checks your dimensions, bleed, and layout for production. You get back a virtual mockup to approve, so mistakes are caught on screen rather than discovered later in the finished batch.",
  },
]

export const featuredProducts = [
  { icon: Box, title: "MDF manufacturing", description: "Custom shape keychains, magnets, and desk organizers cut from high-density 3.2mm/5.5mm MDF sheet." },
  { icon: MagicStar, title: "Acrylic customization", description: "Sandwich-layered keychains (scratch prevention), laser-polished badges, and name displays." },
  { icon: Profile2User, title: "Lanyards & ID straps", description: "Textured polyester and satin-finish lanyards (12mm/16mm/20mm) with breakaway safety attachments." },
  { icon: Award, title: "Badge production", description: "Laser-cut acrylic, custom-printed tinplate button, magnetic, and plastic molded badges." },
  { icon: Document, title: "Examination boards", description: "High-impact PVC and ABS examination clipboards with custom surface-branding overlays." },
  { icon: DocumentText, title: "Corporate clipboards", description: "Custom-branded writing pads and rigid clipboards cut to custom sizes with spring clips." },
  { icon: Gift, title: "Custom merchandise", description: "Fully customized executive diary sets, bottles, thermal mugs, and branding accessories." },
  { icon: Flash, title: "Industrial branding", description: "Advanced flatbed UV printing, precise laser engraving, dye-sublimation, and thermo-embossing." },
]

export const featuredIndustries = [
  { icon: Building, title: "Corporate Gifting" },
  { icon: Teacher, title: "Schools & Colleges" },
  { icon: Bank, title: "Government & PSUs" },
  { icon: Activity, title: "Hospitals & Pharma" },
  { icon: Calendar, title: "Events & Exhibitions" },
  { icon: VolumeHigh, title: "Promo & Ad Agencies" },
  { icon: Heart, title: "NGOs & Trusts" },
  { icon: Bag, title: "Retail & Brands" },
  { icon: Building, title: "Startups & SMEs" },
  { icon: Building, title: "Hotels & Hospitality" },
  { icon: Bag, title: "Resellers & OEM" },
  { icon: Calendar, title: "Real Estate" },
]

export const steps = [
  {
    icon: Document,
    title: "You send the artwork",
    description: "Upload your vector files and specs to our quote builder.",
  },
  {
    icon: Flash,
    title: "We proof it first",
    description: "We check your dimensions and send a mockup to approve.",
  },
  {
    icon: Building3,
    title: "We manufacture it",
    description: "Printed, cut, assembled, and quality-checked under our own roof.",
  },
  {
    icon: Truck,
    title: "We ship it to you",
    description: "Bulk-packed and dispatched by courier with full tracking.",
  },
]

export const testimonials = [
  { author: "N.L. Parthasarathi", location: "Kalpakkam, Tamil Nadu", date: "05-July-2026", product: "Keychains", quote: "Excellent build and durability. The print resolution and custom cutting precision exceeded our requirements.", rating: 5 },
  { author: "Rupsha", location: "Kolkata, West Bengal", date: "25-June-2026", product: "Keychains", quote: "Highly satisfied with the batch of promotional keychains. Neat finishing, sturdy rings, and perfect bulk packaging.", rating: 5 },
  { author: "Naresh Kumar", location: "Delhi, Delhi", date: "09-June-2026", product: "Indian National Flag", quote: "Great flag materials and accurate colors. Perfect execution of standard specifications for bulk order.", rating: 5 },
  { author: "Tahzeeb Fatma", location: "New Delhi, Delhi", date: "04-June-2026", product: "Indian National Flag", quote: "Highly professional flag printing with timely shipping. The coordinate responses were excellent.", rating: 5 },
  { author: "Pradeep Matera", location: "Bahraich, Uttar Pradesh", date: "02-June-2026", product: "PVC Keychain", quote: "Custom PVC molds match our design proof exactly. Strong durability and vibrant detailing.", rating: 5 },
  { author: "Sushil", location: "New Delhi, Delhi", date: "07-March-2026", product: "Acrylic Keychain", quote: "Transparent custom acrylic keychains with precise laser-cut edges. Sturdy design and printing quality.", rating: 5 },
  { author: "Balachandran Aarthy", location: "Bengaluru, Karnataka", date: "07-January-2026", product: "Leather Keychain", quote: "Premium leather keychains with neat hot-stamp branding and robust rings. Highly recommended for corporate gifts.", rating: 5 },
  { author: "Mandeep Singh", location: "Ludhiana, Punjab", date: "11-October-2025", product: "Leather Keychain", quote: "Good response and quality. The leather keychain finishing is clean, premium, and durable.", rating: 5 },
  { author: "Suman Jha", location: "Mumbai, Maharashtra", date: "15-September-2025", product: "Leather Keychain", quote: "Neat stitching and smooth texture. Debossed logo details are sharp and exact to our branding guidelines.", rating: 5 },
  { author: "Lilly Susena Elias Simon", location: "Chennai, Tamil Nadu", date: "20-May-2025", product: "Wooden Mobile Stand", quote: "Elegant wooden mobile stands with clean custom engraving. Premium polished wood texture.", rating: 5 },
  { author: "Deepak", location: "Jabalpur, Madhya Pradesh", date: "06-February-2025", product: "Wooden Engraved Keychains", quote: "Beautiful engraving finish and rich wood grain texture. Exceeded expectations for promotional gifting.", rating: 5 },
  { author: "S Lal", location: "Greater Noida, Uttar Pradesh", date: "22-January-2023", product: "Promotional Keychain", quote: "One of the best promotional product manufacturers. Superb coordination, quick responses, and premium final product.", rating: 5 },
]

/**
 * Photographs of work we actually produced. Every entry is either an IndiaMART
 * listing photo or a shot from our own CDN — no stock imagery. The old Portfolio
 * page mixed seven Unsplash photos in with these and captioned the set "our
 * recent manufacturing projects"; those have been removed.
 */
export const workPhotos = [
  ...photosData.map((p) => ({ image: p.url, title: p.name, alt: p.name, category: p.category })),
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/1c8810a9aab598f2852aa43694b1e810.jpg", title: "Custom printed lanyards", alt: "Yellow polyester lanyard with custom full-colour printing and metal hardware", category: "Badges & Lanyards" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/df12dcba362d2a4018c92cdfe42fe5ea.jpg", title: "Magnetic metal badges", alt: "Set of circular magnetic metal badges in yellow and blue", category: "Badges & Lanyards" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/348f14b4519831287f42e8843fa4ccf1.png", title: "Acrylic name badges", alt: "Acrylic name badge with healthcare branding and magnetic backing", category: "Badges & Lanyards" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/bfcd631b36b72777ed9b93146eab51d1.jpg", title: "MDF wall art & signage", alt: "MDF wall-mounted clocks with printed tourism design", category: "Wall Clock" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/361faf75782d94ec7db0ed3a259f5d50.jpg", title: "Souvenir fridge magnets", alt: "Decorative souvenir magnet with I Love Haflong design featuring scenic landscape imagery", category: "Fridge Magnet" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/458febc687a80adf5b027abd1ebdf24b.jpg", title: "Promotional spinner toys", alt: "Vibrant multicolor spinner fidget toys with customizable center area for branding", category: "Custom Promotional" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/56315942c1152cce539bfd626e71bd74.jpg", title: "Flower-shaped sticky notes", alt: "Decorative flower-shaped sticky notes with colorful petals", category: "Custom Promotional" },
  { image: "https://horizons-cdn.hostinger.com/2ecad364-abc5-4474-8ebf-bf6b7ac0bd4e/01c646b1bb21e4fbef8b388744992828.jpg", title: "Novelty highlighters", alt: "Syringe-shaped highlighters with medical-themed design in bright colors", category: "Custom Promotional" },
]

/**
 * Same eight photos for every visitor on a given calendar day, rotating at
 * midnight. This is a display shuffle over a fixed archive — it is not a live
 * feed of the production floor, and the section copy must not imply that it is.
 */
export function getDailyPhotos(pool = workPhotos, count = 8) {
  const today = new Date()
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate()

  let t = seed
  function rand() {
    t = (t + 0x6d2b79f5) | 0
    let v = Math.imul(t ^ (t >>> 15), 1 | t)
    v ^= v + Math.imul(v ^ (v >>> 7), 61 | v)
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296
  }

  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}
