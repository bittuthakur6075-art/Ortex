// Global auto-refresh ticker.
//
// Data hooks re-fetch on three signals in addition to realtime DB events:
//   • a periodic interval (default 30s) — keeps the panel current even if
//     realtime isn't enabled on a table,
//   • window focus / tab becoming visible — instant catch-up when you return,
//   • the browser coming back online.
// Ticks are skipped while the tab is hidden to avoid needless fetches.

const listeners = new Set()
let started = false
const INTERVAL_MS = 30000

function fire() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return
  listeners.forEach((cb) => cb())
}

function ensureStarted() {
  if (started || typeof window === "undefined") return
  started = true
  setInterval(fire, INTERVAL_MS)
  window.addEventListener("focus", fire)
  window.addEventListener("online", fire)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fire()
  })
}

// Subscribe a re-fetch callback to the auto-refresh signals. Returns unsubscribe.
export function onAutoRefresh(cb) {
  listeners.add(cb)
  ensureStarted()
  return () => listeners.delete(cb)
}
