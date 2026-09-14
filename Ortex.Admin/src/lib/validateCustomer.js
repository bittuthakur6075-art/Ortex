// What a customer has to satisfy before it is allowed into `customers`.
//
// PORT OF Ortex.Mobile/src/features/contacts/validateContact.ts, same rules and
// same wording, so a contact refused on the phone is refused here too. Pure, and
// covered by validateCustomer.test.js.
//
// Each rule exists because of how the rest of the system reads this row:
//
//   NAME OR COMPANY: `upsertCustomer` (data/domain/domain.js) silently returns
//   null for a record with neither, so quotations would never touch it.
//
//   PHONE OR EMAIL: every match is `sameCustomer`, email first, then national
//   phone digits. A customer with neither can never be joined to a document and
//   re-duplicates every time someone quotes them.
//
//   GSTIN AND STATE: the first two digits of a GSTIN are the state code, and the
//   state code decides CGST+SGST versus IGST. Letting the two disagree writes a
//   record that produces a wrong tax invoice.

import { GST_STATES } from "./gstStates"

// 15 characters: 2 state digits, PAN, entity number, "Z", checksum.
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

// Deliberately loose: a validator that rejects a real address is worse than one
// that lets a typo through.
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

const str = (v) => String(v ?? "").trim()

export const digitsOf = (value) => String(value || "").replace(/\D/g, "")

// The number as it is stored and compared: bare national digits, with the +91
// country code or the trunk 0 taken off. "+91 98765 43210", "09876543210" and
// "9876543210" are one person. `whatsappNumber` (lib/customerStats.js) is the
// inverse, putting the 91 back for a wa.me link.
export function nationalDigits(value) {
  const d = digitsOf(value)
  if (d.length === 12 && d.startsWith("91")) return d.slice(2)
  if (d.length === 11 && d.startsWith("0")) return d.slice(1)
  return d
}

export function emailProblem(email) {
  const value = str(email)
  if (!value) return null
  return EMAIL.test(value) ? null : "That does not look like an email address"
}

// 10 digits for a mobile, up to 12 with a country code, down to 8 for a landline
// written without its STD code.
export function phoneProblem(phone) {
  const d = digitsOf(phone)
  if (!d) return null
  if (d.length < 8) return "That is too short to be a phone number"
  if (d.length > 12) return "That is too long to be a phone number"
  return null
}

// The GSTIN rule and its state agreement. `field` says which input is at fault:
// a well-formed GSTIN that disagrees with the state is the STATE's error.
export function gstinProblem(gstin, stateCode) {
  const value = str(gstin).toUpperCase()
  if (!value) return null
  if (!GSTIN.test(value)) {
    return { field: "gstin", message: "A GSTIN is 15 characters, like 07AABCU9603R1ZM" }
  }
  if (!GST_STATES[value.slice(0, 2)]) {
    return { field: "gstin", message: "That GSTIN does not start with a valid state code" }
  }
  const state = str(stateCode)
  if (state && state !== value.slice(0, 2)) {
    return { field: "stateCode", message: "The place of supply does not match the GSTIN's state" }
  }
  return null
}

// The existing row these details already belong to, on `sameCustomer`'s rule
// (email, then national phone digits). `selfId` is the row being edited, which
// never counts as its own duplicate.
export function findDuplicate(draft, existing = [], selfId) {
  const email = str(draft?.email).toLowerCase()
  const phone = nationalDigits(draft?.phone)
  if (!email && !phone) return null
  return (
    existing.find((c) => {
      if (selfId && c.id === selfId) return false
      if (email && str(c.email).toLowerCase() === email) return true
      return !!phone && nationalDigits(c.phone) === phone
    }) || null
  )
}

// Field-keyed errors ({ name, phone, email, gstin, stateCode, form }); an empty
// object means the draft may be saved. Pass `existing` = [] to skip the
// duplicate check.
export function validateCustomer(draft, existing = [], selfId) {
  const errors = {}

  if (!str(draft?.name) && !str(draft?.company)) errors.name = "Enter a name, or a company"

  const phone = nationalDigits(draft?.phone)
  const email = str(draft?.email)
  const phoneError = phoneProblem(draft?.phone)
  if (phoneError) errors.phone = phoneError
  const emailError = emailProblem(email)
  if (emailError) errors.email = emailError

  if (!phone && !email) {
    errors.form = "Add a phone number or an email. It is how this customer is matched to their quotations"
  }

  const gst = gstinProblem(draft?.gstin, draft?.stateCode)
  if (gst) errors[gst.field] = gst.message

  // `sameCustomer`'s rule, applied before the write rather than after: two rows
  // matching on the same number both answer every document lookup.
  if (!errors.phone && !errors.email) {
    const clash = findDuplicate(draft, existing, selfId)
    if (clash) {
      const who = clash.name || clash.company || "another customer"
      errors.form = `Those details already belong to ${who}`
    }
  }

  return errors
}

// Everything the row should be stored as, once it has passed validation. Keys
// the draft carries beyond the contact fields are kept untouched.
export function normaliseCustomer(draft) {
  const gstin = str(draft?.gstin).toUpperCase()
  return {
    ...draft,
    name: str(draft?.name),
    company: str(draft?.company),
    email: str(draft?.email),
    phone: nationalDigits(draft?.phone),
    gstin,
    // A GSTIN carries the state, so a blank state is filled from it.
    stateCode: str(draft?.stateCode) || (GSTIN.test(gstin) ? gstin.slice(0, 2) : ""),
    address: str(draft?.address),
  }
}
