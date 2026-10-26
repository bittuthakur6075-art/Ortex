import { lazy } from "react"

// Pages are separate chunks with hashed names. A push to Development redeploys
// the console, and a tab opened before that asks for chunk names that no longer
// exist: the import fails and the page used to go blank. A failed import is
// retried once (a dropped connection); if it fails again it is almost certainly
// a stale build, so the page reloads itself once to pick up the new one. The
// guard stops a broken deploy from reloading in a loop. Same rule as
// Ortex.Web/src/lib/lazyWithRetry.js.

const RELOAD_KEY = "ortex_console_chunk_reload_at"
const RELOAD_GAP_MS = 30_000
const RETRY_AFTER_MS = 800

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export function isChunkError(err) {
  const text = `${err?.name || ""} ${err?.message || ""}`
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk|Unable to preload/i.test(text)
}

/** Reload once to fetch the current build; false when we reloaded too recently. */
export function reloadForNewBuild() {
  if (typeof window === "undefined") return false
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0
    if (Date.now() - last < RELOAD_GAP_MS) return false
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // Storage blocked: no way to tell a first reload from a loop, so leave it
    // to the error screen's Reload button.
    return false
  }
  window.location.reload()
  return true
}

/** Retry a dynamic import once, then reload once on a stale chunk. */
export async function importWithRetry(importer) {
  try {
    return await importer()
  } catch (first) {
    if (typeof window === "undefined") throw first
    await wait(RETRY_AFTER_MS)
    try {
      return await importer()
    } catch (err) {
      // Never resolves while the page reloads, so nothing flashes meanwhile.
      if (isChunkError(err) && reloadForNewBuild()) return new Promise(() => {})
      throw err
    }
  }
}

export const lazyWithRetry = (importer) => lazy(() => importWithRetry(importer))
