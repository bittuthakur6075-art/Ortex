// Domain layer, business operations that span collections. Components call
// these instead of poking the repository directly, so invariants (document
// numbering, quote→invoice conversion, payment reconciliation, GST split) live
// in one place.

import { repo } from "../store/repository"
import { computeDocument } from "../../lib/pricing"
import { documentNumber, uid } from "../../lib/id"
import { round2 } from "../../lib/format"
import { stageProbability } from "./schema"
import { notifyInvoiceCreated } from "../../services/notify"
import { nationalDigits } from "../../lib/validateCustomer"
import { hasSupabase } from "../store/supabaseClient"
import { paidForInvoice, resolveInvoiceStatus } from "../../lib/invoiceMoney"
import { companyForCreate } from "../../lib/roles"
import { companyState } from "../store/company"

// The company a new record is raised for (0075): the one it names, else the
// current company. "Choose a company" in All mode; undefined before 0075, so
// the database default applies and nothing changes.
export function companyForNew(companyId) {
  const view = companyState.get()
  return companyForCreate(companyId || view.defaultCompany, view.on)
}
const withCompany = (companyId) => (companyId ? { companyId } : {})

export {
  SETTLE_TOLERANCE,
  isSettled,
  paidByInvoice,
  paidForInvoice,
  invoiceBalance,
  resolveInvoiceStatus,
  outstandingBalance,
  paymentsOrStored,
  receiptAllocation,
} from "../../lib/invoiceMoney"

// Intra-state (CGST+SGST) vs inter-state (IGST) is decided by comparing the
// customer's state code to the company's registered state code.
export function isInterState(companyStateCode, customerStateCode) {
  if (!customerStateCode) return false
  return String(companyStateCode).trim() !== String(customerStateCode).trim()
}

const FALLBACK_PREFIX = { quotation: "QTN", invoice: "INV", payment: "PAY" }

// Reserve the next human-facing document number for a series and bump its
// counter. Prefix comes from settings so the business can rebrand references.
async function generateNumber(series, companyId) {
  const settings = await repo.getSettings(companyId)
  const seq = await repo.nextSequence(series, companyId)
  // A blank prefix falls back to the phone's (Ortex.Mobile/src/lib/payments.ts).
  const prefix = String(settings.numbering?.[`${series}Prefix`] ?? "").trim() || FALLBACK_PREFIX[series] || series.toUpperCase()
  return documentNumber(prefix, seq)
}

// GST place of supply for goods follows the ship-to (consignee) location when
// one is given, otherwise the bill-to customer.
export function placeOfSupplyState(customer, shipTo) {
  return shipTo?.stateCode?.trim() ? shipTo.stateCode : customer?.stateCode
}

function totalsFor(lines, settings, customer, extraDiscountPercent = 0, shipTo = null) {
  return computeDocument(lines, {
    interState: isInterState(settings.company.stateCode, placeOfSupplyState(customer, shipTo)),
    extraDiscountPercent,
  })
}

// ---- quotations ------------------------------------------------------------

export async function createQuotation(draft) {
  const companyId = companyForNew(draft.companyId)
  const settings = await repo.getSettings(companyId)
  const number = await generateNumber("quotation", companyId)
  const issueDate = draft.issueDate || new Date().toISOString()
  const validityDays = draft.validityDays ?? settings.quotation.validityDays
  const validUntil = new Date(new Date(issueDate).getTime() + validityDays * 86400000).toISOString()
  const totals = totalsFor(draft.lines || [], settings, draft.customer, draft.extraDiscountPercent, draft.shipTo)

  await upsertCustomer(draft.customer, companyId)
  return repo.create("quotations", {
    ...withCompany(companyId),
    number,
    status: "draft",
    customer: draft.customer,
    shipTo: draft.shipTo || null,
    lines: draft.lines || [],
    extraDiscountPercent: draft.extraDiscountPercent || 0,
    paymentTerms: draft.paymentTerms || "",
    totals,
    issueDate,
    validUntil,
    validityDays,
    notes: draft.notes || "",
    terms: draft.terms ?? settings.quotation.terms,
    enquiryId: draft.enquiryId || null,
    leadId: draft.leadId || null,
    lostReason: "",
    // WHO QUOTED IT, captured at creation rather than resolved when the PDF is
    // built: the document is printed later, often by someone else opening the
    // record, so "the signed-in user" would name the wrong person on a sheet
    // that has already been sent. `showSeller` is the rep's choice to print it.
    // MIRRORED in Ortex.Mobile/src/domain/quotations.ts — edit both sides.
    sellerName: draft.sellerName || "",
    showSeller: draft.showSeller !== false,
  })
}

