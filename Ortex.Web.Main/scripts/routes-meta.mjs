// Static-route SEO metadata, shared by scripts/prerender.mjs (which bakes it
// into dist/<route>/index.html) and scripts/check-meta.mjs (which asserts each
// title/description still matches the page's useDocumentMetadata call).
//
// These MUST mirror src/pages/*.jsx useDocumentMetadata(). check-meta enforces
// it at build time, so a drift fails `npm run build` instead of shipping stale
// metadata to crawlers. Titles stay under 65 characters, descriptions under 165.
// `type` is the schema.org page type and `name` the breadcrumb label, both
// written into each page's JSON-LD by prerender.mjs.

export const STATIC_ROUTES = [
  { path: "/", type: "WebPage", name: "Home", title: "Ortex Industries | Customised Products Manufacturer, Delhi", description: "Ortex Industries manufactures customised MDF, acrylic, lanyards, badges and corporate gifts in-house in Delhi, shipped PAN India and exported worldwide." },
  { path: "/about", type: "AboutPage", name: "About", title: "About Ortex Industries | In-house Custom Manufacturing", description: "Who we are, how we work and why schools, hospitals, brands and government offices across India trust Ortex Industries with their customised products." },
  { path: "/products", type: "CollectionPage", name: "Products", title: "Customised MDF, Acrylic, Lanyards & Momentos | Ortex", description: "MDF and acrylic products, lanyards and ID accessories, badges, examination boards, clipboards and corporate gifts, all branded in-house by Ortex Industries." },
  { path: "/industries", type: "WebPage", name: "Industries", title: "Custom Products for Schools, Hospitals & Offices | Ortex", description: "Customised products for corporates, schools, government departments, hospitals, events, agencies, NGOs, campaigns, retail and professional firms." },
  { path: "/portfolio", type: "CollectionPage", name: "Portfolio", title: "Portfolio: Products We Have Made | Ortex Industries", description: "Real orders from the Ortex Industries floor: printed lanyards, magnetic and acrylic badges, MDF wall clocks, souvenir magnets and promotional stationery." },
  { path: "/contact", type: "ContactPage", name: "Contact", title: "Contact Ortex Industries | Get a Quote", description: "Ask for a quote on customised MDF, acrylic, lanyards, badges and corporate gifts. Call +91-9211947188, email sales@ortexindustries.in or WhatsApp us." },
  { path: "/privacy", type: "WebPage", name: "Privacy policy", title: "Privacy Policy | Ortex Industries", description: "What Ortex Industries collects through its contact form and voice assistant on ortexindustries.in, who processes it, and how to have it deleted." },
  { path: "/terms", type: "WebPage", name: "Terms of service", title: "Terms of Service | Ortex Industries", description: "The terms for using ortexindustries.in and for quotations and customised orders with Ortex Industries, including artwork approval, payment and delivery." },
]

/** Maps a route path to its page source file, for the metadata drift check. */
export const ROUTE_SOURCE = {
  "/": "src/pages/Home.jsx",
  "/about": "src/pages/About.jsx",
  "/products": "src/pages/Products.jsx",
  "/industries": "src/pages/Industries.jsx",
  "/portfolio": "src/pages/Portfolio.jsx",
  "/contact": "src/pages/Contact.jsx",
  "/privacy": "src/pages/Privacy.jsx",
  "/terms": "src/pages/Terms.jsx",
}
