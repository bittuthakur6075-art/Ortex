import AsyncStorage from "@react-native-async-storage/async-storage"
import React from "react"

import type { QuotationDraft } from "@/domain/quotations"

// A half-finished quotation is expensive to retype in front of a customer, and
// a phone kills a backgrounded app without warning. So every keystroke is
// mirrored to AsyncStorage and offered back on the next launch.
//
// This is NOT an offline queue: the draft is never submitted on its own. A
// quotation number comes from the server's atomic `next_sequence`, so two phones
// saving offline would both believe they had the next one.

const KEY = "@ortex/quotation-draft"

export type StoredDraft = { draft: QuotationDraft; savedAt: number }

/** Persist `draft` whenever it changes, unless we are editing an existing doc. */
export function usePersistedDraft(draft: QuotationDraft, enabled: boolean) {
  React.useEffect(() => {
    if (!enabled) return
    const handle = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify({ draft, savedAt: Date.now() } satisfies StoredDraft)).catch(
        () => {},
      )
      // Debounced: writing on every keystroke of a long terms field would hit
      // the disk dozens of times a second for no benefit.
    }, 400)
    return () => clearTimeout(handle)
  }, [draft, enabled])
}

export async function readStoredDraft(): Promise<StoredDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    return parsed?.draft ? parsed : null
  } catch {
    return null
  }
}

export async function clearStoredDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {})
}

/** Is this draft worth offering back, or is it an untouched blank? */
export function draftHasContent(draft: QuotationDraft): boolean {
  const hasCustomer = !!(draft.customer?.name?.trim() || draft.customer?.company?.trim())
  const hasLines = (draft.lines || []).some((l) => l.description?.trim() || l.rate > 0)
  return hasCustomer || hasLines
}
