import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { getConsent, setConsent, CONSENT_EVENT, CONSENT_GRANTED, CONSENT_DENIED } from "../../lib/consent"

/**
 * Shown until the visitor makes a choice. Declining is a first-class button,
 * not a buried link: a "reject" that is harder to reach than "accept" is not
 * valid consent under the DPDP Act or GDPR.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Defer past first paint so the banner never competes with LCP.
    const timer = setTimeout(() => setVisible(getConsent() === null), 800)
    // A choice made on /cookies closes the banner too.
    const onChange = () => setVisible(getConsent() === null)
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(CONSENT_EVENT, onChange)
    }
  }, [])

  const choose = (value) => {
    setConsent(value)
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-label="Analytics consent"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] max-lg:[:root:has([data-anu-avoid=on])_&]:bottom-[calc(10rem+env(safe-area-inset-bottom))] max-lg:[:root:has([data-bottom-bar=on])_&]:bottom-[calc(10rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-2xl"
        >
          {/* On a phone the full notice covered the hero and its quote button, so
              there it shrinks to one sentence with the same choice and links. */}
          <div className="bg-card border border-border shadow-2xl rounded-2xl p-4 sm:p-6">
            <h2 className="hidden sm:block font-semibold text-foreground">Analytics &amp; your data</h2>
            <p className="sm:hidden text-[13px] text-muted-foreground leading-snug">
              May we record pages visited and approximate location (via ipapi.co or ipwho.is)? Optional.{" "}
              <Link to="/cookies" className="text-primary font-medium">Cookies</Link>,{" "}
              <Link to="/privacy" className="text-primary font-medium">Privacy</Link>.
            </p>
            <p className="hidden sm:block text-sm text-muted-foreground mt-2 leading-relaxed">
              We'd like to record which pages you visit, along with your approximate location
              (derived from your IP address via ipapi.co, or ipwho.is as a fallback), to understand
              how our catalogue is used. This is optional: nothing is recorded unless you agree, and
              you can change your mind on the Cookie Policy page. Read our{" "}
              <Link to="/cookies" className="text-primary hover:underline font-medium">Cookie Policy</Link>
              {" "}and{" "}
              <Link to="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</Link>.
            </p>
            <div className="mt-3 sm:mt-5 grid grid-cols-2 sm:flex gap-3">
              <button
                onClick={() => choose(CONSENT_GRANTED)}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
              >
                <span className="sm:hidden">Accept</span>
                <span className="hidden sm:inline">Accept analytics</span>
              </button>
              <button
                onClick={() => choose(CONSENT_DENIED)}
                className="px-5 py-2.5 border border-border text-foreground rounded-lg font-semibold hover:bg-muted transition-colors cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
