// Helpers for enquiries that originate from the website "Get quote" RFQ builder.
//
// PORT OF Ortex.Admin/src/lib/quoteRfq.js — keep the two in step.
//
// Those enquiries arrive with source "Quote calculator" and carry a structured
// line-item payload (JSON) in `notes`, written by Ortex.Web's QuoteCalculator:
//   { items: [{ productId, name, sku, category, unit, rate, gstRate,
//               quantity, discountPercent, lineTotal }], subtotal,
//     totalDiscount, estimatePreTax }
// These let the phone show a proper request panel and hand a complete order to
// the quotation editor, instead of treating the payload as opaque notes.

import type { Enquiry, Line, Product } from "@/domain/schema"
import { newLine } from "@/domain/schema"

export const QUOTE_SOURCE = "Quote calculator"

export type RfqItem = {
  productId?: string | null
  name?: string
  sku?: string
  category?: string
  unit?: string
  rate?: number
  gstRate?: number
  quantity?: number
  discountPercent?: number
  lineTotal?: number
}

export type Rfq = {
  items: RfqItem[]
  subtotal: number
  totalDiscount: number
  estimatePreTax: number
}

export function isQuoteEnquiry(enquiry?: Partial<Enquiry> | null): boolean {
  return enquiry?.source === QUOTE_SOURCE
}

/**
 * Parse the structured RFQ payload from an enquiry's notes. Returns null for
 * plain enquiries or if the notes aren't the expected JSON shape.
 */
export function parseQuoteRfq(enquiry?: Partial<Enquiry> | null): Rfq | null {
  if (!enquiry) return null
  try {
    const data = JSON.parse(enquiry.notes || "")
    if (data && Array.isArray(data.items) && data.items.length) {
      return {
        items: data.items as RfqItem[],
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

function findProduct(it: RfqItem, products: Product[]): Product | null {
  return (
    products.find((p) => p.id === it.productId) ||
    (it.sku ? products.find((p) => p.sku === it.sku) : null) ||
    null
  )
}

/**
 * Map RFQ items to quotation lines. HSN isn't captured on the website, so it is
 * pulled from the product master by id (then SKU).
 *
 * GST deliberately prefers the master over the payload: the website copies
 * gstRate from the same products table, so a legitimate submission always
 * matches — but enquiries accept anonymous inserts, and a forged payload setting
 * gstRate 0 would otherwise flow straight into a tax document. The payload value
 * is only a fallback for items with no master match.
 */
export function rfqToQuotationLines(items: RfqItem[] = [], products: Product[] = []): Line[] {
  return items.map((it) => {
    const match = findProduct(it, products)
    return newLine({
      productId: it.productId || null,
      description: it.name || match?.name || "Custom item",
      hsn: match?.hsn || "",
      quantity: Number(it.quantity) || 0,
      unit: it.unit || match?.unit || "pcs",
      rate: Number(match?.basePrice) || Number(it.rate) || 0,
      discountPercent: Number(it.discountPercent) || 0,
      gstRate: match?.gstRate ?? (it.gstRate != null ? Number(it.gstRate) : 18),
    })
  })
}

export type RateMismatch = { name: string; submittedRate: number; catalogRate: number | null }

/**
 * Lines whose submitted rate differs from the current catalogue price. The
 * website stamps rate = basePrice at submission time, so a mismatch means either
 * the catalogue changed since, or the payload didn't come from our quote
 * calculator — both worth a human's eyes before the rate lands on a branded
 * quotation. Items with no master match can't be checked and are reported so
 * they aren't mistaken for verified.
 */
export function rfqRateMismatches(items: RfqItem[] = [], products: Product[] = []): RateMismatch[] {
  const out: RateMismatch[] = []
  for (const it of items) {
    const match = findProduct(it, products)
    if (!match) {
      out.push({ name: it.name || "Unknown item", submittedRate: Number(it.rate) || 0, catalogRate: null })
    } else if (Math.abs((Number(it.rate) || 0) - (Number(match.basePrice) || 0)) > 0.005) {
      out.push({
        name: it.name || match.name,
        submittedRate: Number(it.rate) || 0,
        catalogRate: Number(match.basePrice) || 0,
      })
    }
  }
  return out
}

/**
 * Order summary for an RFQ, priced from the console's own product master.
 *
 * The website stopped sending rates (its payload is just items + quantities),
 * and an anonymous insert could forge them anyway, so value is always derived
 * from the catalogue. `priced` says how many lines actually matched a product,
 * so the UI can flag a partial estimate instead of showing a misleading total.
 */
export function rfqSummary(items: RfqItem[] = [], products: Product[] = []) {
  let value = 0
  let units = 0
  let priced = 0
  for (const it of items) {
    const qty = Number(it.quantity) || 0
    units += qty
    const match = findProduct(it, products)
    const rate = Number(match?.basePrice) || 0
    if (rate > 0) {
      value += rate * qty
      priced += 1
    }
  }
  return { value, units, lines: items.length, priced }
}

export type Artwork = { fileName: string; failed: boolean }

/** Artwork the customer attached in the RFQ builder, if any. */
export function rfqArtwork(enquiry?: Partial<Enquiry> | null): Artwork | null {
  try {
    const data = JSON.parse(enquiry?.notes || "")
    if (data?.artwork?.fileName) return { fileName: String(data.artwork.fileName), failed: false }
    if (data?.artworkError) return { fileName: String(data.artworkError.fileName || "artwork"), failed: true }
  } catch {
    /* plain enquiry */
  }
  return null
}

/** Total units across RFQ lines — the one honest "how big is this" number. */
export function rfqUnits(items: RfqItem[] = []): number {
  return items.reduce((n, it) => n + (Number(it.quantity) || 0), 0)
}

/**
 * Age of an enquiry in whole days, with a label and an "overdue" flag for a new
 * enquiry that has sat untouched for two days or more.
 */
export function enquiryAge(enquiry?: Partial<Enquiry> | null) {
  const stamp = enquiry?.createdAt || Date.now()
  const days = Math.max(0, Math.floor((Date.now() - new Date(stamp as string).getTime()) / 86400000))
  return {
    days,
    label: days >= 1 ? `${days} day${days === 1 ? "" : "s"} old` : "Today",
    overdue: enquiry?.status === "new" && days >= 2,
  }
}
