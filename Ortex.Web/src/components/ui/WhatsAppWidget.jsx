import { motion, AnimatePresence } from "framer-motion"
import { whatsappLink } from "../../constants/site"
import { useState, useEffect } from "react"
import WhatsAppIcon from "./WhatsAppIcon"

export default function WhatsAppWidget() {
  const [showTooltip, setShowTooltip] = useState(false)

  // Auto-show tooltip once after 5 seconds to catch user's attention
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTooltip(true)
    }, 5000)

    // Hide tooltip after 5 seconds of display
    const hideTimer = setTimeout(() => {
      setShowTooltip(false)
    }, 10000)

    return () => {
      clearTimeout(timer)
      clearTimeout(hideTimer)
    }
  }, [])

  const customMessage = "Hi Ortex Industries! I am visiting your website and would like to inquire about customized corporate gifting/MDF/acrylic products."
  const link = whatsappLink(customMessage)

  return (
    <div className="fixed left-6 bottom-6 z-40 flex items-center">
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, x: -10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -10, scale: 0.95 }}
            className="hidden md:flex bg-card text-foreground border border-border px-4 py-2 rounded-xl shadow-lg mr-3 text-sm font-semibold hover:text-primary transition-colors items-center gap-2"
          >
            <span>Need quick pricing? Chat on WhatsApp</span>
            <span className="w-2 h-2 rounded-full bg-whatsapp animate-pulse" />
          </motion.a>
        )}
      </AnimatePresence>

      {/* Main Floating Button */}
      <motion.a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="w-14 h-14 rounded-full bg-whatsapp hover:bg-whatsapp/90 flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 relative group cursor-pointer"
        aria-label="Chat on WhatsApp"
      >
        {/* Pulsing ring */}
        <span className="absolute -inset-1 rounded-full bg-whatsapp/25 animate-ping opacity-75 -z-10 group-hover:animate-none" />
        
        {/* WhatsApp Icon */}
        <WhatsAppIcon className="h-7 w-7 text-white fill-current" />
      </motion.a>
    </div>
  )
}
