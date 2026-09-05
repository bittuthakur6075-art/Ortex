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

// What this product has actually done, rather than what it is. The product
// master only stores list price and cost; everything a buyer or a sales lead
// wants to know — has it sold, at what price, to whom, is it still moving — has
// to be read back out of the documents that referenced it.
//
// Cancelled invoices are excluded: they are not revenue. Quotations are counted
// whatever their status, because an unaccepted quote is still demand.
export function productAnalytics(product, quotations = [], invoices = []) {
  const lineFor = (doc) => (doc.lines || []).filter((l) => l.productId === product.id)
  const lineValue = (l) => (Number(l.quantity) || 0) * (Number(l.rate) || 0) * (1 - (Number(l.discountPercent) || 0) / 100)

  const quotes = quotations.filter((q) => lineFor(q).length)
  const orders = invoices.filter((i) => i.status !== "cancelled" && lineFor(i).length)

  let units = 0
  let revenue = 0
  const byCustomer = new Map()
  let lastOrderedAt = null

  for (const inv of orders) {
    let docUnits = 0
    let docValue = 0
    for (const l of lineFor(inv)) {
      docUnits += Number(l.quantity) || 0
      docValue += lineValue(l)
    }
    units += docUnits
    revenue += docValue

    const key = inv.customer?.company || inv.customer?.name || "Unnamed customer"
    const prev = byCustomer.get(key) || { name: key, units: 0, revenue: 0, orders: 0 }
    byCustomer.set(key, { ...prev, units: prev.units + docUnits, revenue: prev.revenue + docValue, orders: prev.orders + 1 })

    const at = inv.date || inv.createdAt
    if (at && (!lastOrderedAt || new Date(at) > new Date(lastOrderedAt))) lastOrderedAt = at
  }

  // Quoted demand that never converted is the interesting half of the funnel.
  let quotedUnits = 0
  for (const q of quotes) for (const l of lineFor(q)) quotedUnits += Number(l.quantity) || 0

  const avgRate = units ? revenue / units : 0
  const listPrice = Number(product.basePrice) || 0
  const cost = Number(product.costPrice) || 0

  return {
    quotes: quotes.length,
    orders: orders.length,
    quotedUnits,
    units,
    revenue,
    avgRate,
    // How far the realised price drifts from the list price. Negative means the
    // catalogue price is aspirational and deals are closing below it.
    realisation: listPrice && units ? (avgRate - listPrice) / listPrice : null,
    grossProfit: units ? revenue - units * cost : 0,
    unitMargin: listPrice - cost,
    marginPct: listPrice ? Math.round(((listPrice - cost) / listPrice) * 100) : 0,
    conversion: quotes.length ? Math.round((orders.length / quotes.length) * 100) : null,
    lastOrderedAt,
    topCustomers: [...byCustomer.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 4),
    recentQuotes: [...quotes].sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)).slice(0, 4),
    recentOrders: [...orders].sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0)).slice(0, 4),
  }
}
