// Everything the main site says, kept in one place so a page never states a
// fact differently from another. The site is fully static: change a line here,
// rebuild and upload. Product photos live in public/img/portfolio (WebP).
//
// STATS lives in ./business.js, a byte-for-byte copy of Ortex.Web's (checked by
// scripts/check-anu-mirror.mjs), because Anu quotes the same figures aloud. The
// Horizons site showed invented figures ("2,847 organisations", "47.2% repeat
// clients"); keep these to the numbers the business stands behind.
export { STATS } from "./business.js"

/** The three pillars under the home hero and on About. */
export const PILLARS = [
  {
    key: "manufacturing",
    title: "In-house manufacturing",
    description: "Cutting, printing, engraving and packing all happen on our own floor in Delhi, so quality is checked at every step rather than at the end.",
  },
  {
    key: "customisation",
    title: "Complete customisation",
    description: "Size, shape, material, colour and finish are all yours to choose. We build to your artwork, never squeeze it into a stock template.",
  },
  {
    key: "reach",
    title: "PAN India and export",
    description: "Tracked dispatch to every state and union territory, and export orders packed and documented for customs.",
  },
]

/** "Why choose us" on Home: the three reasons buyers give. */
export const REASONS = [
  {
    title: "One floor, start to finish",
    description: "From raw sheet to sealed carton, your order never leaves our facility. One team owns the cut, the print and the pack, so the finish matches the proof you approved.",
    image: "/img/build-manufacturing.avif",
  },
  {
    title: "Branding the way you want it",
    description: "UV printing, laser engraving, sublimation and embossing under one roof, on MDF, acrylic, metal, fabric and plastic. Mix methods on one product when the design needs it.",
    image: "/img/build-customization.avif",
  },
  {
    title: "Factory-direct pricing",
    description: "No middlemen and no outsourcing mark-up. You pay manufacturer rates with GST invoicing, whether the order is fifty pieces or fifty thousand.",
    image: "/img/build-pricing.avif",
  },
]

/** The six capability cards on Home. Icons are mapped in the page. */
export const CAPABILITIES = [
  { icon: "oem", title: "OEM and white label", description: "Products manufactured under your brand name, with your packaging and your specifications." },
  { icon: "bulk", title: "Bulk production", description: "Capacity for orders of any size, with the same finish on the last piece as on the first." },
  { icon: "quality", title: "Quality checked", description: "Every batch is inspected against the approved proof before it is packed." },
  { icon: "pricing", title: "Competitive pricing", description: "Direct manufacturing keeps costs low without cutting corners on material." },
  { icon: "speed", title: "Fast turnaround", description: "Dedicated production lines keep most orders moving from approval to dispatch in days." },
  { icon: "export", title: "Export support", description: "Export packing, documentation and freight coordination for buyers outside India." },
]

/**
 * The eight product families. `slug` anchors each card on /products; `short`
 * is the footer label, which must fit on one line (RollText cannot wrap).
 */
export const PRODUCTS = [
  {
    slug: "mdf-products",
    icon: "mdf",
    title: "MDF products",
    description: "Fridge magnets, keychains, photo frames, name plates, wall clocks and desk accessories, cut to any shape and printed in full colour.",
  },
  {
    slug: "acrylic-products",
    icon: "acrylic",
    title: "Acrylic products",
    description: "Crystal-clear keychains, badges, name plates, display stands and signage, finished with UV printing or laser engraving.",
  },
  {
    slug: "lanyards",
    icon: "lanyard",
    title: "Lanyards and ID accessories",
    short: "Lanyards and ID",
    description: "Polyester, satin and woven lanyards with custom printing, plus ID cards, card holders and access passes to match.",
  },
  {
    slug: "badges",
    icon: "badge",
    title: "Badges",
    description: "Acrylic, magnetic, button, metal and plastic badges for staff, events, schools and promotions.",
  },
  {
    slug: "examination-boards",
    icon: "board",
    title: "Examination boards",
    description: "Durable acrylic, PVC and ABS exam boards, including models with storage compartments, made for schools and colleges.",
  },
  {
    slug: "clipboards",
    icon: "clipboard",
    title: "Clipboards and writing pads",
    short: "Clipboards",
    description: "Branded clipboards and writing pads in a range of sizes and materials for offices, events and institutions.",
  },
  {
    slug: "corporate-gifts",
    icon: "gift",
    title: "Corporate gifts and merchandise",
    short: "Corporate gifts",
    description: "Branded pens, diaries, bottles, mugs, power banks and complete gift sets, assembled and dispatched together.",
  },
  {
    slug: "branding-services",
    icon: "brush",
    title: "Customisation and branding",
    short: "Branding services",
    description: "UV printing, laser engraving, sublimation and embossing on your products or ours, with artwork help when you need it.",
  },
]