export async function updateQuotation(id, patch) {
  const existing = await repo.get("quotations", id)
  if (!existing) return null
  const settings = await repo.getSettings(existing.companyId)
  const merged = { ...existing, ...patch }
  // Recompute totals whenever lines / discount / customer / ship-to change.
  const totals = totalsFor(merged.lines || [], settings, merged.customer, merged.extraDiscountPercent, merged.shipTo)
  // The validity end date follows the issue date and the validity days, the same
  // way it was derived at creation. Without this, editing the days left the old
  // date on the PDF. MIRRORED in Ortex.Mobile/src/domain/quotations.ts.
  const validUntil =
    merged.issueDate && merged.validityDays != null
      ? new Date(new Date(merged.issueDate).getTime() + merged.validityDays * 86400000).toISOString()
      : merged.validUntil
  return repo.update("quotations", id, { ...patch, totals, validUntil })
}

// ---- quotation -> invoice --------------------------------------------------

export async function convertQuotationToInvoice(quotationId) {
  const q = await repo.get("quotations", quotationId)
  if (!q) return null
  // The invoice belongs to the quotation's company, whatever the console shows.
  const companyId = q.companyId || companyForNew()
  const settings = await repo.getSettings(companyId)

  // Idempotency: if this quotation was already converted, return the existing
  // invoice instead of minting a second invoice number / duplicate invoice
  // (e.g. a double-click before the status flip hides the button).
  if (q.invoiceId) {
    const existing = await repo.get("invoices", q.invoiceId)
    if (existing) return { ...existing, _notify: { skipped: true } }
  }

  const number = await generateNumber("invoice", companyId)
  const issueDate = new Date().toISOString()
  const dueDate = new Date(Date.now() + 15 * 86400000).toISOString()
  const totals = totalsFor(q.lines, settings, q.customer, q.extraDiscountPercent, q.shipTo)

  const invoice = await repo.create("invoices", {
    ...withCompany(companyId),
    number,
    status: "sent",
    customer: q.customer,
    shipTo: q.shipTo || null,
    lines: q.lines,
    extraDiscountPercent: q.extraDiscountPercent || 0,
    paymentTerms: q.paymentTerms || "",
    totals,
    issueDate,
    dueDate,
    notes: q.notes || "",
    // The invoice's own terms, not the quotation's conditions (its payment terms carry over above).
    terms: settings.documents.invoiceTerms,
    quotationId: q.id,
    quotationNumber: q.number,
    amountPaid: 0,
  })

  await repo.update("quotations", quotationId, { status: "invoiced", invoiceId: invoice.id })
  // Email a copy (mailto or EmailJS per settings). `_notify` is transient, the
  // caller reads it to toast; it is not persisted on the invoice.
  const _notify = await notifyInvoiceCreated(invoice, settings)
  return { ...invoice, _notify }
}

