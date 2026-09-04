// Pure helpers for the Products page (filtering/sorting + CSV column sets).

// Cap images per product. Compression + upload live in lib/imageUpload.js.
export const MAX_IMAGES = 8

// Filter the product master by category + free-text query, then sort by the
// active column (margin is derived from basePrice - costPrice).
export function filterAndSortProducts(items, query, category, sort) {
  let rows = items
  if (category !== "all") rows = rows.filter((p) => p.category === category)
  const q = query.trim().toLowerCase()
  if (q) {
    rows = rows.filter((p) =>
      [p.name, p.sku, p.hsn, p.material, p.category].filter(Boolean).some((v) => v.toLowerCase().includes(q)),
    )
  }

  const { key, desc } = sort
  const sorted = [...rows].sort((a, b) => {
    let valA = a[key]
    let valB = b[key]
    if (key === "margin") {
      valA = a.basePrice - a.costPrice
      valB = b.basePrice - b.costPrice
    }
    if (valA === undefined || valA === null) valA = ""
    if (valB === undefined || valB === null) valB = ""
    if (typeof valA === "string") return valA.localeCompare(valB)
    return valA - valB
  })
  return desc ? sorted.reverse() : sorted
}

// Columns for the generic product-master CSV export.
export const PRODUCT_CSV_COLUMNS = [
  { header: "Name", value: (p) => p.name },
  { header: "SKU", value: (p) => p.sku },
  { header: "Category", value: (p) => p.category },
  { header: "HSN", value: (p) => p.hsn },
  { header: "Unit", value: (p) => p.unit },
  { header: "Base price", value: (p) => p.basePrice },
  { header: "Cost price", value: (p) => p.costPrice },
  { header: "GST %", value: (p) => p.gstRate },
  { header: "MOQ", value: (p) => p.moq },
  { header: "Status", value: (p) => p.status },
]

export const productsCsvFile = () => `ortex-products-${new Date().toISOString().slice(0, 10)}.csv`

// Columns for the IndiaMART bulk-upload sheet (paste into IndiaMART's Bulk
// Product Upload; IndiaMART has no API, so listing itself stays in their panel).
export const IM_COLUMNS = [
  { header: "Product Name", value: (p) => p.name },
  { header: "Product Description", value: (p) => p.description || p.material },
  { header: "Product Category", value: (p) => p.category },
  { header: "Price (INR)", value: (p) => p.basePrice },
  { header: "Unit", value: (p) => p.unit },
  { header: "Minimum Order Quantity", value: (p) => p.moq },
  { header: "HSN Code", value: (p) => p.hsn },
  { header: "GST %", value: (p) => p.gstRate },
  { header: "Specifications", value: (p) => p.material },
]

export const imFile = () => `indiamart-products-${new Date().toISOString().slice(0, 10)}.csv`
