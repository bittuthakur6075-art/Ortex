import AsyncStorage from "@react-native-async-storage/async-storage"

// A read-through mirror of every collection the app lists, so a salesperson in
// a basement showroom still sees their catalogue and contacts. Writes are NOT
// cached: a quotation number comes from the server's atomic `next_sequence`, so
// issuing one offline would risk minting a duplicate. The editor keeps its draft
// locally instead (see useQuotationDraft) and the save is retried when there is
// signal again.

const PREFIX = "@ortex/cache/"

export async function writeCache(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // A full disk must never break a screen that just loaded fine.
  }
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at: number; value: T }
    return parsed.value ?? null
  } catch {
    return null
  }
}

export async function cachedAt(key: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key)
    if (!raw) return null
    return (JSON.parse(raw) as { at: number }).at ?? null
  } catch {
    return null
  }
}

/** Wipe every cached collection — called on sign-out so the next user starts clean. */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const ours = keys.filter((k) => k.startsWith(PREFIX))
    if (ours.length) await AsyncStorage.multiRemove(ours)
  } catch {
    // Nothing actionable; the next sign-in overwrites these anyway.
  }
}
