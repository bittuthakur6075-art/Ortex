// Analytics consent gate.
//
// tracker.js resolves the visitor's public IP and city through ipapi.co and
// stores them against every page view. Under the DPDP Act 2023 and GDPR that
// needs notice and an affirmative opt-in, so nothing leaves the browser until
// the visitor accepts. Declining still allows anonymous, non-identifying page
// counts (no IP, no city, no third-party call).

const KEY = "ortex_analytics_consent"

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
  } catch (err) {
    console.warn("Consent write failed:", err)
  }
}
