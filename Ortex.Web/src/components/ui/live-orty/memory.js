// ---- Conversation memory --------------------------------------------------
// Each call opens a brand-new Live session with no server-side history, so on its
// own Anu forgets everything the moment the customer closes the panel. We keep a
// short rolling transcript plus the details captured so far, and on reopen feed
// it back as the opening turn, so she continues as a returning customer instead
// of starting cold.
//
// It lives in SESSION storage, not local storage: the memory holds the caller's
// name, WhatsApp number and what they said, and on a shared or office computer
// local storage handed all of that to the next person to open the site for up
// to six hours. Session storage survives moving between pages and reloads, which
// is what "continue where you left off" needs, and is gone when the tab closes.
export const MEMORY_KEY = "ortex_voice_memory"
export const MEMORY_TTL_MS = 2 * 60 * 60 * 1000 // and never older than 2h, even in a tab left open
export const MAX_MEMORY_LINES = 24

const store = () => {
  try { return window.sessionStorage } catch { return null }
}

// Copies written by earlier builds sit in local storage; remove them once.
try { window.localStorage?.removeItem(MEMORY_KEY) } catch { /* storage blocked */ }

export function saveMemory(value) {
  try { store()?.setItem(MEMORY_KEY, JSON.stringify(value)) } catch { /* full or blocked; memory is best-effort */ }
}

export function loadMemory() {
  try {
    const raw = JSON.parse(store()?.getItem(MEMORY_KEY) || "null")
    if (!raw || raw.v !== 1 || !raw.savedAt) return null
    if (Date.now() - raw.savedAt > MEMORY_TTL_MS) { store()?.removeItem(MEMORY_KEY); return null }
    if (!raw.lead && !(raw.lines && raw.lines.length)) return null
    return raw
  } catch { return null }
}
