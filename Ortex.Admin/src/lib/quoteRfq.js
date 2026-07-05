// Helpers for enquiries that originate from the website "Get quote" RFQ builder.
//
// Those enquiries arrive with source "Quote calculator" and carry a structured
// line-item payload (JSON) in `notes`, written by Ortex.Web's QuoteCalculator:
//   { items: [{ productId, name, sku, category, unit, rate, gstRate,
//               quantity, discountPercent, lineTotal }], subtotal,
//     totalDiscount, estimatePreTax }
// These let the console show a proper quote panel and one-click generate a
// formal quotation, instead of treating the payload as opaque internal notes.

export const QUOTE_SOURCE = "Quote calculator"

export function isQuoteEnquiry(enquiry) {
  return enquiry?.source === QUOTE_SOURCE
}

// Parse the structured RFQ payload from an enquiry's notes. Returns null for
// plain enquiries or if the notes aren't the expected JSON shape.
export function parseQuoteRfq(enquiry) {
  if (!enquiry) return null
  try {
    const data = JSON.parse(enquiry.notes || "")
    if (data && Array.isArray(data.items) && data.items.length) {
      return {
        items: data.items,
        subtotal: Number(data.subtotal) || 0,
        totalDiscount: Number(data.totalDiscount) || 0,
        estimatePreTax: Number(data.estimatePreTax) || 0,
      }
    }
  } catch {
    /* not a structured RFQ payload */
  }
  return null
}

// Map RFQ items to quotation line items ({ description, hsn, quantity, rate,
// discountPercent, gstRate }). HSN isn't captured on the website, so it's pulled
// from the product master by id (then SKU); GST falls back to the master too.
export function rfqToQuotationLines(items = [], products = []) {
  return items.map((it) => {
    const match =
      products.find((p) => p.id === it.productId) ||
      (it.sku ? products.find((p) => p.sku === it.sku) : null)
    return {
      productId: it.productId || null,
      description: it.name || match?.name || "Custom item",
      hsn: match?.hsn || "",
      quantity: Number(it.quantity) || 0,
      rate: Number(it.rate) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      gstRate: it.gstRate != null ? Number(it.gstRate) : match?.gstRate ?? 18,
    }
  })
}
