import { quoteFollowUp, quoteStatus, validityLeft } from "../../lib/salesWork"
import { stateName } from "../../lib/gstStates"

// One quotation as the V2 list reads it, from whichever writer made it: this
// console, the phone app (same shape, no sendLog), or a lead conversion (the
// lead's customer, which may carry `city`). Pure, tested in model.test.js.

// Where the customer is: their city, else the last part of the address, else
// the GST state. Quotation customers usually have an address and a state code
// but no `city` field.
export function placeOf(c = {}) {
  const fromAddress = String(c.address || "")
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\d{6}$/.test(p)) // a bare PIN code is not a place
    .pop()
  return c.city || fromAddress || (c.stateCode && stateName(c.stateCode)) || ""
}

export function buildQuoteRow(q, { enquiries = [], invoices = [], now = Date.now() } = {}) {
  const st = quoteStatus(q, now)
  const lines = (q.lines || []).filter((l) => l.description || Number(l.quantity))
  const units = lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)
  const oneUnit = new Set(lines.map((l) => l.unit || "pcs")).size <= 1
  return {
    q,
    id: q.id,
    st,
    fu: quoteFollowUp(q, now),
    lead: q.enquiryId ? enquiries.find((e) => e.id === q.enquiryId) || null : null,
    inv: q.invoiceId ? invoices.find((i) => i.id === q.invoiceId) || null : null,
    total: Number(q.totals?.grandTotal) || 0,
    left: validityLeft(q, now),
    open: ["draft", "sent", "accepted"].includes(st),
    customer: q.customer?.company || q.customer?.name || "",
    contact: q.customer?.company ? q.customer?.name || "" : "",
    place: placeOf(q.customer),
    firstItem: lines[0]?.description || "",
    itemsSub: lines.length
      ? `${lines.length > 1 ? `+${lines.length - 1} more · ` : ""}${units.toLocaleString("en-IN")} ${oneUnit ? lines[0]?.unit || "pcs" : "units"}`
      : "No lines yet",
  }
}
