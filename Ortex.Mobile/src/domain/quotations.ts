// Business operations that span collections.
//
// PORT OF the quotation slice of Ortex.Admin/src/data/domain/domain.js. Screens
// call these instead of poking the repository directly, so the invariants —
// document numbering, the customer upsert, the GST split — live in one place and
// match the console exactly.

import { repo } from "@/data/repo"
import { GST_STATES } from "@/domain/gstStates"
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
/** The state a GSTIN names in its first two digits ("07" for Delhi), or "". */
export function gstinState(gstin?: string): string {
  const code = String(gstin || "").trim().slice(0, 2)
  return GST_STATES[code] ? code : ""
}

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
async function generateNumber(series: string, settings: Settings, companyId?: string): Promise<string> {
  const seq = await repo.nextSequence(series, companyId)
  const prefix = (settings.numbering as Record<string, string>)[`${series}Prefix`] || series.toUpperCase()
  return documentNumber(prefix, seq)
}

/**
 * Bare national digits: +91 or a trunk 0 taken off, so "+91 98765 43210" and
 * "9876543210" compare equal. Same rule as `nationalDigits` in
 * features/contacts/validateContact.ts and Admin's lib/validateCustomer.js; kept
 * local so the domain layer does not import a feature folder.
 */
function nationalDigits(value?: string): string {
  const d = String(value || "").replace(/\D/g, "")
  if (d.length === 12 && d.startsWith("91")) return d.slice(2)
  if (d.length === 11 && d.startsWith("0")) return d.slice(1)
  return d
}

/**
 * Are these two customer records the same party? Matched on email first, then on
 * phone digits — never on name, because two people at the same company share a
 * company name and one person spells their own name three ways.
 */
export function sameCustomer(a?: Partial<Customer> | null, b?: Partial<Customer> | null): boolean {
  const email = (a?.email || "").trim().toLowerCase()
  const phone = nationalDigits(a?.phone)
  if (email && (b?.email || "").trim().toLowerCase() === email) return true
  if (phone && nationalDigits(b?.phone) === phone) return true
  return false
}

/**
 * The fallback for a customer with NO email and NO phone, which sameCustomer can
 * never match: the same name and company, ignoring case. Without it every
 * quotation for a walk-in with only a name added another copy to Contacts. A
 * record that has a phone or email is never matched this way.
 */
function sameNameOnly(a: Partial<Customer>, b: Partial<Customer>): boolean {
  if ((a.email || "").trim() || nationalDigits(a.phone)) return false
  const key = (c: Partial<Customer>) => `${(c.name || "").trim().toLowerCase()}|${(c.company || "").trim().toLowerCase()}`
  return key(a) !== "|" && key(a) === key(b)
}

/**
 * Insert or update a customer in the master, so a customer captured while making
 * a quote appears in Contacts without manual re-entry.
 *
 * Customers belong to one company (Admin migration 0076): the match looks only
 * at `companyId`'s customers, and a new one is created in it, as the
 * database's upsert_customer_from() does for leads.
 */
export async function upsertCustomer(customer: Customer, companyId?: string): Promise<void> {
  if (!customer || (!customer.name && !customer.company)) return
  const all = (await repo.list<Customer & { id: string; companyId?: string }>("customers")).filter(
    (c) => !companyId || c.companyId === companyId,
  )
  const match = all.find((c) => sameCustomer(customer, c)) ?? all.find((c) => sameNameOnly(customer, c))
  if (match) {
    // Fill only blanks — never clobber curated master data with a sparse doc.
    // The same fields migration 0029 fills when a lead matches a customer.
    const patch: Record<string, unknown> = {}
    for (const k of ["name", "company", "email", "gstin", "stateCode", "address"] as const) {
      if (!match[k] && customer[k]) patch[k] = customer[k]
    }
    if (!match.phone && nationalDigits(customer.phone)) patch.phone = nationalDigits(customer.phone)
    if (Object.keys(patch).length) await repo.update("customers", match.id, patch)
    return
  }
  // Stored as national digits, the shape the contact editor saves.
  await repo.create("customers", { ...customer, phone: nationalDigits(customer.phone), companyId })
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
  /** Printed under the totals when `showSeller` is on — see schema.ts. */
  sellerName: string
  showSeller: boolean
  /** The company it is raised for (Admin migration 0075); "" until chosen. Fixed once created. */
  companyId: string
}

