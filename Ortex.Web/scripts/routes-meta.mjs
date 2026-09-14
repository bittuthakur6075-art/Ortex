// Static-route SEO metadata, shared by scripts/prerender.mjs (which bakes it
// into dist/<route>/index.html) and scripts/check-meta.mjs (which asserts each
// title/description still matches the page's useDocumentMetadata call).
//
// These MUST mirror src/pages/*.jsx useDocumentMetadata(). check-meta enforces
// it at build time, so a drift fails `npm run build` instead of shipping stale
// metadata to crawlers.

export const STATIC_ROUTES = [
  { path: "/", title: "Ortex Industries | Custom Lanyards, Badges & Corporate Gifts", description: "Delhi manufacturer of custom MDF and acrylic products, lanyards, badges, exam boards and corporate gifts. OEM and white label, PAN India delivery and export." },
  { path: "/about", title: "About Ortex Industries | Custom Manufacturer in Delhi", description: "How Ortex Industries started, why brands across India trust us, and the in-house cutting, printing and engraving behind every order we manufacture." },
  { path: "/products", title: "Custom MDF, Acrylic, Lanyard & Badge Products | Ortex", description: "Browse Ortex Industries' custom products: MDF and acrylic items, lanyards, badges, exam boards and corporate gifts, all branded in-house with GST quotations." },
  { path: "/industries", title: "Industries We Serve | Ortex Industries", description: "Custom products for corporates, schools, universities, government departments, hospitals and event companies, manufactured in-house by Ortex Industries." },
  { path: "/oem", title: "OEM & White Label Manufacturing | Ortex Industries", description: "Contract OEM and white-label manufacturing of MDF, acrylic, lanyards, badges and merchandise, made in-house under your brand with factory-direct pricing." },
  { path: "/work", title: "Our Work: Custom Products We Made | Ortex Industries", description: "Real production photos from Ortex Industries: custom keychains, wall clocks, exam boards, badges, lanyards, fridge magnets and promotional merchandise." },
  { path: "/contact", title: "Contact Ortex Industries | Get a Custom Product Quote", description: "Get a factory-direct quote for custom MDF, acrylic, lanyards, badges and corporate gifts. Call +91-9211947188, email sales@ortexindustries.in or WhatsApp us." },
  { path: "/quote", title: "Get a Quote for Custom Products | Ortex Industries", description: "Build a request from the Ortex Industries catalogue: pick MDF, acrylic, lanyard, badge or gift products, set quantities, and receive a formal GST quotation." },
  { path: "/faq", title: "Custom Manufacturing FAQs: MOQ, Artwork | Ortex Industries", description: "Answers on minimum order quantities, samples, artwork files, materials, delivery times, OEM production and payment for custom orders at Ortex Industries." },
  { path: "/privacy", title: "Privacy Policy | Ortex Industries", description: "How Ortex Industries collects, uses and protects the information you share through our website, quote requests, enquiry forms and custom manufacturing orders." },
  { path: "/terms", title: "Terms of Service | Ortex Industries", description: "The terms that govern use of the Ortex Industries website, quote requests and custom manufacturing orders, including artwork approval, payment and delivery." },
  { path: "/cookies", title: "Cookie Policy | Ortex Industries", description: "How the Ortex Industries website uses cookies and browser storage, what each one does, and how to accept, decline or clear them at any time." },
  { path: "/acceptable-use", title: "Acceptable Use Policy | Ortex Industries", description: "Rules for using the Ortex Industries website and uploading artwork: prohibited content, trademarks and the rights you confirm when you send us a design." },
]

/** Maps a route path to its page source file, for the metadata drift check. */
export const ROUTE_SOURCE = {
  "/": "src/pages/Home.jsx",
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
