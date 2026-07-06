import { motion, AnimatePresence } from "framer-motion"
import { whatsappLink } from "../../constants/site"
import { useState, useEffect } from "react"

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
        <svg 
          className="h-7 w-7 text-white fill-current" 
          viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.62.962 3.21 1.468 4.797 1.469 5.378-.001 9.756-4.379 9.759-9.76.002-2.607-1.013-5.059-2.859-6.907C16.438 2.11 13.99 1.096 11.385 1.096 6.006 1.096 1.628 5.474 1.625 10.855c-.001 1.639.489 3.238 1.419 4.7l-.986 3.603 3.699-.97c1.472.842 2.87 1.34 4.545 1.34zM17.476 14.39c-.329-.165-1.948-.96-2.253-1.071-.305-.11-.527-.165-.749.165-.221.329-.857 1.071-1.05 1.29-.193.22-.387.247-.716.082-1.099-.548-1.867-1.026-2.607-2.296-.195-.334-.195-.568-.03-.733.149-.148.329-.384.494-.576.165-.192.22-.329.329-.548.11-.22.055-.412-.028-.577-.082-.165-.749-1.808-1.026-2.476-.27-.648-.544-.56-.749-.57-.193-.01-.415-.011-.637-.011-.222 0-.582.083-.887.412-.305.329-1.164 1.14-1.164 2.784 0 1.644 1.196 3.23 1.361 3.45.165.22 2.353 3.593 5.7 5.039.796.344 1.417.55 1.902.705.8.254 1.528.218 2.103.133.64-.095 1.948-.796 2.223-1.564.276-.768.276-1.426.192-1.563-.083-.138-.305-.22-.634-.385z"/>
        </svg>
      </motion.a>
    </div>
  )
}
