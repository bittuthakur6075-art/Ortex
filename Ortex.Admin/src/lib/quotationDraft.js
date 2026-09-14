// The unsaved state of the quotation editor, kept in this browser.
//
// The console's counterpart of Ortex.Mobile/src/features/quotations/
// useQuotationDraft.ts. A half-finished quotation is expensive to retype, and a
// closed tab, a sidebar click or an expired session throws it away without a
// word. So the editor mirrors its form here (debounced) and offers it back the
// next time the same quotation, or a new blank one, is opened.
//
// Keyed per signed-in user AND per quotation (`new` for an unsaved one), so two
// people sharing a machine never see each other's work, and a draft of Q-0042
// is never offered on Q-0043.
//
// NOT an offline queue: nothing here is ever submitted on its own. A quotation
// number comes from the server's atomic sequence.

const PREFIX = "ortex.quotationDraft"

export const draftKey = (userId, quotationId) => `${PREFIX}.${userId || "local"}.${quotationId || "new"}`

/** Is this draft worth offering back, or is it an untouched blank? */
export function draftHasContent(draft) {
  if (!draft) return false
  const hasCustomer = !!(draft.customer?.name?.trim() || draft.customer?.company?.trim())
  const hasLines = (draft.lines || []).some((l) => l?.description?.trim() || Number(l?.rate) > 0)
  return hasCustomer || hasLines
}

/** Has the form moved away from what it was opened with? */
export function isDirty(form, initial) {
  return JSON.stringify(form) !== JSON.stringify(initial)
}

/** Why the quotation cannot be saved yet, or null when it can. */
export function saveBlocker(form) {
  if (!form?.customer?.name?.trim() && !form?.customer?.company?.trim()) return "Choose or add a customer"
  if (!form?.lines?.length) return "Add at least one line item"
  return null
}

export function readDraft(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.draft ? parsed : null
  } catch {
    return null
  }
}

export function writeDraft(key, draft) {
  try {
    localStorage.setItem(key, JSON.stringify({ draft, savedAt: Date.now() }))
  } catch {
    /* private window or storage full: the draft is a convenience, not a record */
  }
}

export function clearDraft(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to clear */
  }
}
