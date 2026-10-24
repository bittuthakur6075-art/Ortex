// Centralized business/site configuration for Ortex Industries.
// Single source of truth for contact details and CTA links — update values
// here rather than hard-coding them in components (mirrors the "constants/"
// layer used across Webority products).

// The public website's one address. Every canonical URL, og:url, sitemap entry
// and JSON-LD @id is built from it (index.html and public/robots.txt spell it
// out by hand, and scripts/prerender.mjs fails the build if they disagree).
// The site lives on this subdomain; www.ortexindustries.in is a separate, older
// site, so pointing canonicals there would ask Google to index that one instead.
export const SITE_URL = "https://bizgift.ortexindustries.in"

export const CONTACT = {
  phonePrimary: "+91-9211947188",
  phoneSecondary: "+91-8448663297",
  email: "sales@ortexindustries.in",
  hours: "Mon-Sat: 9:00 AM to 6:00 PM (Sunday Closed)",
}

// The factory, written the same way everywhere it appears: footer, Contact page,
// map, index.html's LocalBusiness JSON-LD and the Google Business Profile.
// Local search ranks on one consistent name-address-phone, so change all of
// them together (index.html cannot import this file).
export const ADDRESS = {
  street: "RZ-4 Mahindra Park",
  locality: "Uttam Nagar",
  city: "New Delhi",
  region: "Delhi",
  postalCode: "110059",
  country: "India",
}

export const ADDRESS_LINE = `${ADDRESS.street}, ${ADDRESS.locality}, ${ADDRESS.city}, ${ADDRESS.region} ${ADDRESS.postalCode}`

// Where Anu's call summary sends a visitor who wants a written quote. Anu's
// files are identical in Ortex.Web.Main, which has no /quote page; this is
// one of the few things that differ per site.
export const QUOTE_PATH = "/quote"

// The official Instagram account, also listed in index.html "sameAs".
export const INSTAGRAM_URL = "https://www.instagram.com/ortex_industries/"

// Digits-only number used to build WhatsApp deep links.
const WHATSAPP_NUMBER = "919211947188"

// Default pre-filled WhatsApp enquiry message.
const WHATSAPP_DEFAULT_MESSAGE =
  "Hi Ortex Industries, I would like to get a quote for customized products."

/**
 * Build a wa.me deep link with a pre-filled message.
 * @param {string} [message] - Plain text; defaults to the standard enquiry.
 * @returns {string} A fully-encoded https://wa.me/... URL.
 */
export function whatsappLink(message = WHATSAPP_DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

// Cloudflare Turnstile site key (public) for the voice assistant's bot check.
// Empty means no check: the widget loads nothing and orty-live-token, without
// its TURNSTILE_SECRET, skips the check too. `?.` because a plain node script
// (the prerender) imports this file and has no import.meta.env.
export const TURNSTILE_SITE_KEY = import.meta.env?.VITE_TURNSTILE_SITE_KEY || ""
