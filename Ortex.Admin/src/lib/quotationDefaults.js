// A person's own starting text for NEW quotations: payment terms, terms and
// conditions, and notes. Port of Ortex.Mobile/src/domain/quotationDefaults.ts
// (the pure half) and src/lib/quotationDefaults.ts (the storage half); both
// clients read and write the same `profiles.quotation_defaults` column, so a
// rep who sets them on the phone gets them in the console too.
//
// Personal, not company-wide. The company's terms live in the `settings` row,
// which only an admin writes. Each field is `null` when not set, and null means
// "fall back": terms to the company's default terms, payment terms and notes to
// empty. An empty string is a real choice, "start blank", and is kept.
//
// This file is pure; storage (profile column 0027, or localStorage without it)
// is hooks/useQuotationDefaults.js.

export const NO_DEFAULTS = Object.freeze({ paymentTerms: null, terms: null, notes: null })
export const DEFAULT_FIELDS = ["paymentTerms", "terms", "notes"]

/** The draft with the person's defaults laid over whatever the company supplied. */
export function withDefaults(draft, defaults) {
  const out = { ...draft }
  for (const field of DEFAULT_FIELDS) {
    const v = defaults?.[field]
    if (v !== null && v !== undefined) out[field] = v
  }
  return out
}

/**
 * What to store for one field, given what was typed and the company value it
 * would otherwise fall back to. Typing the company's own text back in (or
 * "Use company terms") stores null, so a later change to the company terms in
 * Settings still reaches this person.
 */
export function normaliseDefault(value, fallback) {
  const trimmedEnd = String(value ?? "").replace(/\s+$/, "")
  if (trimmedEnd === String(fallback ?? "").replace(/\s+$/, "")) return null
  return trimmedEnd
}

/** Is anything personal set? */
export function hasDefaults(d) {
  return DEFAULT_FIELDS.some((f) => d?.[f] !== null && d?.[f] !== undefined)
}

/** Any stored shape → { paymentTerms, terms, notes }, non-strings as null. */
export function parseDefaults(raw) {
  const o = raw && typeof raw === "object" ? raw : {}
  const pick = (k) => (typeof o[k] === "string" ? o[k] : null)
  return { paymentTerms: pick("paymentTerms"), terms: pick("terms"), notes: pick("notes") }
}

/** Has migration 0027 reached the project this profile row came from? */
export function columnIsLive(profile) {
  return !!profile && Object.prototype.hasOwnProperty.call(profile, "quotation_defaults")
}

/**
 * The update failed because the column does not exist (0027 not applied), as
 * opposed to a real failure. A check-constraint violation also names the
 * column, so it is excluded explicitly: that one must surface as an error.
 */
export function isMissingColumnError(message) {
  const m = String(message || "")
  return /quotation_defaults/i.test(m) && /(column|schema cache)/i.test(m) && !/constraint/i.test(m)
}
