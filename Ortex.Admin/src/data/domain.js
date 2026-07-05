// Domain layer — business operations that span collections. Components call
// these instead of poking the repository directly, so invariants (document
// numbering, quote→invoice conversion, payment reconciliation, GST split) live
// in one place.

import { repo } from "./repository"
import { computeDocument } from "../lib/pricing"
import { documentNumber, uid } from "../lib/id"
import { round2, daysUntil } from "../lib/format"
import { stageProbability } from "./schema"
import { notifyInvoiceCreated } from "./notify"

// Intra-state (CGST+SGST) vs inter-state (IGST) is decided by comparing the
// customer's state code to the company's registered state code.
export function isInterState(companyStateCode, customerStateCode) {
  if (!customerStateCode) return false
  return String(companyStateCode).trim() !== String(customerStateCode).trim()
}

// Reserve the next human-facing document number for a series and bump its
// counter. Prefix comes from settings so the business can rebrand references.
async function generateNumber(series) {
  const settings = await repo.getSettings()
  const seq = await repo.nextSequence(series)
  const prefix = settings.numbering[`${series}Prefix`] || series.toUpperCase()
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
  const settings = await repo.getSettings()
  const number = await generateNumber("quotation")
  const issueDate = draft.issueDate || new Date().toISOString()
  const validityDays = draft.validityDays ?? settings.quotation.validityDays
  const validUntil = new Date(new Date(issueDate).getTime() + validityDays * 86400000).toISOString()
  const totals = totalsFor(draft.lines || [], settings, draft.customer, draft.extraDiscountPercent, draft.shipTo)

  await upsertCustomer(draft.customer)
  return repo.create("quotations", {
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
  })
}

export async function updateQuotation(id, patch) {
  const settings = await repo.getSettings()
  const existing = await repo.get("quotations", id)
  if (!existing) return null
  const merged = { ...existing, ...patch }
  // Recompute totals whenever lines / discount / customer / ship-to change.
  const totals = totalsFor(merged.lines || [], settings, merged.customer, merged.extraDiscountPercent, merged.shipTo)
  return repo.update("quotations", id, { ...patch, totals })
}

// ---- quotation -> invoice --------------------------------------------------

export async function convertQuotationToInvoice(quotationId) {
  const settings = await repo.getSettings()
  const q = await repo.get("quotations", quotationId)
  if (!q) return null

  const number = await generateNumber("invoice")
  const issueDate = new Date().toISOString()
  const dueDate = new Date(Date.now() + 15 * 86400000).toISOString()
  const totals = totalsFor(q.lines, settings, q.customer, q.extraDiscountPercent, q.shipTo)

  const invoice = await repo.create("invoices", {
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
    terms: q.terms || settings.quotation.terms,
    quotationId: q.id,
    quotationNumber: q.number,
    amountPaid: 0,
  })

  await repo.update("quotations", quotationId, { status: "invoiced", invoiceId: invoice.id })
  // Email a copy (mailto or EmailJS per settings). `_notify` is transient — the
  // caller reads it to toast; it is not persisted on the invoice.
  const _notify = await notifyInvoiceCreated(invoice, settings)
  return { ...invoice, _notify }
}

export async function createInvoice(draft) {
  const settings = await repo.getSettings()
  const number = draft.number || await generateNumber("invoice")
  const issueDate = draft.issueDate || new Date().toISOString()
  const dueDate = draft.dueDate || draft.dueDate === null ? draft.dueDate : new Date(Date.now() + 15 * 86400000).toISOString()
  const totals = draft.totals || totalsFor(draft.lines || [], settings, draft.customer, draft.extraDiscountPercent, draft.shipTo)
  await upsertCustomer(draft.customer)
  const invoice = await repo.create("invoices", {
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
    terms: draft.terms ?? settings.quotation.terms,
    quotationId: draft.quotationId || null,
    amountPaid: 0,
    tally: draft.tally || null,
  })
  // Drafts aren't "generated" yet — only email when issued as sent/final.
  const _notify = invoice.status === "draft" || draft.tally ? { skipped: true } : await notifyInvoiceCreated(invoice, settings)
  return { ...invoice, _notify }
}

