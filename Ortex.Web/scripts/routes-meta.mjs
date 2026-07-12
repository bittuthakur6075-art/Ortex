// Static-route SEO metadata, shared by scripts/prerender.mjs (which bakes it
// into dist/<route>/index.html) and scripts/check-meta.mjs (which asserts each
// title/description still matches the page's useDocumentMetadata call).
//
// These MUST mirror src/pages/*.jsx useDocumentMetadata(). check-meta enforces
// it at build time, so a drift fails `npm run build` instead of shipping stale
// metadata to crawlers.

export const STATIC_ROUTES = [
  { path: "/about", title: "About Ortex Industries - Manufacturing Excellence & Customization Expertise", description: "Learn about Ortex Industries' commitment to manufacturing excellence, complete customization capabilities, and global reach. Your trusted partner for premium customized products." },
  { path: "/products", title: "Products & Services - Ortex Industries | MDF, Acrylic, Lanyards, Badges & More", description: "Explore Ortex Industries' comprehensive range of customized products including MDF items, acrylic products, lanyards, badges, examination boards, corporate gifts, and branding services." },
  { path: "/industries", title: "Industries We Serve - Ortex Industries | Corporate, Education, Healthcare & More", description: "Ortex Industries serves diverse sectors including corporate organizations, educational institutions, government departments, hospitals, event management, and more with customized products." },
  { path: "/oem", title: "OEM & White Label Manufacturing - Ortex Industries", description: "Contract OEM and white-label manufacturing for MDF, acrylic, lanyards, badges, and corporate merchandise. Produced in-house under your brand, with factory-direct pricing and GST invoicing." },
  { path: "/work", title: "Our Work - Ortex Industries | Custom Manufacturing Gallery", description: "Browse real production photography from Ortex Industries: custom keychains, wall clocks, exam boards, badges, lanyards, fridge magnets, flags, and promotional merchandise." },
  { path: "/contact", title: "Contact Ortex Industries | Get a Custom Product Quote", description: "Get a fast, factory-direct quote for custom MDF, acrylic, lanyards, badges, and corporate gifts. Call +91-9211947188, email sales@ortexindustries.in, or WhatsApp us. PAN India delivery and worldwide export." },
  { path: "/quote", title: "Get a Quote: Custom Manufacturing RFQ | Ortex Industries", description: "Build a custom quote from Ortex Industries' real product catalogue, including MDF, acrylic, lanyards, badges, exam boards, and corporate gifts. Add products, set quantities, and get an instant bulk estimate with volume discounts." },
  { path: "/faq", title: "Frequently Asked Questions - Ortex Industries", description: "Got questions about custom manufacturing, MOQ, sampling policies, or design files? Find answers to frequently asked questions about Ortex Industries." },
  { path: "/privacy", title: "Privacy Policy - Ortex Industries", description: "Privacy Policy for Ortex Industries. Learn how we handle customer data, custom manufacturing records, and form inquiries." },
  { path: "/terms", title: "Terms of Service - Ortex Industries", description: "Terms of Service for Ortex Industries. Read our customer agreements and custom manufacturing terms." },
  { path: "/cookies", title: "Cookie Policy - Ortex Industries", description: "Cookie Policy for Ortex Industries. Learn how we use cookies and tracking technologies to improve our platform." },
  { path: "/acceptable-use", title: "Acceptable Use Policy - Ortex Industries", description: "Acceptable Use Policy for Ortex Industries. Read our rules regarding custom artwork uploads and platform use." },
]

/** Maps a route path to its page source file, for the metadata drift check. */
export const ROUTE_SOURCE = {
  "/about": "src/pages/About.jsx",
  "/products": "src/pages/Products.jsx",
  "/industries": "src/pages/Industries.jsx",
  "/oem": "src/pages/OEM.jsx",
  "/work": "src/pages/Work.jsx",
  "/contact": "src/pages/Contact.jsx",
  "/quote": "src/pages/QuoteCalculator.jsx",
  "/faq": "src/pages/FAQ.jsx",
  "/privacy": "src/pages/Privacy.jsx",
  "/terms": "src/pages/Terms.jsx",
  "/cookies": "src/pages/Cookies.jsx",
  "/acceptable-use": "src/pages/AcceptableUse.jsx",
}
