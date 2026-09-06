import { GST_STATES } from "@/domain/gstStates"
import type { Customer } from "@/domain/schema"

/**
 * What a new contact has to satisfy before it is allowed into `customers`.
 *
 * Pure and RN-free on purpose: it is exercised off-device by
 * `test/contact.test.mjs`, and a wrong tax split or a duplicate master row is
 * exactly the kind of bug that is cheap to catch in a test and expensive to find
 * on a phone in a customer's warehouse.
 *
 * The rules are not arbitrary house style — each one exists because of how the
 * rest of the system reads this row:
 *
 *   NAME OR COMPANY — `upsertCustomer` (domain/quotations.ts, ported from the
 *   console) silently returns null for a record with neither, so a contact
 *   without one is a row that quotations refuse to touch.
 *
 *   PHONE OR EMAIL — every match in this system is `sameCustomer`: email first,
 *   then phone digits. A contact with neither can never be joined to a quotation
 *   or an enquiry, and will re-duplicate every time someone quotes them.
 *
 *   GSTIN ⇄ STATE — the first two digits of a GSTIN ARE the state code, and the
 *   state code decides CGST+SGST versus IGST. Letting the two disagree writes a
 *   record that will produce a wrong tax invoice.
 */

export type ContactDraft = Customer

export type ContactErrors = Partial<Record<keyof Customer | "form", string>>

/** 15 characters: 2 state digits, PAN, entity number, "Z", checksum. */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

// Deliberately loose. Address syntax is far wider than the shapes people
// remember, and a validator that rejects a real address is worse than one that
// lets a typo through — the send will bounce and the user will fix it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

export const digitsOf = (value?: string) => String(value || "").replace(/\D/g, "")


/**
 * The email rule, as a reusable check rather than a private regex.
 *
 * Exported because three other forms — sign-in, the invite sheet, the customer
 * edit sheet — each carried their own idea of what an email is, and one of them
 * was `address.includes("@")`. One definition, in the module that is already
 * tested, beats four that disagree.
 */
export function emailProblem(email?: string): string | null {
  const value = String(email || "").trim()
  if (!value) return null
  return EMAIL.test(value) ? null : "That does not look like an email address"
}

/**
 * The GSTIN rule and its state agreement, for forms that collect the two outside
 * a full contact draft. The returned `field` says which input is at fault: a
 * well-formed GSTIN that disagrees with the picked state is the STATE's error,
 * not the number's.
 */
export function gstinProblem(
  gstin?: string,
  stateCode?: string,
): { field: "gstin" | "stateCode"; message: string } | null {
  const value = String(gstin || "")
    .trim()
    .toUpperCase()
  if (!value) return null
  if (!GSTIN.test(value)) {
    return { field: "gstin", message: "A GSTIN is 15 characters, like 07AABCU9603R1ZM" }
  }
  if (!GST_STATES[value.slice(0, 2)]) {
    return { field: "gstin", message: "That GSTIN does not start with a valid state code" }
  }
  const state = String(stateCode || "").trim()
  if (state && state !== value.slice(0, 2)) {
    return { field: "stateCode", message: "The place of supply does not match the GSTIN's state" }
  }
  return null
}
/**
 * The number as this app stores and compares it: bare national digits, with the
 * +91 country code or the trunk 0 taken off.
 *
 * It matters because matching is done on the STORED string. `sameCustomer`
 * compares phone digits exactly, so "+91 98765 43210" saved verbatim would not
 * match the "9876543210" a quotation snapshot carries, and the same person would
 * end up in the master twice. This is `whatsappNumber`'s inverse — that helper
 * (lib/contact.ts) puts the 91 back when it needs a wa.me link.
 */
export function nationalDigits(value?: string): string {
  const d = digitsOf(value)
  if (d.length === 12 && d.startsWith("91")) return d.slice(2)
  if (d.length === 11 && d.startsWith("0")) return d.slice(1)
  return d
}

/**
 * 10 digits for a mobile, up to 12 with a country code, down to 8 for a landline
 * written without its STD code. Nothing narrower: a rule that only admits
 * 10-digit mobiles rejects the office landlines half of these customers answer.
 */
export function phoneProblem(phone?: string): string | null {
  const d = digitsOf(phone)
  if (!d) return null
  if (d.length < 8) return "That is too short to be a phone number"
  if (d.length > 12) return "That is too long to be a phone number"
  return null
}

export function validateContact(
  draft: ContactDraft,
  /** The master list, for the duplicate check. Pass [] to skip it. */
  existing: (Partial<Customer> & { id?: string })[] = [],
  /** The row being edited, which must not count as its own duplicate. */
  selfId?: string,
): ContactErrors {
  const errors: ContactErrors = {}

  const name = draft.name.trim()
  const company = draft.company.trim()
  if (!name && !company) {
    errors.name = "Enter a name, or a company"
  }

  const phone = nationalDigits(draft.phone)
  const email = draft.email.trim()
  const phoneError = phoneProblem(draft.phone)
  if (phoneError) errors.phone = phoneError
  if (email && !EMAIL.test(email)) errors.email = "That does not look like an email address"

  if (!phone && !email) {
    errors.form = "Add a phone number or an email. It is how this contact is matched to their quotations"
  }

  const gstin = draft.gstin.trim().toUpperCase()
  if (gstin) {
    if (!GSTIN.test(gstin)) {
      errors.gstin = "A GSTIN is 15 characters, like 07AABCU9603R1ZM"
    } else if (!GST_STATES[gstin.slice(0, 2)]) {
      errors.gstin = "That GSTIN does not start with a valid state code"
    } else if (draft.stateCode.trim() && draft.stateCode.trim() !== gstin.slice(0, 2)) {
      errors.stateCode = "The place of supply does not match the GSTIN's state"
    }
  }

  // The duplicate check is `sameCustomer`'s rule, applied before the insert
  // rather than after: two rows matching on the same number would both answer
  // to every quotation lookup, and which one wins is arbitrary.
  if (!errors.phone && !errors.email) {
    const clash = existing.find((c) => {
      if (selfId && c.id === selfId) return false
      const theirEmail = (c.email || "").trim().toLowerCase()
      if (email && theirEmail === email.toLowerCase()) return true
      return !!phone && nationalDigits(c.phone) === phone
    })
    if (clash) {
      const who = clash.name || clash.company || "another contact"
      errors.form = `Those details already belong to ${who}`
    }
  }

  return errors
}

/** Everything the row should be stored as, once it has passed validation. */
export function normaliseContact(draft: ContactDraft): Customer {
  const gstin = draft.gstin.trim().toUpperCase()
  return {
    name: draft.name.trim(),
    company: draft.company.trim(),
    email: draft.email.trim(),
    // Digits only, the same shape `customers.phone` already holds, so
    // `sameCustomer` and lib/contact's tel:/wa.me links both work off it.
    phone: nationalDigits(draft.phone),
    gstin,
    // A GSTIN carries the state, so a blank picker is filled from it rather than
    // left for someone to get wrong later.
    stateCode: draft.stateCode.trim() || (GSTIN.test(gstin) ? gstin.slice(0, 2) : ""),
    address: draft.address.trim(),
  }
}
