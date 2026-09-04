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

// Pure field validation for the buyer-details step. Returns an errors map
// keyed by field name; empty when the form is valid.
export const validateContactData = (contactData) => {
  const e = {}
  if (!contactData.name.trim()) e.name = "Name is required"
  if (!contactData.email.trim()) e.email = "Email is required"
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactData.email)) e.email = "Please enter a valid email address"
  if (!contactData.phone.trim()) e.phone = "Phone number is required"
  else if (!/^\+?[\d\s-]{10,}$/.test(contactData.phone)) e.phone = "Please enter a valid phone number"
  return e
}
