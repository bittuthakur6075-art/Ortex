// Public product catalogue for the website "Get quote" RFQ builder.
//
// Mirrors the Ortex Admin product master (Ortex.Admin/src/data/seed.js) so the
// estimates a customer sees on the site line up with the back-office pricing,
// MOQs, GST rates and lead times. Only ACTIVE products are exposed publicly.
//
// When the Supabase backend opens anonymous read access to the `products`
// table, this static list can be swapped for a live fetch — the object shape
// already matches the admin model (basePrice / moq / gstRate / hsn / …).

// Volume-discount tiers — identical to the admin pricing engine
// (Ortex.Admin/src/lib/pricing.js) so quotes and back-office documents agree.
export const VOLUME_TIERS = [
  { min: 5000, percent: 30 },
  { min: 1000, percent: 20 },
  { min: 300, percent: 10 },
  { min: 0, percent: 0 },
]

export function volumeDiscountPercent(quantity) {
  return (VOLUME_TIERS.find((t) => quantity >= t.min) || { percent: 0 }).percent
}

// Category display metadata (emoji) for the catalogue UI.
export const CATEGORY_META = {
  "MDF products": { icon: "🪵" },
  "Acrylic products": { icon: "💎" },
  "Lanyards & ID card accessories": { icon: "🎗️" },
  "Badge manufacturing": { icon: "🎖️" },
  "Examination boards": { icon: "📋" },
  "Corporate gifting & merchandise": { icon: "🎁" },
  "Clipboards & writing pads": { icon: "📝" },
}

// Active products only (the admin "draft" items are hidden from the public site).
export const PRODUCTS = [
  { id: "prod_mdf01", name: "Custom MDF Award Trophy", sku: "MDF-TRO-01", category: "MDF products", material: "9mm MDF + acrylic front plate", basePrice: 320, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 8, description: "Laser-engraved MDF trophy with acrylic front plate." },
  { id: "prod_acr01", name: "Acrylic Desk Standee", sku: "ACR-STD-01", category: "Acrylic products", material: "5mm cast acrylic, custom shape", basePrice: 210, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "UV-printed acrylic desk standee, custom shape." },
  { id: "prod_lan01", name: "Sublimation Lanyard 16mm", sku: "LAN-SUB-16", category: "Lanyards & ID card accessories", material: "Polyester + metal trigger hook", basePrice: 22, moq: 100, gstRate: 12, unit: "pcs", leadTimeDays: 5, description: "Full-colour sublimation lanyard with metal trigger hook." },
  { id: "prod_bad01", name: "Metal Name Badge (Magnet)", sku: "BAD-MAG-01", category: "Badge manufacturing", material: "Brass + magnet backing", basePrice: 85, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Engraved metal name badge with strong magnet backing." },
  { id: "prod_brd01", name: "Examination Clipboard Board", sku: "BRD-EXM-01", category: "Examination boards", material: "PVC board + clip", basePrice: 78, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "A4 examination clipboard with branded print." },
  { id: "prod_gft01", name: "Insulated Steel Bottle 750ml", sku: "GFT-BTL-750", category: "Corporate gifting & merchandise", material: "Double-wall stainless steel", basePrice: 340, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 10, description: "Double-wall insulated bottle with laser-branded logo." },
  { id: "prod_gft02", name: "Executive Diary + Pen Set", sku: "GFT-DRY-01", category: "Corporate gifting & merchandise", material: "PU leather diary + metal pen", basePrice: 265, moq: 25, gstRate: 18, unit: "set", leadTimeDays: 9, description: "A5 executive diary with metal pen in a gift box." },
]

// Categories in catalogue order (derived from PRODUCTS, de-duplicated).
export const CATEGORIES = [...new Set(PRODUCTS.map((p) => p.category))]

// Per-line pre-tax pricing: gross → volume discount → line total.
// GST is deliberately NOT applied here — the site shows an indicative pre-tax
// estimate with a "+ GST as applicable" note; the admin applies GST at quoting.
export function priceLine(product, quantity) {
  const qty = Math.max(0, Number(quantity) || 0)
  const gross = product.basePrice * qty
  const discountPercent = volumeDiscountPercent(qty)
  const discount = Math.round((gross * discountPercent) / 100)
  const total = Math.round(gross - discount)
  const unitEffective = qty > 0 ? total / qty : product.basePrice
  return { qty, unitPrice: product.basePrice, unitEffective, gross: Math.round(gross), discountPercent, discount, total }
}
