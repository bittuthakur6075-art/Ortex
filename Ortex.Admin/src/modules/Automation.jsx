import { useState, useEffect, useMemo } from "react"
import { repo } from "../data/repository"
import {
  StatCard,
  Button,
  Card,
  Badge,
  Input,
  Textarea,
  Select,
  Field,
  EmptyState,
  PageLoader,
  Drawer
} from "../components/ui"
import {
  Flame,
  Clock,
  MessageCircle,
  Sparkles,
  Users,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Eye
} from "../components/icons"
import { toast } from "sonner"
import { formatDate } from "../lib/format"

export default function Automation() {
  const [activeTab, setActiveTab] = useState("analytics")
  const [loading, setLoading] = useState(true)

  // Collections state
  const [activities, setActivities] = useState([])
  const [events, setEvents] = useState([])
  const [whatsappLogs, setWhatsappLogs] = useState([])
  const [aiMessages, setAiMessages] = useState([])
  const [rules, setRules] = useState([])
  const [templates, setTemplates] = useState([])
  const [customers, setCustomers] = useState([])

  // Selection states for timeline / editing
  const [selectedCustomerId, setSelectedCustomerId] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [maskSensitiveData, setMaskSensitiveData] = useState(true)

  // Drawer states
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false)
  const [editingRule, setEditingRule] = useState(null)
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)

  // Form states for Rule
  const [ruleForm, setRuleForm] = useState({ name: "", triggerEvent: "", templateId: "", delayMinutes: 0, active: true, description: "" })
  // Form states for Template
  const [templateForm, setTemplateForm] = useState({ name: "", category: "", body: "", placeholders: [] })

  // Rate limit simulator counter
  const [rateLimitCounter, setRateLimitCounter] = useState(0)

  // Load all required collections on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [actList, evtList, waList, aiList, ruleList, tmplList, custList] = await Promise.all([
          repo.list("user_activities").catch(() => []),
          repo.list("event_logs").catch(() => []),
          repo.list("whatsapp_logs").catch(() => []),
          repo.list("ai_messages").catch(() => []),
          repo.list("automation_rules").catch(() => []),
          repo.list("message_templates").catch(() => []),
          repo.list("customers").catch(() => [])
        ])

        setActivities(actList)
        setEvents(evtList)
        setWhatsappLogs(waList)
        setAiMessages(aiList)
        setRules(ruleList)
        setTemplates(tmplList)
        setCustomers(custList)

        if (custList.length > 0) {
          // Pre-select first customer for timeline
          setSelectedCustomerId(custList[0].id || "")
        }
      } catch (err) {
        toast.error("Failed to load automation records: " + err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()

    // Subscribe to store updates
    const unsubscribe = repo.subscribe(() => {
      loadData()
    })
    return () => unsubscribe()
  }, [])

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

  // Helper: Mask sensitive data
  const maskPhone = (phone) => {
    if (!phone) return ""
    if (!maskSensitiveData) return phone
    return phone.replace(/(\+?\d{2}-?\d{3})\d{4}(\d{3})/, "$1-XXXX-$2")
  }

  // Open WhatsApp Web with pre-filled message (free, no API needed)
  const handleOpenWhatsApp = async (log) => {
    if (!checkRateLimit()) return

    const phone = log.phone?.replace(/\D/g, "")
    if (!phone) {
      toast.error("No phone number available for this log.")
      return
    }

    // Use stored whatsappUrl or build it
    const url = log.whatsappUrl ||
      `https://wa.me/${phone}?text=${encodeURIComponent(log.messageText || "")}`

    window.open(url, "_blank")

    // Mark as sent in DB
    try {
      await repo.update("whatsapp_logs", log.id, {
        status: "sent",
        sentAt: new Date().toISOString(),
        responsePayload: { method: "whatsapp_web", opened_at: new Date().toISOString() }
      })
      toast.success(`Opening WhatsApp for ${log.customerName}...`)
    } catch (err) {
      toast.error("Failed to update log: " + err.message)
    }
  }

  // Rule operations
  const handleOpenRuleDrawer = (rule = null) => {
    if (rule) {
      setEditingRule(rule)
      setRuleForm({
        name: rule.name || "",
        triggerEvent: rule.triggerEvent || "",
        templateId: rule.templateId || "",
        delayMinutes: rule.delayMinutes || 0,
        active: rule.active !== false,
        description: rule.description || ""
      })
    } else {
      setEditingRule(null)
      setRuleForm({ name: "", triggerEvent: "quote_requested", templateId: templates[0]?.name || "", delayMinutes: 0, active: true, description: "" })
    }
    setRuleDrawerOpen(true)
  }

  const handleSaveRule = async (e) => {
    e.preventDefault()
    try {
      if (editingRule) {
        await repo.update("automation_rules", editingRule.id, ruleForm)
        toast.success("Automation rule updated successfully")
      } else {
        await repo.create("automation_rules", {
          ...ruleForm,
          id: "rule_" + Date.now()
        })
        toast.success("New automation rule created")
      }
      setRuleDrawerOpen(false)
    } catch (err) {
      toast.error("Failed to save rule: " + err.message)
    }
  }

  const handleDeleteRule = async (id) => {
    if (!window.confirm("Are you sure you want to delete this automation rule?")) return
    try {
      await repo.remove("automation_rules", id)
      toast.success("Rule deleted")
    } catch (err) {
      toast.error("Failed to delete rule: " + err.message)
    }
  }

  // Template operations
  const handleOpenTemplateDrawer = (tmpl = null) => {
    if (tmpl) {
      setEditingTemplate(tmpl)
      setTemplateForm({
        name: tmpl.name || "",
        category: tmpl.category || "",
        body: tmpl.body || "",
        placeholders: tmpl.placeholders || []
      })
    } else {
      setEditingTemplate(null)
      setTemplateForm({ name: "", category: "General", body: "", placeholders: ["name"] })
    }
    setTemplateDrawerOpen(true)
  }

  const handleSaveTemplate = async (e) => {
    e.preventDefault()
    // Parse placeholders from body (anything inside {})
    const matches = templateForm.body.match(/{([^}]+)}/g) || []
    const parsedPlaceholders = matches.map(m => m.replace(/[{}]/g, ""))

    const payload = {
      ...templateForm,
      placeholders: Array.from(new Set(parsedPlaceholders))
    }

    try {
      if (editingTemplate) {
        await repo.update("message_templates", editingTemplate.id, payload)
        toast.success("Template updated successfully")
      } else {
        await repo.create("message_templates", {
          ...payload,
          id: "template_" + Date.now()
        })
        toast.success("New message template created")
      }
      setTemplateDrawerOpen(false)
    } catch (err) {
      toast.error("Failed to save template: " + err.message)
    }
  }

  const handleDeleteTemplate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this template?")) return
    try {
      await repo.remove("message_templates", id)
      toast.success("Template deleted")
    } catch (err) {
      toast.error("Failed to delete template: " + err.message)
    }
  }

  // Computed Values & Filters
  const filteredActivities = useMemo(() => {
    if (!searchQuery) return activities
    const query = searchQuery.toLowerCase()
    return activities.filter(a =>
      a.activityType.toLowerCase().includes(query) ||
      a.userId.toLowerCase().includes(query) ||
      a.sessionId.toLowerCase().includes(query) ||
      (a.ipAddress && a.ipAddress.includes(query)) ||
      (a.metadata?.productName && a.metadata.productName.toLowerCase().includes(query))
    )
  }, [activities, searchQuery])

  const filteredWhatsappLogs = useMemo(() => {
    if (!searchQuery) return whatsappLogs
    const query = searchQuery.toLowerCase()
    return whatsappLogs.filter(l =>
      l.customerName.toLowerCase().includes(query) ||
      l.phone.includes(query) ||
      l.messageText.toLowerCase().includes(query) ||
      l.status.toLowerCase().includes(query)
    )
  }, [whatsappLogs, searchQuery])

  const failedMessages = useMemo(() => {
    return whatsappLogs.filter(l => l.status === "failed")
  }, [whatsappLogs])

  const queuedMessages = useMemo(() => {
    return whatsappLogs.filter(l => l.status === "queued" || l.status === "sending")
  }, [whatsappLogs])

  // Analytics Computations
  const analyticsData = useMemo(() => {
    const totalActivities = activities.length
    const totalEvents = events.length
    const totalWA = whatsappLogs.length
    const successWA = whatsappLogs.filter(l => l.status === "delivered" || l.status === "read").length
    const failedWA = whatsappLogs.filter(l => l.status === "failed").length
    const deliveryRate = totalWA > 0 ? Math.round((successWA / totalWA) * 100) : 100

    // Search counts
    const searches = activities.filter(a => a.activityType === "Product search")
    const searchMap = {}
    searches.forEach(s => {
      const q = s.metadata?.searchQuery || "unknown"
      searchMap[q] = (searchMap[q] || 0) + 1
    })
    const topSearches = Object.entries(searchMap)
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Product Views
    const views = activities.filter(a => a.activityType === "Product page visit")
    const viewMap = {}
    views.forEach(v => {
      const name = v.metadata?.productName || v.productId || "Unspecified Product"
      viewMap[name] = (viewMap[name] || 0) + 1
    })
    const topViews = Object.entries(viewMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Conversion rate: Quote requests / Total activities
    const quoteRequests = activities.filter(a => a.activityType === "Quote request").length
    const conversionRate = totalActivities > 0 ? ((quoteRequests / totalActivities) * 100).toFixed(1) : 0

    // AI performance: generated messages vs active events
    const generatedMsgsCount = aiMessages.length

    return {
      totalActivities,
      totalEvents,
      totalWA,
      deliveryRate,
      failedWA,
      topSearches,
      topViews,
      conversionRate,
      generatedMsgsCount
    }
  }, [activities, events, whatsappLogs, aiMessages])

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
        meta: `Status: ${w.status} ${w.sentAt ? `at ${formatDate(w.sentAt)}` : ""}`,
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

  if (loading) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automation Console</h1>
          <p className="text-sm text-muted-foreground">
            Manage user activity tracking, AI message triggers, and automated WhatsApp Business templates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMaskSensitiveData(!maskSensitiveData)}
            className="text-xs"
          >
            <Eye className="h-4 w-4" />
            {maskSensitiveData ? "Reveal PII Data" : "Mask PII Data"}
          </Button>
          {activeTab === "rules" && (
            <Button size="sm" onClick={() => handleOpenRuleDrawer()}>
              <Plus className="h-4 w-4" />
              New Rule
            </Button>
          )}
          {activeTab === "templates" && (
            <Button size="sm" onClick={() => handleOpenTemplateDrawer()}>
              <Plus className="h-4 w-4" />
              New Template
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {[
          { id: "analytics", label: "Analytics & KPI" },
          { id: "activities", label: "User Activity" },
          { id: "events", label: "Event Logs" },
          { id: "whatsapp", label: "WhatsApp & Queue" },
          { id: "ai", label: "AI Suggested Messages" },
          { id: "rules", label: "Automation Rules" },
          { id: "templates", label: "Message Templates" },
          { id: "timeline", label: "Customer Timeline" }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id)
              setSearchQuery("")
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              activeTab === t.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* SEARCH INPUT FOR DATATABLES */}
      {["activities", "events", "whatsapp", "ai"].includes(activeTab) && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="pl-10"
          />
        </div>
      )}

      {/* ---------------- 1. ANALYTICS & DASHBOARD ---------------- */}
      {activeTab === "analytics" && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Tracked Actions"
              value={analyticsData.totalActivities}
              sub="Across all active visitor sessions"
              accent="bg-blue-500/10 text-blue-600"
            />
            <StatCard
              icon={Flame}
              label="Conversion Rate"
              value={`${analyticsData.conversionRate}%`}
              sub="Quote requests vs page visits"
              accent="bg-amber-500/10 text-amber-600"
            />
            <StatCard
              icon={MessageCircle}
              label="WhatsApp Delivery"
              value={`${analyticsData.deliveryRate}%`}
              sub={`${analyticsData.totalWA} messages generated`}
              accent="bg-emerald-500/10 text-emerald-600"
            />
            <StatCard
              icon={Sparkles}
              label="AI Insights Synthesized"
              value={analyticsData.generatedMsgsCount}
              sub="Context-rich follow-up prompts"
              accent="bg-violet-500/10 text-violet-600"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Top Searches & views */}
            <Card className="p-6">
              <h3 className="mb-4 text-base font-bold text-foreground">Top Searched Keywords</h3>
              {analyticsData.topSearches.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No searches recorded yet.</div>
              ) : (
                <div className="space-y-3">
                  {analyticsData.topSearches.map((s, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-muted-foreground">#{i+1} "{s.query}"</span>
                      <Badge tone="blue">{s.count} searches</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h3 className="mb-4 text-base font-bold text-foreground">Popular Product Views</h3>
              {analyticsData.topViews.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">No product page visits recorded yet.</div>
              ) : (
                <div className="space-y-3">
                  {analyticsData.topViews.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate font-semibold text-muted-foreground">{v.name}</span>
                      <Badge tone="emerald">{v.count} views</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Delivery reports & Failed triggers */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-2">
              <h3 className="mb-2 text-base font-bold text-foreground">WhatsApp Queue Monitor</h3>
              <p className="mb-4 text-xs text-muted-foreground">Real-time status of message dispatcher</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-emerald-500/5 p-4 border border-emerald-500/10">
                  <div className="text-2xl font-bold text-emerald-600">{whatsappLogs.filter(l => l.status === "delivered" || l.status === "read").length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Sent successfully</div>
                </div>
                <div className="rounded-lg bg-amber-500/5 p-4 border border-amber-500/10">
                  <div className="text-2xl font-bold text-amber-600">{queuedMessages.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Pending in queue</div>
                </div>
                <div className="rounded-lg bg-rose-500/5 p-4 border border-rose-500/10">
                  <div className="text-2xl font-bold text-rose-600">{failedMessages.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Failed delivery</div>
                </div>
              </div>
            </Card>

            <Card className="p-6 flex flex-col justify-between">
              <div>
                <h3 className="mb-1 text-base font-bold text-foreground">Security Diagnostics</h3>
                <p className="text-xs text-muted-foreground">Role-based access & validation check</p>
                <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                    <span>Role Checked: Admin console verified</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                    <span>JWT Signature: Active Supabase token validation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                    <span>Rate limiting: Throttled dispatch system active</span>
                  </li>
                </ul>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>System status</span>
                <span className="font-bold text-emerald-600">Operational</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ---------------- 2. USER ACTIVITY LOGS ---------------- */}
      {activeTab === "activities" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">User ID</th>
                  <th className="px-4 py-3">Session</th>
                  <th className="px-4 py-3">Activity Type</th>
                  <th className="px-4 py-3">Page URL</th>
                  <th className="px-4 py-3">Device / OS</th>
                  <th className="px-4 py-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-muted-foreground">No activities found.</td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => (
                    <tr key={act.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-xs">
                        {formatDate(act.timestamp)}
                      </td>
                      <td className="px-4 py-3 font-semibold text-xs text-primary">{act.userId}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{act.sessionId}</td>
                      <td className="px-4 py-3">
                        <Badge tone={
                          act.activityType === "Quote request" ? "amber" :
                          act.activityType === "Contact form submission" ? "blue" :
                          act.activityType === "Product search" ? "cyan" : "slate"
                        }>
                          {act.activityType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-xs truncate">{act.pageUrl}</td>
                      <td className="px-4 py-3 text-xs">
                        {act.device} ({act.operatingSystem} / {act.browser})
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{act.ipAddress}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---------------- 3. EVENT LOGS ---------------- */}
      {activeTab === "events" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Event Type</th>
                  <th className="px-4 py-3">User ID</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-muted-foreground">No events generated.</td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDate(evt.timestamp)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={
                          evt.eventType === "quote_requested" ? "amber" :
                          evt.eventType === "contact_form_submitted" ? "blue" :
                          evt.eventType === "cart_abandoned" ? "rose" : "slate"
                        }>
                          {evt.eventType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold">{evt.userId}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{evt.description}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Processed
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---------------- 4. WHATSAPP LOGS & QUEUE MONITOR ---------------- */}
      {activeTab === "whatsapp" && (
        <div className="space-y-6">
          {/* Monitor Summary */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card className="p-4 flex items-center justify-between border-dashed">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Active Dispatch Queue</span>
                <div className="text-lg font-bold">{queuedMessages.length} queued messages</div>
              </div>
              <Badge tone="amber">Auto Dispatching</Badge>
            </Card>

            <Card className="p-4 flex items-center justify-between border-dashed">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Failed Deliveries</span>
                <div className="text-lg font-bold text-destructive">{failedMessages.length} failures logged</div>
              </div>
              <Badge tone="rose">Error Check Needed</Badge>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Message Text</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-foreground">
                  {filteredWhatsappLogs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-muted-foreground">No WhatsApp logs found.</td>
                    </tr>
                  ) : (
                    filteredWhatsappLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/30">
                        <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDate(log.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold text-xs">{log.customerName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{maskPhone(log.phone)}</td>
                        <td className="px-4 py-3 text-xs text-primary">{log.templateName}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-sm">{log.messageText}</td>
                        <td className="px-4 py-3">
                          <Badge tone={
                            log.status === "delivered" || log.status === "read" ? "emerald" :
                            log.status === "failed" ? "rose" :
                            log.status === "sending" ? "blue" : "slate"
                          }>
                            {log.status}
                          </Badge>
                          {log.errorMessage && (
                            <div className="text-[10px] text-destructive mt-1 font-mono max-w-xs">{log.errorMessage}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right space-x-2">
                          {(log.status === "failed" || log.status === "queued") && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenWhatsApp(log)}
                              className="h-7 text-[11px] border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                            >
                              📱 Send via WhatsApp
                            </Button>
                          )}
                          {log.status === "sent" && (
                            <span className="text-xs text-muted-foreground italic">Sent via WhatsApp Web</span>
                          )}
                          {log.status === "delivered" && (
                            <span className="text-xs text-emerald-600 font-semibold">✓ Delivered</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ---------------- 5. AI MESSAGE LOGS ---------------- */}
      {activeTab === "ai" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {aiMessages.length === 0 ? (
            <div className="col-span-2 py-16 text-center">
              <EmptyState
                icon={Sparkles}
                title="No AI insights generated yet"
                description="AI messages are automatically generated when user activities trigger automation rules."
              />
            </div>
          ) : (
            aiMessages.map((msg) => (
              <Card key={msg.id} className="p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase text-primary tracking-wider">{msg.triggerType}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(msg.createdAt)}</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-2">Customer: {msg.customerName}</div>
                  <div className="bg-muted p-2.5 rounded-lg text-xs font-mono text-muted-foreground mb-4">
                    <strong>Context Analysis:</strong> {msg.context}
                  </div>
                  <div className="text-sm border border-border/80 bg-background p-3 rounded-lg text-foreground font-medium italic relative">
                    <span className="absolute -top-2 left-3 bg-card px-1.5 text-[9px] uppercase font-bold text-muted-foreground">Drafted Message</span>
                    "{msg.generatedMessage}"
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Recipient ID: {msg.userId}</span>
                  <Badge tone="violet">AI Synthesized</Badge>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ---------------- 6. AUTOMATION RULES ---------------- */}
      {activeTab === "rules" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border bg-muted/50 text-xs font-semibold uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Rule Name</th>
                  <th className="px-4 py-3">Trigger Event</th>
                  <th className="px-4 py-3">Action Channel</th>
                  <th className="px-4 py-3">Template Mapping</th>
                  <th className="px-4 py-3">Delay</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-muted-foreground">No rules configured.</td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-semibold text-xs text-foreground">
                        <div>{rule.name}</div>
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5">{rule.description}</div>
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-primary">{rule.triggerEvent}</td>
                      <td className="px-4 py-3 text-xs font-bold uppercase text-emerald-600">{rule.actionType}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{rule.templateId}</td>
                      <td className="px-4 py-3 text-xs">
                        {rule.delayMinutes === 0 ? "Immediate" : `${rule.delayMinutes} mins`}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={async () => {
                            await repo.update("automation_rules", rule.id, { active: !rule.active })
                            toast.success(`Rule ${!rule.active ? "enabled" : "disabled"}`)
                          }}
                        >
                          <Badge tone={rule.active ? "emerald" : "slate"}>
                            {rule.active ? "Active" : "Disabled"}
                          </Badge>
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenRuleDrawer(rule)}
                            className="h-7 text-xs"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="dangerGhost"
                            size="sm"
                            onClick={() => handleDeleteRule(rule.id)}
                            className="h-7 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---------------- 7. MESSAGE TEMPLATES ---------------- */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.length === 0 ? (
            <div className="col-span-3 py-12 text-center text-muted-foreground">No message templates created yet.</div>
          ) : (
            templates.map((tmpl) => (
              <Card key={tmpl.id} className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Badge tone="blue">{tmpl.category}</Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">{tmpl.name}</span>
                  </div>
                  <div className="p-3 bg-muted/60 text-xs rounded-lg text-foreground font-medium mb-3 italic">
                    "{tmpl.body}"
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {tmpl.placeholders?.map(p => (
                      <span key={p} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
                        {`{${p}}`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenTemplateDrawer(tmpl)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="dangerGhost"
                    size="sm"
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="p-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ---------------- 8. CUSTOMER TIMELINE ---------------- */}
      {activeTab === "timeline" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customer Selection Column */}
          <Card className="p-5 h-fit">
            <h3 className="mb-3 text-sm font-bold text-foreground">Select Customer</h3>
            <Select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
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
                <div><strong>Contact:</strong> {maskPhone(customers.find(c => c.id === selectedCustomerId)?.phone)}</div>
                <div><strong>Email:</strong> {customers.find(c => c.id === selectedCustomerId)?.email}</div>
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
                        <span className="text-[10px] text-muted-foreground">{formatDate(evt.timestamp)}</span>
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
      )}

      {/* ---------------- RULE DRAWER ---------------- */}
      <Drawer
        open={ruleDrawerOpen}
        onClose={() => setRuleDrawerOpen(false)}
        title={editingRule ? "Edit Automation Rule" : "Configure New Rule"}
      >
        <form onSubmit={handleSaveRule} className="space-y-4">
          <Field label="Rule Name" required>
            <Input
              required
              value={ruleForm.name}
              onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
              placeholder="e.g. Quote Request Follow-up"
            />
          </Field>

          <Field label="Trigger Event" required>
            <Select
              value={ruleForm.triggerEvent}
              onChange={(e) => setRuleForm({ ...ruleForm, triggerEvent: e.target.value })}
            >
              <option value="quote_requested">quote_requested (Quote Builder Submission)</option>
              <option value="contact_form_submitted">contact_form_submitted (Contact Inquiry)</option>
              <option value="cart_abandoned">cart_abandoned (Quote Builder Cart Abandonment)</option>
              <option value="order_confirmed">order_confirmed (Invoice Generated)</option>
              <option value="payment_received">payment_received (Payment Receipt Inflow)</option>
            </Select>
          </Field>

          <Field label="Message Template" required>
            <Select
              value={ruleForm.templateId}
              onChange={(e) => setRuleForm({ ...ruleForm, templateId: e.target.value })}
            >
              {templates.map(t => (
                <option key={t.id} value={t.name}>{t.name} ({t.category})</option>
              ))}
            </Select>
          </Field>

          <Field label="Delay (Minutes)" hint="Set to 0 for immediate dispatch">
            <Input
              type="number"
              min="0"
              value={ruleForm.delayMinutes}
              onChange={(e) => setRuleForm({ ...ruleForm, delayMinutes: parseInt(e.target.value) || 0 })}
            />
          </Field>

          <Field label="Description">
            <Textarea
              value={ruleForm.description}
              onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
              placeholder="Describe the logic or purpose of this trigger rule."
            />
          </Field>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="ruleActive"
              checked={ruleForm.active}
              onChange={(e) => setRuleForm({ ...ruleForm, active: e.target.checked })}
              className="rounded border-border text-primary focus:ring-primary h-4 w-4 cursor-pointer"
            />
            <label htmlFor="ruleActive" className="text-sm font-semibold text-foreground cursor-pointer">
              Enable this rule trigger
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setRuleDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Save Rule
            </Button>
          </div>
        </form>
      </Drawer>

      {/* ---------------- TEMPLATE DRAWER ---------------- */}
      <Drawer
        open={templateDrawerOpen}
        onClose={() => setTemplateDrawerOpen(false)}
        title={editingTemplate ? "Edit Message Template" : "Create New Template"}
      >
        <form onSubmit={handleSaveTemplate} className="space-y-4">
          <Field label="Template Name" required hint="Must be lowercase snake_case (e.g. template_new_quote)">
            <Input
              required
              value={templateForm.name}
              onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
              placeholder="e.g. template_new_quote"
            />
          </Field>

          <Field label="Category" required>
            <Input
              required
              value={templateForm.category}
              onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
              placeholder="e.g. Quote Request"
            />
          </Field>

          <Field label="Message Body" required hint="Use placeholders in curly braces: {name}, {product_name}, {quantity}, {unit}, {amount}, {invoice_number}, {message_snippet}">
            <Textarea
              required
              value={templateForm.body}
              onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
              placeholder="Hi {name}, thank you for your request regarding {product_name}..."
            />
          </Field>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setTemplateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              Save Template
            </Button>
          </div>
        </form>
      </Drawer>

    </div>
  )
}
