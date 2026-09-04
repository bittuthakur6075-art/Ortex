import { useState } from "react"
import { toast } from "sonner"
import { repo } from "../../data/store/repository"

// Browser-side send throttle plus the wa.me hand-off for a whatsapp_logs row.
export function useWhatsAppDispatch() {
  // Rate limit simulator counter
  const [rateLimitCounter, setRateLimitCounter] = useState(0)

  // Throttling Rate Limiting Check
  const checkRateLimit = () => {
    if (rateLimitCounter > 5) {
      toast.warning("Rate Limit Exceeded: Throttling automated messages. Maximum 5 triggers per minute in trial mode.")
      return false
    }
    setRateLimitCounter(prev => prev + 1)
    setTimeout(() => {
      setRateLimitCounter(prev => Math.max(0, prev - 1))
    }, 60000)
    return true
  }

  // Open WhatsApp Web with pre-filled message (free, no API needed)
  const handleOpenWhatsApp = async (log) => {
    if (!checkRateLimit()) return

    const phone = log.phone?.replace(/\D/g, "")
    if (!phone) {
      toast.error("No phone number available for this log.")
      return
    }

    // Always rebuild the link from the digit-only phone and the message text.
    // whatsapp_logs.whatsappUrl is a DB field, so it is never passed to
    // window.open verbatim (a "javascript:" value would run in this origin).
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(log.messageText || "")}`

    window.open(url, "_blank", "noopener")

    // Mark as sent in DB
    try {
      await repo.update("whatsapp_logs", log.id, {
        status: "sent",
        sentAt: new Date().toISOString(),
        // A retried log carries the previous failure's message; without this it
        // renders a red API error under the fresh "sent" badge.
        errorMessage: "",
        responsePayload: { method: "whatsapp_web", opened_at: new Date().toISOString() }
      })
      toast.success(`Opening WhatsApp for ${log.customerName}...`)
    } catch (err) {
      toast.error("Failed to update log: " + err.message)
    }
  }

  return { handleOpenWhatsApp }
}
