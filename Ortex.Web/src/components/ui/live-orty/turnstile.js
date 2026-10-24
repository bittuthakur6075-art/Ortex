import { TURNSTILE_SITE_KEY } from "../../../constants/site"

/* ============================================================
   Cloudflare Turnstile: proof that a real browser asks for a voice token.

   Off unless the site's TURNSTILE_SITE_KEY is set (constants/site.js). When
   on, the widget mount calls `primeTurnstile()`, which loads Cloudflare's
   script and solves an invisible challenge in the background, so a token is
   usually waiting before the 5 s auto-open. `takeTurnstileToken()` hands that
   token to the orty-live-token request. A token is single-use, so taking one
   resets the widget for the next call; Cloudflare refreshes an unused token
   before its ~300 s expiry by itself.

   Never blocks a call: if the script is blocked or slow, the request goes out
   without a token after at most 3 s, and the function falls back to a stricter
   rate limit instead of refusing.
   ============================================================ */

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const WAIT_MS = 3000

let loading = null
let widgetId = null
let token = ""
let waiters = []

function settle(value) {
  token = value
  if (!value) return
  const list = waiters
  waiters = []
  list.forEach((resolve) => resolve(value))
}

function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script")
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")))
    s.onerror = () => reject(new Error("turnstile blocked"))
    document.head.appendChild(s)
  }).catch((err) => {
    loading = null // a later mount may try again (the network came back)
    throw err
  })
  return loading
}

/** Load Turnstile and start solving a token. Safe to call more than once. */
export function primeTurnstile() {
  if (!TURNSTILE_SITE_KEY || typeof window === "undefined" || widgetId !== null) return
  loadScript()
    .then((ts) => {
      if (widgetId !== null) return
      const box = document.createElement("div")
      box.setAttribute("aria-hidden", "true")
      box.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;overflow:hidden"
      document.body.appendChild(box)
      widgetId = ts.render(box, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "voice_call",
        appearance: "interaction-only",
        callback: (t) => settle(t),
        "expired-callback": () => settle(""),
        "error-callback": () => {
          settle("")
          return true // handled: no console noise, Cloudflare retries
        },
      })
    })
    .catch(() => { /* blocked: calls go out without a token */ })
}

/**
 * The current token, or one that arrives within 3 s, else undefined. The token
 * is used up by the request, so the widget is reset to solve the next one.
 */
export async function takeTurnstileToken() {
  if (!TURNSTILE_SITE_KEY || typeof window === "undefined") return undefined
  primeTurnstile()
  const got = token || (await new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      waiters = waiters.filter((w) => w !== done)
      resolve("")
    }, WAIT_MS)
    const done = (value) => { window.clearTimeout(timer); resolve(value) }
    waiters.push(done)
  }))
  token = ""
  if (widgetId !== null) {
    try { window.turnstile?.reset(widgetId) } catch { /* next prime renders a fresh one */ }
  }
  return got || undefined
}