/** Product interest options on the contact form (the console groups by these). */
export const ENQUIRY_CATEGORIES = [...PRODUCTS.map((p) => p.title), "Something else"]

/** The branding methods section on /products. */
export const METHODS = [
  {
    title: "UV printing",
    description: "Vivid, durable full-colour prints on acrylic, MDF, wood and plastic, including white ink on clear material.",
  },
  {
    title: "Laser engraving",
    description: "Precise, permanent marks on metal, acrylic and wood, ideal for names, serial numbers and fine logos.",
  },
  {
    title: "Sublimation and embossing",
    description: "Edge-to-edge sublimation for lanyards and fabric, and raised embossing for diaries, leather and premium gifts.",
  },
]

/** The ten sectors on /industries. */
export const INDUSTRIES = [
  { icon: "corporate", title: "Corporate organisations", description: "Employee ID cards, badges, lanyards, desk accessories and branded gifts for teams of every size." },
  { icon: "education", title: "Schools and universities", description: "Student ID cards, examination boards, name plates, badges, lanyards and customised stationery." },
  { icon: "government", title: "Government departments", description: "Official ID cards, badges, lanyards and name plates for offices and public sector bodies." },
  { icon: "health", title: "Hospitals and healthcare", description: "Staff ID cards, name badges, lanyards and signage, plus medical-themed promotional items." },
  { icon: "events", title: "Events and exhibitions", description: "Delegate badges, lanyards, passes and giveaways for conferences, expos and corporate events." },
  { icon: "agency", title: "Marketing agencies", description: "Promotional products and branded merchandise produced to your client's brief and deadline." },
  { icon: "ngo", title: "NGOs and non-profits", description: "Volunteer badges, ID cards, lanyards and merchandise for fundraising and awareness drives." },
  { icon: "campaign", title: "Campaigns and associations", description: "Badges, flags, promotional merchandise and printed items for campaigns and member drives." },
  { icon: "retail", title: "Retail businesses", description: "Staff badges, display stands, packaging accessories and loyalty programme merchandise." },
  { icon: "services", title: "Professional services", description: "Name plates, office accessories and client gifts for consultancies, firms and practices." },
]

/** Brands whose orders appear in the portfolio. */
export const CLIENTS = ["TNQ Foundation", "Medinetix Diagnostic", "Manipal Academy", "RR Healthcare", "Brainly Bee", "Meghalaya Tourism"]

/**
 * Real orders, photographed on the Ortex floor. The Horizons site mixed these
 * with stock photos and filed them under eight overlapping category names; the
 * stock entries are gone and every item uses one of PORTFOLIO_CATEGORIES.
 */
export const PORTFOLIO_CATEGORIES = ["Lanyards and badges", "MDF and souvenirs", "Promotional stationery"]

export const PORTFOLIO = [
  {
    image: "tnq-foundation-lanyard",
    title: "Printed polyester lanyard for TNQ Foundation",
    category: "Lanyards and badges",
    description: "Yellow polyester lanyard printed in full colour with TNQ Foundation branding, finished with metal hardware and a safety breakaway clip.",
  },
  {
    image: "brainly-bee-magnetic-badge",
    title: "Magnetic metal badge for Brainly Bee",
    category: "Lanyards and badges",
    description: "Metal name badge with a magnetic back, so it holds firmly without pinning through clothing.",
  },
  {
    image: "medinetix-acrylic-badge",
    title: "Acrylic name badge for Medinetix Diagnostic",
    category: "Lanyards and badges",
    description: "UV-printed acrylic badge carrying the Medinetix logo, with a magnetic back for clinic and lab staff.",
  },
  {
    image: "meghalaya-mdf-wall-clock",
    title: "MDF wall clock with a Meghalaya design",
    category: "MDF and souvenirs",
    description: "Wall clock in MDF, UV-printed with a Meghalaya landscape and sealed with a protective finish, made for tourism offices and souvenirs.",
  },
  {
    image: "haflong-souvenir-magnet",
    title: "I Love Haflong souvenir magnet",
    category: "MDF and souvenirs",
    description: "Custom-shaped souvenir fridge magnet printed in full colour for a tourism destination.",
  },
  {
    image: "manipal-academy-syringe-pens",
    title: "Branded syringe pens for Manipal Academy",
    category: "Promotional stationery",
    description: "Syringe-shaped pens in red, blue, brown and green, printed in white with the Manipal Academy of Higher Education logo.",
  },
  {
    image: "rr-healthcare-syringe-pens",
    title: "Branded syringe pens for RR Healthcare",
    category: "Promotional stationery",
    description: "Medical-themed syringe pens carrying RR Healthcare branding, made as giveaways for doctors and clinics.",
  },
  {
    image: "syringe-pens",
    title: "Syringe pens in six colours",
    category: "Promotional stationery",
    description: "Syringe-style pens with measurement markings in blue, yellow, green, red, purple and pink, ready for logo printing.",
  },
  {
    image: "syringe-highlighters",
    title: "Syringe highlighters",
    category: "Promotional stationery",
    description: "Highlighters shaped like syringes, a favourite with pharmaceutical brands and medical students.",
  },
  {
    image: "pill-highlighters",
    title: "Capsule highlighters",
    category: "Promotional stationery",
    description: "Red and white capsule-shaped highlighters with a comfortable grip, made for pharma promotions.",
  },
  {
    image: "candy-highlighters",
    title: "Candy-wrapper highlighters",
    category: "Promotional stationery",
    description: "Highlighters dressed as wrapped sweets in green, yellow, orange, blue and pink.",
  },
  {
    image: "candy-lip-balm",
    title: "Candy-wrapper lip balm",
    category: "Promotional stationery",
    description: "Lip balm in a sweet-wrapper case with a twist-off cap, a popular gift-set filler.",
  },
  {
    image: "precision-ink-pens",
    title: "Precision ink pens",
    category: "Promotional stationery",
    description: "Fine-tip pens with scale markings on coloured barrels, for technical and medical writing.",
  },
  {
    image: "spinner-fidget-toys",
    title: "Spinner fidget toys",
    category: "Promotional stationery",
    description: "Multicolour spinners with a centre panel for your logo, built for giveaways and events.",
  },
  {
    image: "wheel-spinners",
    title: "Segmented wheel spinners",
    category: "Promotional stationery",
    description: "Colour-wheel spinners with a white centre for branding, used as promotional and teaching aids.",
  },
  {
    image: "flower-sticky-notes",
    title: "Flower-shaped sticky notes",
    category: "Promotional stationery",
    description: "Sticky-note pads in the shape of a flower with five coloured petals, for desks and giveaways.",
  },
]

