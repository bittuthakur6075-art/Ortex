// Site configuration for the main Ortex Industries website (ortexindustries.in).
// Single source of truth for contact details and links: update a value here
// rather than hard-coding it in a component. The contact details and address
// are the same as Ortex.Web/src/constants/site.js; change both together, since
// local search ranks on one consistent name, address and phone.

// Every canonical URL, og:url and sitemap entry is built from it. index.html and
// public/robots.txt spell it out by hand, and scripts/prerender.mjs fails the
// build if they disagree. bizgift.ortexindustries.in is the other Ortex site
// (Ortex.Web): never point a canonical there.
export const SITE_URL = "https://ortexindustries.in"

export const CONTACT = {
  phonePrimary: "+91-9211947188",
  phoneSecondary: "+91-8448663297",
  email: "sales@ortexindustries.in",
}

export const HOURS = [
  { days: "Monday to Saturday", time: "9:00 AM to 6:00 PM" },
  { days: "Sunday", time: "Closed" },
]

// Must match the LocalBusiness address in index.html.
export const ADDRESS = {
  street: "RZ-4 Mahindra Park",
  locality: "Uttam Nagar",
  city: "New Delhi",
  region: "Delhi",
  postalCode: "110059",
  country: "India",
}

export const ADDRESS_LINE = `${ADDRESS.street}, ${ADDRESS.locality}, ${ADDRESS.city}, ${ADDRESS.region} ${ADDRESS.postalCode}`

export const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`Ortex Industries, ${ADDRESS_LINE}`)}`

// The catalogue site, linked from the nav and footer for visitors who want to
// browse individual products and build a quote.
export const CATALOGUE_URL = "https://bizgift.ortexindustries.in"

// The official Instagram account, also listed in index.html "sameAs".
export const INSTAGRAM_URL = "https://www.instagram.com/ortex_industries/"

const WHATSAPP_NUMBER = "919211947188"
const WHATSAPP_DEFAULT_MESSAGE = "Hi Ortex Industries, I would like a quote for customised products."

/** A wa.me deep link with a pre-filled message. */
export function whatsappLink(message = WHATSAPP_DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

export const telHref = (num) => `tel:${num.replace(/[^+\d]/g, "")}`
