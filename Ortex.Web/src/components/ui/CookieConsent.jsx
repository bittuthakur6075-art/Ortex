import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Link } from "react-router-dom"
import { getConsent, setConsent, CONSENT_GRANTED, CONSENT_DENIED } from "../../lib/consent"

/**
 * Shown until the visitor makes a choice. Declining is a first-class button,
 * not a buried link — a "reject" that is harder to reach than "accept" is not
 * valid consent under the DPDP Act or GDPR.
 */
export default function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Defer past first paint so the banner never competes with LCP.
    const timer = setTimeout(() => setVisible(getConsent() === null), 800)
    return () => clearTimeout(timer)
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
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-2xl"
        >
          <div className="bg-card border border-border shadow-2xl rounded-2xl p-5 sm:p-6">
            <h2 className="font-semibold text-foreground">Analytics &amp; your data</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We'd like to record which pages you visit, along with your approximate location
              (derived from your IP address via ipapi.co), to understand how our catalogue is used.
              This is optional and we won't do it unless you agree. Read our{" "}
              <Link to="/cookies" className="text-primary hover:underline font-medium">Cookie Policy</Link>
              {" "}and{" "}
              <Link to="/privacy" className="text-primary hover:underline font-medium">Privacy Policy</Link>.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => choose(CONSENT_GRANTED)}
                className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors cursor-pointer"
              >
                Accept analytics
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