export async function createInvoice(draft) {
  const companyId = companyForNew(draft.companyId)
  const settings = await repo.getSettings(companyId)
  const number = draft.number || await generateNumber("invoice", companyId)
  const issueDate = draft.issueDate || new Date().toISOString()
  const dueDate = draft.dueDate || draft.dueDate === null ? draft.dueDate : new Date(Date.now() + 15 * 86400000).toISOString()
  const totals = draft.totals || totalsFor(draft.lines || [], settings, draft.customer, draft.extraDiscountPercent, draft.shipTo)
  await upsertCustomer(draft.customer, companyId)
  const invoice = await repo.create("invoices", {
    ...withCompany(companyId),
    number,
    status: draft.status || "draft",
    customer: draft.customer,
    shipTo: draft.shipTo || null,
    lines: draft.lines || [],
    extraDiscountPercent: draft.extraDiscountPercent || 0,
    paymentTerms: draft.paymentTerms || "",
    totals,
    issueDate,
    dueDate,
    notes: draft.notes || "",
    terms: draft.terms ?? settings.documents.invoiceTerms,
    quotationId: draft.quotationId || null,
    amountPaid: 0,
    tally: draft.tally || null,
  })
  // Drafts aren't "generated" yet, only email when issued as sent/final.
  const _notify = invoice.status === "draft" || draft.tally ? { skipped: true } : await notifyInvoiceCreated(invoice, settings)
  return { ...invoice, _notify }
}

// Manually (re)send the invoice email, used by the "Email copy" button.
export async function emailInvoice(invoiceId) {
  const invoice = await repo.get("invoices", invoiceId)
  if (!invoice) return { error: "Invoice not found" }
  const settings = await repo.getSettings(invoice.companyId)
  // Force-send even if the global toggle is off, since this is an explicit action.
  return notifyInvoiceCreated(invoice, { ...settings, notifications: { ...settings.notifications, invoiceEmailEnabled: true } })
}

// What an edit may never write: the payment-derived fields (migration 0066's
// trigger owns them; a form holds a stale copy) and the list's `_`-prefixed
// view fields, and `tally`, which the connector owns (a form's copy may be
// older than its last sync). The status chips write `status` on their own.
export function editableInvoicePatch(patch) {
  const out = {}
  for (const [k, v] of Object.entries(patch || {})) {
    if (k.startsWith("_") || ["status", "amountPaid", "paidAt", "tally"].includes(k)) continue
    out[k] = v
  }
  return out
}

export async function updateInvoice(id, patch) {
  const existing = await repo.get("invoices", id)
  if (!existing) return null
  const settings = await repo.getSettings(existing.companyId)
  const safe = editableInvoicePatch(patch)
  const merged = { ...existing, ...safe }
  // Tally imports carry aggregate totals and no lines: keep those.
  const totals = merged.lines?.length
    ? totalsFor(merged.lines, settings, merged.customer, merged.extraDiscountPercent, merged.shipTo)
    : merged.totals || totalsFor([], settings, merged.customer, merged.extraDiscountPercent, merged.shipTo)
  return repo.update("invoices", id, { ...safe, totals })
}

// ---- enquiry -> quotation --------------------------------------------------

export async function markEnquiryQuoted(enquiryId) {
  const e = await repo.get("enquiries", enquiryId)
  if (e && e.status !== "won") await repo.update("enquiries", enquiryId, { status: "quoted" })
}

// ---- customers master ------------------------------------------------------

// True when two customer records (a master row and/or a document snapshot)
// refer to the same party: matched on email first, then on national phone
// digits, so "+91 98765 43210" and "9876543210" are one party. Mirrored in
// Ortex.Mobile/src/domain/quotations.ts.
export function sameCustomer(a, b) {
  const email = (a?.email || "").trim().toLowerCase()
  const phone = nationalDigits(a?.phone)
  if (email && (b?.email || "").trim().toLowerCase() === email) return true
  if (phone && nationalDigits(b?.phone) === phone) return true
  return false
}

// The fallback for a customer with NO email and NO phone, which sameCustomer can
// never match: the same name and company, ignoring case. Without it every
// quotation for a walk-in with only a name added another copy to Customers. A
// record with a phone or email is never matched this way. Mirrored in
// Ortex.Mobile/src/domain/quotations.ts.
function sameNameOnly(a, b) {
  if ((a?.email || "").trim() || nationalDigits(a?.phone)) return false
  const key = (c) => `${(c?.name || "").trim().toLowerCase()}|${(c?.company || "").trim().toLowerCase()}`
  return key(a) !== "|" && key(a) === key(b)
}

