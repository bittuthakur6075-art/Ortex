import { Box, Diamonds, Personalcard, Medal, ClipboardText, Gift } from "iconsax-react"
import { PRODUCTS } from "../../constants/products"
import { PRODUCT_CATEGORIES, photosForCategory } from "../../constants/categories"

const FALLBACK_IMAGE = "/img/welcome-workshop.avif"

// Real production photos per category (same source as the Work / Products
// pages), so each quote tile shows an actual product photo instead of an icon.
const CATEGORY_PHOTOS = Object.fromEntries(
  PRODUCT_CATEGORIES.map((e) => [e.category, photosForCategory(e, 12).map((p) => p.url)])
)

// Assign each static product a photo from its category, varied so products in
// the same category don't all repeat the same image.
const PRODUCT_IMAGE = (() => {
  const map = {}
  const counter = {}
  for (const p of PRODUCTS) {
    const photos = CATEGORY_PHOTOS[p.category] || []
    const i = counter[p.category] ?? 0
    counter[p.category] = i + 1
    map[p.id] = photos.length ? photos[i % photos.length] : FALLBACK_IMAGE
  }
  return map
})()

export const productImage = (p) =>
  (p.images && p.images[0]) || PRODUCT_IMAGE[p.id] || CATEGORY_PHOTOS[p.category]?.[0] || FALLBACK_IMAGE

// iconsax Bulk icon per product category (replaces the old emoji set).
const CAT_ICONS = {
  "MDF products": Box,
  "Acrylic products": Diamonds,
  "Lanyards & ID card accessories": Personalcard,
  "Badge manufacturing": Medal,
  "Examination boards": ClipboardText,
  "Corporate gifting & merchandise": Gift,
}
export const catIconComp = (name) => CAT_ICONS[name] || Box

// Today as YYYY-MM-DD in the visitor's own time zone (the date input's format).
export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Field order on the form, so a failed submit can focus the first problem.
export const FIELD_ORDER = ["name", "email", "phone", "company", "city", "neededBy"]

// Pure field validation for the buyer-details step. Returns an errors map
// keyed by field name; empty when the form is valid.
export const validateContactData = (contactData) => {
  const e = {}
  if (!contactData.name.trim()) e.name = "Name is required"
  if (!contactData.email.trim()) e.email = "Email is required"
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email.trim())) e.email = "Please enter a valid email address"
  // Any of +, spaces, dashes and brackets around 10 to 15 digits:
  // "+91 98765 43210", "098765-43210", "(022) 2345 6789".
  const digits = contactData.phone.replace(/\D/g, "")
  if (!contactData.phone.trim()) e.phone = "Phone number is required"
  else if (!/^\+?[\d\s\-()]+$/.test(contactData.phone.trim()) || digits.length < 10 || digits.length > 15) {
    e.phone = "Please enter a valid phone number"
  }
  if (contactData.neededBy && contactData.neededBy < todayISO()) e.neededBy = "Pick today or a later date"
  return e
}

// A quote can hold this many products. Each line rides three times in the
// enquiry (items, the notes payload the console reads, and the message text),
// and the database refuses an anonymous enquiry over 32 KB.
export const MAX_QUOTE_LINES = 40

// After a control removed itself (Add to quote turning into the stepper, a
// stepper stepped to zero, a removed line), focus falls to <body> and a
// keyboard user starts again from the top of the page. Put it back on the
// first control inside `container`, once React has rendered the change.
export const keepFocusIn = (container) => {
  requestAnimationFrame(() => {
    const active = document.activeElement
    if (!container || (active && active !== document.body && active.isConnected)) return
    const target = container.querySelector("input, button, [href], [tabindex]:not([tabindex='-1'])")
    target?.focus()
  })
}
