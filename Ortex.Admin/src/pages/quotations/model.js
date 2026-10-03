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

// ---- The editor (V3 builder) ----------------------------------------------

// Taxable value behind each GST rate once every discount is in, for the
// "IGST 18% on ₹1,13,896" rows. computeDocument spreads the extra discount
// over the lines by one factor; the same factor is applied here.
export function taxBases(totals) {
  const lines = totals?.lines || []
  const before = lines.reduce((s, l) => s + l.taxable, 0)
  const factor = before > 0 ? totals.taxable / before : 1
  const out = {}
  for (const l of lines) if (l.gstRate > 0) out[l.gstRate] = (out[l.gstRate] || 0) + l.taxable * factor
  return Object.fromEntries(Object.entries(out).map(([r, v]) => [r, Math.round(v * 100) / 100]))
}

// Every discount (line and extra) as a share of the subtotal, one decimal.
export function averageDiscount(totals) {
  const sub = Number(totals?.subTotal) || 0
  return sub > 0 ? Math.round(((Number(totals.totalDiscount) || 0) / sub) * 1000) / 10 : 0
}

const lineNo = (path) => {
  const m = /^lines\.(\d+)\./.exec(path)
  return m ? `Line ${Number(m[1]) + 1}: ` : ""
}

// Which field a failed pre-send check (salesWork.quoteChecks) is about.
function checkPath(key, lines, guide) {
  if (key === "customer") return "customer.name"
  if (key === "gst") return "customer.stateCode"
  if (key === "validity") return "validityDays"
  const i =
    key === "hsn" ? lines.findIndex((l) => !l.hsn || l.gstRate === "" || l.gstRate == null)
    : key === "discount" ? lines.findIndex((l) => Number(l.discountPercent) > guide)
    : -1
  if (i >= 0) return `lines.${i}.${key === "hsn" ? "hsn" : "discountPercent"}`
  return key === "hsn" ? "lines" : null
}

// "Ready to send", one list: the errors on show first (they block Create),
// then the pre-send checks, then validateDocument's warnings. Each problem
// names the field it is about, for its Fix / Review link. A check already
// said by an error is not said twice.
export function readyItems({ checks = [], errors = {}, warnings = {}, lines = [], guide = 5 }) {
  const items = Object.entries(errors).map(([path, text]) => ({ key: `e:${path}`, tone: "bad", text: lineNo(path) + text, path, act: "Fix" }))
  const said = new Set(Object.keys(errors))
  for (const c of checks) {
    const path = c.ok ? null : checkPath(c.key, lines, guide)
    if (path && said.has(path)) continue
    items.push({ key: c.key, tone: c.ok ? "ok" : c.warn ? "warn" : "bad", text: c.text, path, act: c.ok ? null : c.warn ? "Review" : path ? "Fix" : null })
  }
  for (const [path, text] of Object.entries(warnings)) {
    if (!said.has(path)) items.push({ key: `w:${path}`, tone: "warn", text: lineNo(path) + text, path, act: "Review" })
  }
  return items
}
