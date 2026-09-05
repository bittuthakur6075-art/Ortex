// Business operations that span collections.
//
// PORT OF the quotation slice of Ortex.Admin/src/data/domain/domain.js. Screens
// call these instead of poking the repository directly, so the invariants —
// document numbering, the customer upsert, the GST split — live in one place and
// match the console exactly.

import { repo } from "@/data/repo"
import { documentNumber } from "@/domain/id"
import { computeDocument, type DocumentTotals } from "@/domain/pricing"
import type { Customer, Enquiry, Line, Quotation } from "@/domain/schema"
import type { Settings } from "@/domain/settings"

/**
 * Intra-state (CGST+SGST) vs inter-state (IGST) is decided by comparing the
 * customer's state code to the company's registered state code. A customer with
 * no state code is treated as intra-state, matching the console.
 */
export function isInterState(companyStateCode?: string, customerStateCode?: string): boolean {
  if (!customerStateCode) return false
  return String(companyStateCode).trim() !== String(customerStateCode).trim()
}

/**
 * GST place of supply for goods follows the ship-to (consignee) location when
 * one is given, otherwise the bill-to customer.
 */
export function placeOfSupplyState(customer?: Customer | null, shipTo?: Customer | null): string | undefined {
  return shipTo?.stateCode?.trim() ? shipTo.stateCode : customer?.stateCode
}

export function totalsFor(
  lines: Partial<Line>[],
  settings: Settings,
  customer?: Customer | null,
  extraDiscountPercent = 0,
  shipTo: Customer | null = null,
): DocumentTotals {
  return computeDocument(lines, {
    interState: isInterState(settings.company.stateCode, placeOfSupplyState(customer, shipTo)),
    extraDiscountPercent,
  })
}

/**
 * Reserve the next human-facing document number for a series and bump its
 * counter. The counter is the `next_sequence` Postgres function, which is
 * atomic — this is why a quotation cannot be raised offline: two phones with no
 * signal would both believe they had the next number.
 */
async function generateNumber(series: string, settings: Settings): Promise<string> {
  const seq = await repo.nextSequence(series)
  const prefix = (settings.numbering as Record<string, string>)[`${series}Prefix`] || series.toUpperCase()
  return documentNumber(prefix, seq)
}

/**
 * Are these two customer records the same party? Matched on email first, then on
 * phone digits — never on name, because two people at the same company share a
 * company name and one person spells their own name three ways.
 */
export function sameCustomer(a?: Partial<Customer> | null, b?: Partial<Customer> | null): boolean {
  const email = (a?.email || "").trim().toLowerCase()
  const phone = (a?.phone || "").replace(/\D/g, "")
  if (email && (b?.email || "").trim().toLowerCase() === email) return true
  if (phone && (b?.phone || "").replace(/\D/g, "") === phone) return true
  return false
}

/**
 * Insert or update a customer in the master, so a customer captured while making
 * a quote appears in Contacts without manual re-entry.
 */
export async function upsertCustomer(customer: Customer): Promise<void> {
  if (!customer || (!customer.name && !customer.company)) return
  const all = await repo.list<Customer & { id: string }>("customers")
  const match = all.find((c) => sameCustomer(customer, c))
  if (match) {
    // Fill only blanks — never clobber curated master data with a sparse doc.
    const patch: Record<string, unknown> = {}
    for (const k of ["company", "gstin", "stateCode", "address"] as const) {
      if (!match[k] && customer[k]) patch[k] = customer[k]
    }
    if (Object.keys(patch).length) await repo.update("customers", match.id, patch)
    return
  }
  await repo.create("customers", { ...customer })
}

export type QuotationDraft = {
  id: string | null
  customer: Customer
  shipTo: Customer | null
  lines: Line[]
  extraDiscountPercent: number
  paymentTerms: string
  issueDate: string
  validityDays: number
  notes: string
  terms: string
  status: string
  lostReason: string
  enquiryId: string | null
  leadId: string | null
}

/** The console's `emptyDraft(settings)`, verbatim. */
export function emptyDraft(settings: Settings): QuotationDraft {
  return {
    id: null,
    customer: { name: "", company: "", email: "", phone: "", gstin: "", stateCode: "", address: "" },
    shipTo: null,
    lines: [],
    extraDiscountPercent: 0,
    paymentTerms: "",
    issueDate: new Date().toISOString(),
    validityDays: settings.quotation.validityDays ?? 15,
    notes: "",
    terms: settings.quotation.terms ?? "",
    status: "draft",
    lostReason: "",
    enquiryId: null,
    leadId: null,
  }
}

/** Validity end date, derived the same way the editor previews it live. */
export function validUntilFor(issueDate: string, validityDays: number): string {
  return new Date(new Date(issueDate).getTime() + validityDays * 86400000).toISOString()
}

export async function createQuotation(draft: QuotationDraft, settings: Settings): Promise<Quotation> {
  const number = await generateNumber("quotation", settings)
  const issueDate = draft.issueDate || new Date().toISOString()
  const validityDays = draft.validityDays ?? settings.quotation.validityDays
  const validUntil = validUntilFor(issueDate, validityDays)
  const totals = totalsFor(
    draft.lines || [],
    settings,
    draft.customer,
    draft.extraDiscountPercent,
    draft.shipTo,
  )

  await upsertCustomer(draft.customer)
  return repo.create<Quotation>("quotations", {
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

export async function updateQuotation(
  id: string,
  patch: Partial<Quotation>,
  settings: Settings,
): Promise<Quotation | null> {
  const existing = await repo.get<Quotation>("quotations", id)
  if (!existing) return null
  const merged = { ...existing, ...patch }
  // Recompute totals whenever lines / discount / customer / ship-to change, so a
  // stale client total can never be written.
  const totals = totalsFor(
    merged.lines || [],
    settings,
    merged.customer,
    merged.extraDiscountPercent,
    merged.shipTo,
  )
  if (patch.customer) await upsertCustomer(patch.customer)
  return repo.update<Quotation>("quotations", id, { ...patch, totals })
}

/** Mark the enquiry a quotation came from as quoted, unless it is already won. */
export async function markEnquiryQuoted(enquiryId: string): Promise<void> {
  const e = await repo.get<Enquiry>("enquiries", enquiryId)
  if (e && e.status !== "won") await repo.update("enquiries", enquiryId, { status: "quoted" })
}