/** Full-size photo (lightbox, sitemap) and the 640px square crop used by grids. */
export const portfolioImage = (name) => `/img/portfolio/${name}.webp`
export const portfolioThumb = (name) => `/img/portfolio/thumb/${name}.webp`

/**
 * Buyer questions shown on /contact and emitted as FAQPage JSON-LD by
 * scripts/prerender.mjs. The facts (minimums, GST, dispatch window, quote
 * time) are those of Ortex.Web/src/constants/business.js; change both together.
 */
export const FAQ = [
  {
    q: "How do I get a price?",
    a: "Send your requirement through the form above, on WhatsApp or by email. Prices depend on the product, material, quantity and finish, so we reply with a written GST quotation, usually within one working day.",
  },
  {
    q: "What is the minimum order quantity?",
    a: "It depends on the product. Wall clocks start at 10 pieces; acrylic paperweights, examination boards and corporate gifts at 25; keychains, badges, clipboards and MDF products at 50; lanyards and fridge magnets at 100; and moulded silicone, PVC and satin items at 200.",
  },
  {
    q: "How long does an order take?",
    a: "Most orders dispatch in about 4 to 12 working days after you approve the proof, depending on the product, quantity and finish. Your quotation confirms the date for your order.",
  },
  {
    q: "Will I see a proof before production?",
    a: "Always. We send a digital mockup for your approval, and production starts only once you approve it. A physical sample can be made on request.",
  },
  {
    q: "What artwork files do you need?",
    a: "Vector files work best: AI, CDR, EPS, PDF or SVG. High-resolution PNG or JPG files are also fine, and our team can redraw or tidy up a logo if you do not have print-ready artwork.",
  },
  {
    q: "Do you provide a GST invoice?",
    a: "Yes, every order comes with a GST invoice. Most products are billed at 18% GST, while lanyards, flags and caps are billed at 12%.",
  },
  {
    q: "Do you deliver outside Delhi and outside India?",
    a: "Yes. We dispatch across India with tracking through courier and freight partners, and handle export packing and documentation for international orders.",
  },
]

/** The owner's note on About. Mirrors founderNote in Ortex.Web/src/constants/founder.js. */
export const FOUNDER = {
  name: "Louis Sharma",
  title: "Owner, Ortex Industries",
  paragraphs: [
    "Every order that leaves our floor carries someone else's name, and we never forget that.",
    "When a school trusts us with its exam boards, or a hospital with the badges its staff wear every day, we are holding a small piece of their reputation. That is why everything is made in-house, why you see and approve a proof before a single piece is cut, and why every quotation is clear and every order comes with a GST invoice. No surprises in between.",
    "We are a manufacturer that picks up the phone. If something is not right, tell us and we will make it right. Thank you for considering Ortex Industries. We would love to make something you are proud to hand out."
  ],
}
