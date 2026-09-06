import AsyncStorage from "@react-native-async-storage/async-storage"
import React from "react"

import { feedback } from "@/lib/feedback"

/**
 * Starred contacts, the way Samsung Contacts does it: a Favourites group pinned
 * above the alphabet.
 *
 * It is LOCAL to the phone rather than a field on the `customers` doc, and
 * deliberately so — a favourite is "who *I* ring", not a property of the company,
 * and the console has no such column. Writing one would mean a schema change and
 * a migration for a preference that is personal to the handset.
 *
 * The set lives in a module-level store with subscribers rather than in a React
 * context, because two screens (the directory and the detail page) both toggle it
 * and both must repaint. AsyncStorage is written through on every change; a
 * failed write costs a star, never a record.
 */

const KEY = "ortex.contacts.favourites"

let ids = new Set<string>()
let hydrated = false
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((fn) => fn())

async function hydrate() {
  if (hydrated) return
  hydrated = true
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (raw) {
      ids = new Set<string>(JSON.parse(raw) as string[])
      emit()
    }
  } catch {
    // A corrupt or missing blob just means "nothing starred yet".
  }
}

function persist() {
  AsyncStorage.setItem(KEY, JSON.stringify([...ids])).catch(() => {})
}

export function isFavourite(id: string): boolean {
  return ids.has(id)
}

/** Returns the new state, so a caller can toast "Added to favourites". */
export function toggleFavourite(id: string): boolean {
  const next = !ids.has(id)
  if (next) ids.add(id)
  else ids.delete(id)
  feedback.toggle(next)
  persist()
  emit()
  return next
}

/** Stars or unstars a whole selection at once — the multi-select action. */
export function setFavourites(idList: string[], favourite: boolean) {
  for (const id of idList) {
    if (favourite) ids.add(id)
    else ids.delete(id)
  }
  persist()
  emit()
}

/** The live set. Re-renders the caller whenever any screen changes a star. */
export function useFavourites(): Set<string> {
  const [snapshot, setSnapshot] = React.useState(ids)

  React.useEffect(() => {
    const fn = () => setSnapshot(new Set(ids))
    listeners.add(fn)
    void hydrate().then(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])

  return snapshot
}
