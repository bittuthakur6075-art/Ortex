// Centralized business/site configuration for Ortex Industries.
// Single source of truth for contact details and CTA links — update values
// here rather than hard-coding them in components (mirrors the "constants/"
// layer used across Webority products).

export const CONTACT = {
  phonePrimary: "+91-9211947188",
  phoneSecondary: "+91-8448663297",
  email: "sales@ortexindustries.in",
  hours: "Mon-Sat: 9:00 AM to 6:00 PM (Sunday Closed)",
}

// Digits-only number used to build WhatsApp deep links.
export const WHATSAPP_NUMBER = "919211947188"

// Default pre-filled WhatsApp enquiry message.
export const WHATSAPP_DEFAULT_MESSAGE =
  "Hi Ortex Industries, I would like to get a quote for customized products."

/**
 * Build a wa.me deep link with a pre-filled message.
 * @param {string} [message] - Plain text; defaults to the standard enquiry.
 * @returns {string} A fully-encoded https://wa.me/... URL.
 */
export function whatsappLink(message = WHATSAPP_DEFAULT_MESSAGE) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}
