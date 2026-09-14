// Build-time data handoff between scripts/prerender.mjs and the browser.
//
// The prerender fetches the live catalogue and work gallery once, renders each
// page with it, and writes it into the page as a non-executed
// <script type="application/json" id="ortex-data"> block (inert, so a strict
// Content-Security-Policy cannot block it). The hooks
// that would otherwise start from the static fallback and fetch again read it
// as their first state, so the HTML a crawler receives and the first client
// render are the SAME markup (hydration keeps it instead of repainting), and a
// visitor sees real products before any request finishes.
//
// On the server the same object is set on globalThis before rendering.

let browserData

export function getPreloaded(key) {
  if (typeof document === "undefined") return globalThis.__ORTEX_DATA__?.[key]
  if (browserData === undefined) {
    const el = document.getElementById("ortex-data")
    try {
      browserData = el ? JSON.parse(el.textContent) : null
    } catch {
      browserData = null
    }
  }
  return browserData?.[key]
}
