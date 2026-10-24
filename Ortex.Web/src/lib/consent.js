// Analytics consent gate.
//
// With consent, tracker.js records visits in user_activities / event_logs under
// a persistent visitor id, with searches, and resolves the visitor's public IP
// and approximate location through ipapi.co (ipwho.is when that is busy). Under
// the DPDP Act 2023 and GDPR that needs notice and an affirmative opt-in, so
// until the visitor accepts (and again the moment they decline, on the banner
// or on /cookies) only an anonymous page count is kept: no id is stored, no
// location is looked up, no search is recorded.

const KEY = "ortex_analytics_consent"
// Kept in step with tracker.js, which owns the id itself.
const VISITOR_ID_KEY = "ortex_tracking_user_id"
const SESSION_ID_KEY = "ortex_tracking_session_id"
// Earlier builds kept a per-tab id before consent; it is cleared on decline.
const LEGACY_TAB_ID_KEY = "ortex_tracking_user_id_tab"
export const CONSENT_EVENT = "ortex-consent-change"

export const CONSENT_GRANTED = "granted"
export const CONSENT_DENIED = "denied"

/** @returns {"granted"|"denied"|null} null means the visitor hasn't chosen yet. */
export function getConsent() {
  try {
    const value = localStorage.getItem(KEY)
    return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : null
  } catch {
    return null
  }
}

export function hasAnalyticsConsent() {
  return getConsent() === CONSENT_GRANTED
}

export function setConsent(value) {
  try {
    localStorage.setItem(KEY, value)
    // Declining forgets the visitor id, so a later "accept" starts afresh
    // rather than joining the new visits to old ones.
    if (value !== CONSENT_GRANTED) {
      localStorage.removeItem(VISITOR_ID_KEY)
      sessionStorage.removeItem(SESSION_ID_KEY)
      sessionStorage.removeItem(LEGACY_TAB_ID_KEY)
    }
  } catch (err) {
    console.warn("Consent write failed:", err)
  }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
  } catch {
    // An old browser without CustomEvent simply picks the choice up on the next page.
  }
}
