import { lazy } from "react"

// Pages are separate chunks with hashed names. After a deploy, a tab opened
// earlier (or an HTML page a browser or CDN kept) asks for chunk names that no
// longer exist, and the import fails, which used to leave a blank page or a
// spinner for ever. A failed import is retried once (a dropped connection on a
// phone); if it fails again it is almost certainly a stale build, so the page
// reloads itself once to pick up the new HTML. The guard stops a broken
// deploy from reloading in a loop.

const RELOAD_KEY = "ortex_chunk_reload_at"
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

// `reload: false` for optional extras, which should fail quietly instead.
export function lazyWithRetry(importer, { reload = true } = {}) {
  return lazy(async () => {
    try {
      return await importer()
    } catch (first) {
      if (typeof window === "undefined") throw first
      await wait(RETRY_AFTER_MS)
      try {
        return await importer()
      } catch (err) {
        // Never resolves while the page reloads, so nothing flashes meanwhile.
        if (reload && isChunkError(err) && reloadForNewBuild()) return new Promise(() => {})
        throw err
      }
    }
  })
}
