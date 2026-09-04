// ---- Conversation memory --------------------------------------------------
// Each call opens a brand-new Live session with no server-side history, so on its
// own Anu forgets everything the moment the customer closes the panel. We keep a
// short rolling transcript plus the details captured so far in localStorage, and
// on reopen feed it back as the opening turn, so she continues as a returning
// customer instead of starting cold.
export const MEMORY_KEY = "ortex_voice_memory"
export const MEMORY_TTL_MS = 6 * 60 * 60 * 1000 // forget after 6h so a stale chat can't resurface
export const MAX_MEMORY_LINES = 24

export function loadMemory() {
  try {
    const raw = JSON.parse(localStorage.getItem(MEMORY_KEY) || "null")
    if (!raw || raw.v !== 1 || !raw.savedAt) return null
    if (Date.now() - raw.savedAt > MEMORY_TTL_MS) { localStorage.removeItem(MEMORY_KEY); return null }
    if (!raw.lead && !(raw.lines && raw.lines.length)) return null
    return raw
  } catch { return null }
}
