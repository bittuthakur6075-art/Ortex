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
  "Keychains": { icon: "🔑" },
  "Wall clocks": { icon: "🕐" },
  "Fridge magnets": { icon: "🧲" },
  "Flags & banners": { icon: "🚩" },
  "Promotional merchandise": { icon: "🧢" },
}

// Active products only (the admin "draft" items are hidden from the public site).
export const PRODUCTS = [
  // ── MDF products ─────────────────────────────────────────────────────────
  { id: "prod_mdf01", name: "Custom MDF Award Trophy", sku: "MDF-TRO-01", category: "MDF products", material: "9mm MDF + acrylic front plate", basePrice: 320, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 8, description: "Laser-engraved MDF trophy with acrylic front plate." },
  { id: "prod_mdf02", name: "MDF Exam Pad 6×9", sku: "MDF-PAD-01", category: "MDF products", material: "6mm MDF + printed laminate", basePrice: 55, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "MDF examination pad with custom UV printing. Lightweight and sturdy." },
  { id: "prod_mdf03", name: "MDF Fridge Magnet (Custom Shape)", sku: "MDF-MAG-01", category: "MDF products", material: "3mm MDF + magnet backing", basePrice: 18, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Custom-shaped MDF fridge magnet with full-colour UV printing." },

  // ── Acrylic products ─────────────────────────────────────────────────────
  { id: "prod_acr01", name: "Acrylic Desk Standee", sku: "ACR-STD-01", category: "Acrylic products", material: "5mm cast acrylic, custom shape", basePrice: 210, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "UV-printed acrylic desk standee, custom shape." },
  { id: "prod_acr02", name: "Acrylic Name Display Holder", sku: "ACR-NDH-01", category: "Acrylic products", material: "3mm clear acrylic", basePrice: 120, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Transparent acrylic name display holder for desks and counters." },
  { id: "prod_acr03", name: "Acrylic Name Card Holder", sku: "ACR-NCH-01", category: "Acrylic products", material: "3mm clear acrylic", basePrice: 95, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Clear acrylic name card holder with polished edges." },
  { id: "prod_acr04", name: "Acrylic Paper Weight", sku: "ACR-PWT-01", category: "Acrylic products", material: "Solid cast acrylic block", basePrice: 180, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Custom-moulded acrylic paper weight with embedded branding." },
  { id: "prod_acr05", name: "Acrylic Car Dashboard Idol", sku: "ACR-DSH-01", category: "Acrylic products", material: "5mm acrylic + UV print", basePrice: 150, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "Customized acrylic dashboard idol with UV-printed design." },

  // ── Keychains ────────────────────────────────────────────────────────────
  { id: "prod_key01", name: "Acrylic Keychain (Custom Shape)", sku: "KEY-ACR-01", category: "Keychains", material: "3mm acrylic + metal ring", basePrice: 15, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Custom-shaped acrylic keychain with UV printing on both sides." },
  { id: "prod_key02", name: "Corporate Gift Acrylic Keychain", sku: "KEY-ACR-02", category: "Keychains", material: "3mm acrylic + metal ring", basePrice: 18, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Premium acrylic keychain for corporate gifting with logo printing." },
  { id: "prod_key03", name: "Plain Leather Key Ring", sku: "KEY-LTR-01", category: "Keychains", material: "PU leather + metal buckle", basePrice: 45, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "Elegant plain leather keyring with debossing option for logos." },
  { id: "prod_key04", name: "Customized Logo Leather Keychain", sku: "KEY-LTR-02", category: "Keychains", material: "Genuine leather + metal ring", basePrice: 55, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Custom-branded leather keychain with hot-stamped or debossed logo." },
  { id: "prod_key05", name: "Silicone Rubber Keychain", sku: "KEY-SIL-01", category: "Keychains", material: "Food-grade silicone + steel ring", basePrice: 12, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 8, description: "Custom-moulded silicone keychain with 2D/3D raised design." },
  { id: "prod_key06", name: "T-Shirt Shaped Silicone Keychain", sku: "KEY-SIL-02", category: "Keychains", material: "Silicone + steel ring", basePrice: 14, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 8, description: "Fun T-shirt shaped silicone keychain, perfect for events and promotions." },
  { id: "prod_key07", name: "PVC Promotional Keychain", sku: "KEY-PVC-01", category: "Keychains", material: "Soft PVC + metal ring", basePrice: 10, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Custom soft PVC keychain with detailed embossed design and vibrant colours." },
  { id: "prod_key08", name: "Satin Printed Key Chain", sku: "KEY-SAT-01", category: "Keychains", material: "Satin ribbon + metal clasp", basePrice: 8, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Lightweight satin ribbon keychain with full-colour sublimation printing." },

  // ── Lanyards & ID card accessories ───────────────────────────────────────
  { id: "prod_lan01", name: "Sublimation Lanyard 16mm", sku: "LAN-SUB-16", category: "Lanyards & ID card accessories", material: "Polyester + metal trigger hook", basePrice: 22, moq: 100, gstRate: 12, unit: "pcs", leadTimeDays: 5, description: "Full-colour sublimation lanyard with metal trigger hook." },
  { id: "prod_lan02", name: "Satin Printed Lanyard 20mm", sku: "LAN-SAT-20", category: "Lanyards & ID card accessories", material: "Satin ribbon + safety breakaway", basePrice: 28, moq: 100, gstRate: 12, unit: "pcs", leadTimeDays: 5, description: "Premium satin lanyard with full-colour heat sublimation printing and safety breakaway hook." },

  // ── Badge manufacturing ──────────────────────────────────────────────────
  { id: "prod_bad01", name: "Metal Name Badge (Magnet)", sku: "BAD-MAG-01", category: "Badge manufacturing", material: "Brass + magnet backing", basePrice: 85, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Engraved metal name badge with strong magnet backing." },
  { id: "prod_bad02", name: "Plastic Safety Pin Badge", sku: "BAD-PLS-01", category: "Badge manufacturing", material: "Moulded plastic + safety pin", basePrice: 8, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Custom moulded plastic badge with safety pin backing for events and campaigns." },
  { id: "prod_bad03", name: "Button Badge (Round, Custom Print)", sku: "BAD-BTN-01", category: "Badge manufacturing", material: "Tinplate + pin backing", basePrice: 6, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 4, description: "Custom printed round button badge, ideal for promotional campaigns and elections." },
  { id: "prod_bad04", name: "Lotus Plastic Lighting Badge", sku: "BAD-LED-01", category: "Badge manufacturing", material: "Plastic + LED module + battery", basePrice: 22, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 8, description: "Light-up lotus-shaped plastic badge with LED illumination." },

  // ── Wall clocks ──────────────────────────────────────────────────────────
  { id: "prod_clk01", name: "8 Inch Round Wall Clock", sku: "CLK-RND-08", category: "Wall clocks", material: "Plastic frame + quartz movement", basePrice: 180, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Branded 8-inch round wall clock with custom dial printing." },
  { id: "prod_clk02", name: "7.5 Inch Square Wall Clock", sku: "CLK-SQR-75", category: "Wall clocks", material: "Plastic frame + quartz movement", basePrice: 195, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Promotional 7.5-inch square wall clock with custom branding." },
  { id: "prod_clk03", name: "15 Inch Designer Promotional Wall Clock", sku: "CLK-DES-15", category: "Wall clocks", material: "Plastic/wood frame + quartz movement", basePrice: 450, moq: 10, gstRate: 18, unit: "pcs", leadTimeDays: 10, description: "Large 15-inch designer promotional wall clock for corporate gifting." },
  { id: "prod_clk04", name: "Premium Wooden Wall Clock", sku: "CLK-WOD-01", category: "Wall clocks", material: "Natural wood + CNC routed + quartz", basePrice: 550, moq: 10, gstRate: 18, unit: "pcs", leadTimeDays: 12, description: "Premium CNC-routed wooden wall clock with elegant promotional finish." },
  { id: "prod_clk05", name: "Acrylic Fancy Wall Clock", sku: "CLK-ACR-01", category: "Wall clocks", material: "5mm acrylic + quartz movement", basePrice: 280, moq: 20, gstRate: 18, unit: "pcs", leadTimeDays: 8, description: "Custom acrylic wall clock with UV printing and laser-cut design." },

  // ── Examination boards ───────────────────────────────────────────────────
  { id: "prod_brd01", name: "Examination Clipboard Board (PVC)", sku: "BRD-EXM-01", category: "Examination boards", material: "PVC board + clip", basePrice: 78, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "A4 examination clipboard with branded print." },
  { id: "prod_brd02", name: "Foldable Storage Exam Board", sku: "BRD-FLD-01", category: "Examination boards", material: "PP + storage compartment", basePrice: 110, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Foldable exam board with built-in storage compartment for stationery." },
  { id: "prod_brd03", name: "MDF Exam Clipboard 6×9", sku: "BRD-MDF-01", category: "Examination boards", material: "6mm MDF + metal clip", basePrice: 65, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "Durable MDF exam clipboard with metal clip and custom print on both sides." },

  // ── Fridge magnets ───────────────────────────────────────────────────────
  { id: "prod_mag01", name: "Custom MDF Fridge Magnet", sku: "MAG-MDF-01", category: "Fridge magnets", material: "3mm MDF + rubber magnet", basePrice: 18, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Custom UV-printed MDF fridge magnet in any shape." },
  { id: "prod_mag02", name: "Acrylic Fridge Magnet", sku: "MAG-ACR-01", category: "Fridge magnets", material: "3mm acrylic + rubber magnet", basePrice: 22, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Transparent acrylic fridge magnet with custom UV printing." },
  { id: "prod_mag03", name: "PVC Fridge Magnet", sku: "MAG-PVC-01", category: "Fridge magnets", material: "Soft PVC + rubber magnet", basePrice: 15, moq: 200, gstRate: 18, unit: "pcs", leadTimeDays: 7, description: "Soft PVC fridge magnet with 2D/3D embossed design." },
  { id: "prod_mag04", name: "Wooden Fridge Magnet", sku: "MAG-WOD-01", category: "Fridge magnets", material: "Natural wood + rubber magnet", basePrice: 25, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "Natural wood fridge magnet with laser engraving and colour printing." },

  // ── Clipboards & writing pads ────────────────────────────────────────────
  { id: "prod_clp01", name: "Customize Exam Clip Board (A4)", sku: "CLP-EXM-01", category: "Clipboards & writing pads", material: "3mm MDF + spring clip", basePrice: 85, moq: 50, gstRate: 18, unit: "pcs", leadTimeDays: 6, description: "A4 MDF clipboard with spring clip and custom branding on front and back." },

  // ── Corporate gifting & merchandise ──────────────────────────────────────
  { id: "prod_gft01", name: "Insulated Steel Bottle 750ml", sku: "GFT-BTL-750", category: "Corporate gifting & merchandise", material: "Double-wall stainless steel", basePrice: 340, moq: 25, gstRate: 18, unit: "pcs", leadTimeDays: 10, description: "Double-wall insulated bottle with laser-branded logo." },
  { id: "prod_gft02", name: "Executive Diary + Pen Set", sku: "GFT-DRY-01", category: "Corporate gifting & merchandise", material: "PU leather diary + metal pen", basePrice: 265, moq: 25, gstRate: 18, unit: "set", leadTimeDays: 9, description: "A5 executive diary with metal pen in a gift box." },

  // ── Flags & banners ──────────────────────────────────────────────────────
  { id: "prod_flg01", name: "Custom Printed Flag (3×5 ft)", sku: "FLG-CUS-01", category: "Flags & banners", material: "Polyester knitted fabric", basePrice: 65, moq: 50, gstRate: 12, unit: "pcs", leadTimeDays: 5, description: "Custom printed polyester flag, 3×5 feet, with double-side printing option." },
  { id: "prod_flg02", name: "Party / Election Flag (2×3 ft)", sku: "FLG-PTY-01", category: "Flags & banners", material: "Polyester knitted fabric + wooden stick", basePrice: 25, moq: 200, gstRate: 12, unit: "pcs", leadTimeDays: 4, description: "Small party/election flag on wooden stick with custom print." },

  // ── Promotional merchandise ──────────────────────────────────────────────
  { id: "prod_prm01", name: "Promotional Cotton Cap", sku: "PRM-CAP-01", category: "Promotional merchandise", material: "Cotton twill + buckle closure", basePrice: 60, moq: 50, gstRate: 12, unit: "pcs", leadTimeDays: 6, description: "Custom branded cotton cap with embroidery or printing." },
  { id: "prod_prm02", name: "Sublimation Mobile Popsocket", sku: "PRM-POP-01", category: "Promotional merchandise", material: "ABS + sublimation top", basePrice: 25, moq: 100, gstRate: 18, unit: "pcs", leadTimeDays: 5, description: "Custom sublimation-printed mobile popsocket for promotional use." },
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

