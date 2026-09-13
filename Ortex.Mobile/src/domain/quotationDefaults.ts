// A rep's own starting text for new quotations: payment terms, terms and
// conditions, and notes.
//
// Personal, not company-wide. The company's terms live in the console's
// `settings` row, which only an admin can write (a Sales Executive reads it
// through the `settings_staff` view), so the phone cannot and should not change
// them. What a rep CAN own is the text they start from: "50% advance, balance on
// dispatch" for one, a standard delivery note for another.
//
// Each field is `null` when the rep has not set it, and null means "fall back":
// terms fall back to the company's default terms, payment terms and notes to
// empty (the company has no default for those). An empty string is a real
// choice, "start blank", and is kept.

import type { QuotationDraft } from "@/domain/quotations"

export type QuotationDefaults = {
  paymentTerms: string | null
  terms: string | null
  notes: string | null
}

export const NO_DEFAULTS: QuotationDefaults = { paymentTerms: null, terms: null, notes: null }

export const DEFAULT_FIELDS = ["paymentTerms", "terms", "notes"] as const

/** The draft with the rep's defaults laid over whatever the company supplied. */
export function withDefaults(draft: QuotationDraft, defaults: QuotationDefaults): QuotationDraft {
  const out = { ...draft }
  for (const field of DEFAULT_FIELDS) {
    const v = defaults[field]
    if (v !== null) out[field] = v
  }
  return out
}

/**
 * What to store for one field, given what the rep typed and the company value
 * it would otherwise fall back to. Typing the company's own text back in (or
 * tapping "Use company terms") stores null, so a later change to the company
 * terms in the console still reaches this rep.
 */
export function normaliseDefault(value: string, fallback: string): string | null {
  const trimmedEnd = value.replace(/\s+$/, "")
  if (trimmedEnd === fallback.replace(/\s+$/, "")) return null
  return trimmedEnd
}

/** Is anything personal set? Drives the Profile row's subtitle. */
export function hasDefaults(d: QuotationDefaults): boolean {
  return DEFAULT_FIELDS.some((f) => d[f] !== null)
}
