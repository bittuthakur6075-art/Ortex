import { useMemo } from "react"
import { Card, Select } from "../../components/ui/Ui"
import { Flame, Clock, MessageCircle, Sparkles } from "../../components/ui/Icons"
import { formatDateTime } from "../../lib/format"
import { maskPhone, maskEmail } from "./helpers"

export default function TimelineTab({ customers, selectedCustomerId, onSelectCustomer, maskSensitiveData, activities, whatsappLogs, aiMessages }) {
  // Customer Timeline Computations
  const customerTimelineEvents = useMemo(() => {
    if (!selectedCustomerId) return []

    // Find user ID from selected customer
    const customer = customers.find(c => c.id === selectedCustomerId)
    if (!customer) return []

    const customerEmail = customer.email || ""
    const customerPhone = customer.phone || ""
    const customerName = customer.name || ""

    // Match activities based on user ID or metadata details
    const matchedActivities = activities.filter(a => {
      if (a.userId === customer.id) return true
      if (a.metadata?.customer?.email === customerEmail) return true
      if (a.metadata?.customer?.phone === customerPhone) return true
      return false
    })

    // Match Whatsapp notifications
    const matchedWA = whatsappLogs.filter(l =>
      l.phone === customerPhone || l.customerName === customerName
    )

    // Match AI Messages
    const matchedAI = aiMessages.filter(m =>
      m.customerName === customerName
    )

    // Compile into timeline events
    const timeline = []

    matchedActivities.forEach(a => {
      timeline.push({
        type: "activity",
        title: a.activityType,
        desc: a.activityType === "Product search"
          ? `Searched: "${a.metadata?.searchQuery}"`
          : a.activityType === "Product page visit"
            ? `Viewed product: ${a.metadata?.productName || "Product page"}`
            : a.activityType === "Quote request"
              ? `Requested bulk quote estimate`
              : `Navigated to ${a.pageUrl}`,
        timestamp: a.timestamp,
        meta: `${a.browser} on ${a.operatingSystem} (${a.ipAddress})`,
        icon: a.activityType === "Quote request" ? Flame : Clock,
        tone: a.activityType === "Quote request" ? "amber" : "blue"
      })
    })

    matchedWA.forEach(w => {
      timeline.push({
        type: "whatsapp",
        title: "WhatsApp Notification",
        desc: `[${w.templateName}] - "${w.messageText}"`,
        timestamp: w.createdAt,
        meta: `Status: ${w.status} ${w.sentAt ? `at ${formatDateTime(w.sentAt)}` : ""}`,
        icon: MessageCircle,
        tone: w.status === "delivered" || w.status === "read" ? "emerald" : w.status === "failed" ? "rose" : "slate"
      })
    })

    matchedAI.forEach(m => {
      timeline.push({
        type: "ai",
        title: "AI Message Generated",
        desc: `AI synthesized suggestion based on: "${m.context}"`,
        timestamp: m.createdAt,
        meta: `Generated Message: "${m.generatedMessage}"`,
        icon: Sparkles,
        tone: "violet"
      })
    })

    // Sort descending chronologically
    return timeline.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [selectedCustomerId, activities, whatsappLogs, aiMessages, customers])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Customer Selection Column */}
      <Card className="p-5 h-fit">
        <h3 className="mb-3 text-sm font-bold text-foreground">Select Customer</h3>
        <Select
          value={selectedCustomerId}
          onChange={(e) => onSelectCustomer(e.target.value)}
          className="mb-4"
        >
          <option value="" disabled>Choose a customer...</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>
              {c.company ? `${c.company} (${c.name})` : c.name}
            </option>
          ))}
        </Select>
        {selectedCustomerId && (
          <div className="space-y-2 text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg">
            <div><strong>Contact:</strong> {maskPhone(customers.find(c => c.id === selectedCustomerId)?.phone, maskSensitiveData)}</div>
            <div><strong>Email:</strong> {maskEmail(customers.find(c => c.id === selectedCustomerId)?.email, maskSensitiveData)}</div>
            <div><strong>Company:</strong> {customers.find(c => c.id === selectedCustomerId)?.company || "N/A"}</div>
          </div>
        )}
      </Card>

      {/* Timeline Feed Column */}
      <Card className="p-6 lg:col-span-2 space-y-6">
        <h3 className="text-base font-bold text-foreground">Chronological Touchpoint Timeline</h3>

        {customerTimelineEvents.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No tracked events or WhatsApp interactions found for this customer.
          </div>
        ) : (
          <div className="relative border-l border-border pl-6 space-y-6 ml-3">
            {customerTimelineEvents.map((evt, i) => (
              <div key={i} className="relative">
                {/* Circle Node */}
                <span className={`absolute -left-9.5 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-card border border-border shadow-sm`}>
                  <evt.icon className={`h-3.5 w-3.5 text-foreground`} />
                </span>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">{evt.title}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDateTime(evt.timestamp)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed italic bg-muted/20 p-2 rounded">
                    {evt.desc}
                  </p>
                  {evt.meta && (
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {evt.meta}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