// Manually (re)send the invoice email — used by the "Email copy" button.
export async function emailInvoice(invoiceId) {
  const settings = await repo.getSettings()
  const invoice = await repo.get("invoices", invoiceId)
  if (!invoice) return { error: "Invoice not found" }
  // Force-send even if the global toggle is off, since this is an explicit action.
  return notifyInvoiceCreated(invoice, { ...settings, notifications: { ...settings.notifications, invoiceEmailEnabled: true } })
}

export async function updateInvoice(id, patch) {
  const settings = await repo.getSettings()
  const existing = await repo.get("invoices", id)
  if (!existing) return null
  const merged = { ...existing, ...patch }
  const totals = totalsFor(merged.lines || [], settings, merged.customer, merged.extraDiscountPercent, merged.shipTo)
  return repo.update("invoices", id, { ...patch, totals })
}

// ---- enquiry -> quotation --------------------------------------------------

export async function markEnquiryQuoted(enquiryId) {
  const e = await repo.get("enquiries", enquiryId)
  if (e && e.status !== "won") await repo.update("enquiries", enquiryId, { status: "quoted" })
}

// ---- customers master ------------------------------------------------------

// Insert or update a customer in the master, matched on email then phone, so a
// customer captured while making a quote/invoice appears in the Customers list
// without manual re-entry. Returns the master record.
export async function upsertCustomer(customer) {
  if (!customer || (!customer.name && !customer.company)) return null
  const all = await repo.list("customers")
  const email = (customer.email || "").trim().toLowerCase()
  const phone = (customer.phone || "").replace(/\D/g, "")
  const match = all.find(
    (c) =>
      (email && (c.email || "").trim().toLowerCase() === email) ||
      (phone && (c.phone || "").replace(/\D/g, "") === phone),
  )
  if (match) {
    // Fill only blanks — never clobber curated master data with a sparse doc.
    const patch = {}
    for (const k of ["company", "gstin", "stateCode", "address"]) {
      if (!match[k] && customer[k]) patch[k] = customer[k]
    }
    if (Object.keys(patch).length) return repo.update("customers", match.id, patch)
    return match
  }
  return repo.create("customers", { ...customer })
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
  const lead = await repo.create("leads", {
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

// Sum of inflow payments recorded against an invoice.
export function paidForInvoice(invoiceId, payments) {
  return round2(
    payments
      .filter((p) => p.invoiceId === invoiceId && p.type === "inflow")
      .reduce((s, p) => s + (Number(p.amount) || 0), 0),
  )
}

export function invoiceBalance(invoice, payments) {
  return round2((invoice.totals?.grandTotal || 0) - paidForInvoice(invoice.id, payments))
}

// Derived, current status of an invoice from its payments + due date. Kept
// separate from the stored status so it's always live (e.g. becomes overdue as
// time passes) without a background job.
export function resolveInvoiceStatus(invoice, payments) {
  if (invoice.status === "cancelled" || invoice.status === "draft") return invoice.status
  const balance = invoiceBalance(invoice, payments)
  const grand = invoice.totals?.grandTotal || 0
  if (grand > 0 && balance <= 0) return "paid"
  const paid = paidForInvoice(invoice.id, payments)
  if (paid > 0) return "partial"
  if (invoice.dueDate && daysUntil(invoice.dueDate) < 0) return "overdue"
  return invoice.status
}

export async function recordPayment(draft) {
  const number = await generateNumber("payment")
  const payment = await repo.create("payments", {
    number,
    type: draft.type || "inflow",
    amount: round2(draft.amount),
    method: draft.method || "UPI",
    date: draft.date || new Date().toISOString(),
    reference: draft.reference || "",
    note: draft.note || "",
    // inflow: link to an invoice + customer snapshot; payout: a party name.
    invoiceId: draft.invoiceId || null,
    invoiceNumber: draft.invoiceNumber || "",
    party: draft.party || draft.customer?.name || "",
    customer: draft.customer || null,
  })

  // Keep the linked invoice's cached amountPaid/status in sync for list views.
  if (payment.type === "inflow" && payment.invoiceId) {
    const invoice = await repo.get("invoices", payment.invoiceId)
    if (invoice) {
      const all = await repo.list("payments")
      const status = resolveInvoiceStatus(invoice, all)
      await repo.update("invoices", invoice.id, { amountPaid: paidForInvoice(invoice.id, all), status })
    }
  }
  return payment
}