// Insert or update a customer in the master, matched on email then phone, so a
// customer captured while making a quote/invoice appears in the Customers list
// without manual re-entry. Returns the master record. Customers belong to one
// company (0076): the match looks only at companyId's customers and a new one
// is created in it, as upsert_customer_from() does for leads. Mirrored in
// Ortex.Mobile/src/domain/quotations.ts.
export async function upsertCustomer(customer, companyId) {
  if (!customer || (!customer.name && !customer.company)) return null
  const all = (await repo.list("customers")).filter((c) => !companyId || c.companyId === companyId)
  const match = all.find((c) => sameCustomer(customer, c)) ?? all.find((c) => sameNameOnly(customer, c))
  if (match) {
    // Fill only blanks. Never clobber curated master data with a sparse doc.
    // The same fields migration 0029 fills when a lead matches a customer.
    const patch = {}
    for (const k of ["name", "company", "email", "gstin", "stateCode", "address"]) {
      if (!match[k] && customer[k]) patch[k] = customer[k]
    }
    if (!match.phone && nationalDigits(customer.phone)) patch.phone = nationalDigits(customer.phone)
    if (Object.keys(patch).length) return repo.update("customers", match.id, patch)
    return match
  }
  // Stored as national digits, the shape the Customers page and the phone save.
  return repo.create("customers", { ...customer, phone: nationalDigits(customer.phone), ...withCompany(companyId) })
}

// ---- leads (CRM pipeline) --------------------------------------------------

// Transparent fit + engagement score (0–100). Fit from order value & source;
// engagement from stage progress, activity count and recency (with decay).
export function computeLeadScore(lead) {
  let fit = 0
  const v = Number(lead.estimatedValue) || 0
  fit += Math.min(25, v / 8000) // ₹2,00,000 → 25 pts
  const src = (lead.source || "").toLowerCase()
  if (src.includes("referral") || src.includes("repeat")) fit += 20
  else if (src.includes("whatsapp") || src.includes("phone") || src.includes("website")) fit += 10
  else fit += 5

  let eng = 0
  const stageBonus = { contacted: 6, qualified: 14, quoted: 22, negotiation: 30, won: 30 }
  eng += stageBonus[lead.stage] || 0
  eng += Math.min(10, (lead.activities?.length || 0) * 3)
  if (lead.lastActivityAt) {
    const days = (Date.now() - new Date(lead.lastActivityAt).getTime()) / 86400000
    if (days <= 3) eng += 10
    else if (days <= 7) eng += 6
    else if (days <= 14) eng += 3
  }
  return Math.max(0, Math.min(100, Math.round(fit + eng)))
}

export function weightedLeadValue(lead) {
  return round2((Number(lead.estimatedValue) || 0) * (stageProbability(lead.stage) / 100))
}

export async function convertEnquiryToLead(enquiryId) {
  const e = await repo.get("enquiries", enquiryId)
  if (!e) return null
  if (e.leadId) return repo.get("leads", e.leadId) // already converted
  // The lead stays in the enquiry's company.
  const lead = await repo.create("leads", {
    ...withCompany(e.companyId),
    enquiryId,
    customer: { ...e.customer },
    source: e.source,
    productInterest: e.productInterest,
    quantityEstimate: "",
    estimatedValue: 0,
    stage: "new",
    owner: e.owner || "",
    nextFollowUp: new Date(Date.now() + 86400000).toISOString(),
    lastActivityAt: null,
    lostReason: "",
    linkedQuotationId: null,
    activities: e.message ? [{ id: uid("act"), type: "Note", direction: "inbound", summary: e.message, at: e.createdAt || new Date().toISOString(), owner: "" }] : [],
    notes: "",
  })
  await repo.update("enquiries", enquiryId, { status: "qualified", leadId: lead.id })
  return lead
}