/** The console's `emptyDraft(settings)`, plus the two seller fields. */
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
    // Filled from the signed-in profile by the editor, not here: this module is
    // pure and knows nothing about who is holding the phone.
    sellerName: "",
    // ON by default. A rep quoting in the field wants their own name on the
    // sheet the customer receives — it is who the customer rings back. The
    // checkbox is for the times it should go out as the company alone.
    showSeller: true,
    companyId: "",
  }
}

/** Validity end date, derived the same way the editor previews it live. */
export function validUntilFor(issueDate: string, validityDays: number): string {
  return new Date(new Date(issueDate).getTime() + validityDays * 86400000).toISOString()
}

/**
 * One Create press and its retries. The number is reserved once and kept here,
 * so a retry after a lost answer reuses it rather than minting a second one.
 */
export type CreateAttempt = { number?: string }

export async function createQuotation(
  draft: QuotationDraft,
  settings: Settings,
  attempt: CreateAttempt = {},
): Promise<Quotation> {
  if (attempt.number) {
    // A retry: the first insert may have landed after all.
    const landed = await findQuotationByNumber(attempt.number, draft.companyId)
    if (landed) return landed
  }
  const number = attempt.number || (await generateNumber("quotation", settings, draft.companyId))
  attempt.number = number
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

  await upsertCustomer(draft.customer, draft.companyId)
  return repo.create<Quotation>("quotations", {
    companyId: draft.companyId,
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
    // Captured now, at creation. The PDF is built later — often by someone else
    // opening the record — so resolving "the signed-in user" at print time would
    // put the wrong person's name on a document that has already been sent.
    sellerName: draft.sellerName || "",
    showSeller: draft.showSeller !== false,
  })
}

/**
 * A quotation by its number among the newest rows, or null. Throws when the
 * list could only be read from the phone's cache: then nobody knows.
 */
export async function findQuotationByNumber(number: string, companyId?: string): Promise<Quotation | null> {
  const { items, fromCache } = await repo.fetch<Quotation>("quotations", { limit: 50 })
  if (fromCache) throw new Error("No signal to check whether the quotation was saved")
  // Each company numbers its own quotations, so QTN-0001 can exist twice.
  return items.find((q) => q.number === number && (!companyId || q.companyId === companyId)) || null
}

const SAVE_TIMEOUT = 20000

/**
 * `createQuotation` raced against 20s (a dropped connection hangs rather than
 * fails), and on an error or a timeout the list is read again: if the reserved
 * number is there, it saved. Only then is it a failure.
 * ponytail: a request still in flight past the re-read can land after a retry's
 * check; widen the check (or a unique index on doc number) if that ever bites.
 */
export async function createQuotationReliably(
  draft: QuotationDraft,
  settings: Settings,
  attempt: CreateAttempt,
  timeoutMs = SAVE_TIMEOUT,
): Promise<Quotation> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      createQuotation(draft, settings, attempt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("No answer from the server. Check your signal.")), timeoutMs)
      }),
    ])
  } catch (e) {
    if (attempt.number) {
      const landed = await findQuotationByNumber(attempt.number, draft.companyId).catch(() => null)
      if (landed) return landed
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
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
  // The validity end date follows the issue date and the validity days, the same
  // way it was derived at creation. Without this, editing the days left the
  // old date on the PDF. MIRRORED in Ortex.Admin/src/data/domain/domain.js.
  const validUntil =
    merged.issueDate && merged.validityDays != null
      ? validUntilFor(merged.issueDate, merged.validityDays)
      : merged.validUntil
  if (patch.customer) await upsertCustomer(patch.customer, existing.companyId)
  return repo.update<Quotation>("quotations", id, { ...patch, totals, validUntil })
}

/** Mark the enquiry a quotation came from as quoted, unless it is already won. */
export async function markEnquiryQuoted(enquiryId: string): Promise<void> {
  const e = await repo.get<Enquiry>("enquiries", enquiryId)
  if (e && e.status !== "won") await repo.update("enquiries", enquiryId, { status: "quoted" })
}
