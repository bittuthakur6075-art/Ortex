import { phoneKey } from "./growth"

// Messaging impact — correlation, not causation: of the WhatsApp messages we
// actually dispatched, how many recipients went on to a won order afterwards?
// wa.me gives no delivery receipt, so "dispatched" (sent/delivered/read) is the
// strongest claim the data supports.
const WA_DISPATCHED = new Set(["sent", "delivered", "read"])

export function computeMessagingImpact({ whatsappLogs = [], quotations = [], invoices = [] }) {
  const dispatched = whatsappLogs.filter((l) => WA_DISPATCHED.has(l.status))

  // Won-order dates per normalized phone.
  const wonDates = {}
  const addWon = (phone, date) => {
    const p = phoneKey({ phone })
    const t = new Date(date).getTime()
    if (p.length >= 7 && !Number.isNaN(t)) (wonDates[p] = wonDates[p] || []).push(t)
  }
  quotations
    .filter((q) => q.status === "accepted" || q.status === "invoiced")
    .forEach((q) => addWon(q.customer?.phone, q.issueDate || q.createdAt))
  invoices
    .filter((i) => i.status !== "cancelled")
    .forEach((i) => addWon(i.customer?.phone, i.issueDate))

  const orderedAfter = (log) => {
    const p = phoneKey({ phone: log.phone })
    const sent = new Date(log.sentAt || log.createdAt).getTime()
    if (!p || Number.isNaN(sent)) return false
    return (wonDates[p] || []).some((t) => t > sent)
  }

  const converted = dispatched.filter(orderedAfter)

  const byTrigger = {}
  dispatched.forEach((l) => {
    const key = l.eventType || l.templateName || "unknown"
    const row = (byTrigger[key] = byTrigger[key] || { trigger: key, dispatched: 0, ordered: 0 })
    row.dispatched += 1
    if (orderedAfter(l)) row.ordered += 1
  })

  return {
    totalDispatched: dispatched.length,
    orderedAfter: converted.length,
    orderedRate: dispatched.length ? Math.round((converted.length / dispatched.length) * 100) : null,
    byTrigger: Object.values(byTrigger).sort((a, b) => b.dispatched - a.dispatched),
  }
}