export async function addLeadActivity(leadId, activity) {
  const lead = await repo.get("leads", leadId)
  if (!lead) return null
  const at = activity.at || new Date().toISOString()
  const entry = { id: uid("act"), type: "Note", direction: "outbound", summary: "", owner: "", ...activity, at }
  const activities = [...(lead.activities || []), entry]
  const patch = { activities, lastActivityAt: at }
  if (activity.nextFollowUp !== undefined) patch.nextFollowUp = activity.nextFollowUp
  return repo.update("leads", leadId, patch)
}

export async function setLeadStage(leadId, stage, { lostReason = "" } = {}) {
  const patch = { stage }
  if (stage === "lost") patch.lostReason = lostReason
  if (stage === "won" || stage === "lost") patch.nextFollowUp = null
  return repo.update("leads", leadId, patch)
}

export async function markLeadQuoted(leadId, quotationId) {
  const lead = await repo.get("leads", leadId)
  if (!lead) return null
  const patch = { linkedQuotationId: quotationId }
  if (["new", "contacted", "qualified"].includes(lead.stage)) patch.stage = "quoted"
  return repo.update("leads", leadId, patch)
}

// ---- payments + reconciliation ---------------------------------------------
// The money math (paid, balance, live status, SETTLE_TOLERANCE) is pure and
// lives in lib/invoiceMoney.js, re-exported at the top of this file.

// A day from <input type="date"> ("2026-10-03") is stored as noon IST, the
// phone's convention (Ortex.Mobile/src/lib/payments.ts), so it reads as the
// same day in every timezone. A full timestamp is kept as given.
export function paymentDateIso(day) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return new Date(`${day}T12:00:00+05:30`).toISOString()
  return day || new Date().toISOString()
}

export async function recordPayment(draft) {
  const type = draft.type || "inflow"
  // A payment belongs to its invoice's company (the database sets it too,
  // 0075), so its number comes from that company's series.
  const invoice = type !== "payout" && draft.invoiceId ? await repo.get("invoices", draft.invoiceId) : null
  const companyId = invoice?.companyId || companyForNew(draft.companyId)
  const number = await generateNumber("payment", companyId)
  const payment = await repo.create("payments", {
    ...withCompany(companyId),
    number,
    type,
    amount: round2(draft.amount),
    method: draft.method || "UPI",
    date: paymentDateIso(draft.date),
    reference: draft.reference || "",
    note: draft.note || "",
    // inflow: link to an invoice + customer snapshot; payout: a party name
    // and never an invoice (migration 0066 refuses one).
    invoiceId: type === "payout" ? null : draft.invoiceId || null,
    invoiceNumber: type === "payout" ? "" : draft.invoiceNumber || "",
    ...(draft.advance ? { advance: true } : {}),
    party: draft.party || draft.customer?.name || "",
    customer: draft.customer || null,
  }).catch((e) => {
    // Payment numbers are unique (0066); two people saving at once can collide.
    if (/payments_number_key/.test(`${e?.message} ${e?.details}`)) throw new Error("That payment number is already taken. Try again.")
    throw e
  })

  if (payment.type === "inflow" && payment.invoiceId) await syncInvoicePaid(payment.invoiceId)
  return payment
}

// Recompute an invoice's cached amountPaid / status / paidAt from its payments.
// ONLY in browser demo mode: on Supabase migration 0066's trigger does this in
// the same transaction as the payment, and a browser write could race it.
export async function syncInvoicePaid(invoiceId) {
  if (hasSupabase) return null
  const invoice = await repo.get("invoices", invoiceId)
  if (!invoice) return null
  const all = await repo.list("payments")
  const amountPaid = paidForInvoice(invoice.id, all)
  const derived = resolveInvoiceStatus(invoice, all)
  // Like the trigger: only paid / partial / sent are stored, never overdue.
  const status = derived === "overdue" ? "sent" : derived
  const paidAt = status === "paid" ? invoice.paidAt || new Date().toISOString() : null
  return repo.update("invoices", invoice.id, { amountPaid, status, paidAt })
}

// Delete a payment and re-sync the invoice it was allocated to (if any).
export async function removePayment(payment) {
  await repo.remove("payments", payment.id)
  if (payment.type === "inflow" && payment.invoiceId) await syncInvoicePaid(payment.invoiceId)
}
