import { formatCurrency, formatDate } from "./format"
import { waNumber } from "../pages/voice-leads/helpers"

// Sharing a quotation with its customer from the console: the covering message
// and the tel: / wa.me links. Pure, so the wording is tested; the PDF and the
// browser hand-off live in components/documents/documentPdf.jsx.
//
// The web cannot attach a file to a wa.me chat (wa.me carries text only), which
// is the same wall the phone hits in Ortex.Mobile/src/lib/pdf.ts. So the honest
// flow is: download the PDF, put this message on the clipboard, open the chat
// with the message typed in, and tell the person to attach the file.

const DAY_MS = 86400000

// The first word of the contact's name, for "Hello Ravi". A company-only record
// gets a plain "Hello" rather than "Hello Acme Pvt".
export function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || ""
}

// Valid-until as stored, else derived from issue date + validity days (the same
// rule updateQuotation applies), else null.
export function validUntilOf(q) {
  if (q?.validUntil) return q.validUntil
  if (q?.issueDate && q?.validityDays != null) {
    return new Date(new Date(q.issueDate).getTime() + Number(q.validityDays) * DAY_MS).toISOString()
  }
  return null
}

// The covering message. The validity clause is left out once the date has
// passed: "valid until" a day already gone is a sentence nobody should send.
export function quotationShareMessage(q, settings, { now = Date.now() } = {}) {
  const name = firstName(q?.customer?.name)
  const company = settings?.company?.name?.trim()
  const number = q?.number ? `quotation ${q.number}` : "our quotation"
  const total = formatCurrency(q?.totals?.grandTotal || 0)
  const until = validUntilOf(q)
  const live = until && new Date(until).setHours(23, 59, 59, 999) >= now
  const parts = [
    `Hello${name ? ` ${name}` : ""},`,
    `here is ${number}${company ? ` from ${company}` : ""} for ${total} including GST${live ? `, valid until ${formatDate(until)}` : ""}.`,
    "Please let us know if you have any questions.",
  ]
  return parts.join(" ")
}

// Digits a phone link can use, or "" when the record has no usable number.
export function hasPhone(phone) {
  return String(phone || "").replace(/\D/g, "").length >= 10
}

export function telLink(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "")
  return hasPhone(phone) ? `tel:${digits}` : ""
}

export function whatsappLink(phone, text = "") {
  if (!hasPhone(phone)) return ""
  const base = `https://wa.me/${waNumber(phone)}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

// What the customer's file is called when it lands in their chat.
export function quotationFileName(q) {
  return `Quotation-${q?.number || "draft"}.pdf`
}
