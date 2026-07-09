import { useState, useEffect, useMemo } from "react"
import { repo } from "../data/repository"
import { hasSupabase } from "../data/supabaseClient"
import { useProfile } from "../data/profile"
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
  AlertTriangle,
  Eye
} from "../components/icons"
import { toast } from "sonner"
import { formatDate, formatDateTime } from "../lib/format"

// Trigger events a rule can actually fire on. These are exactly the eventTypes
// Ortex.Web's tracker.js emits AND the automation-engine accepts — a rule on
// anything else can never run. Keep in sync with ALLOWED_EVENTS in
// supabase/functions/automation-engine/index.ts.
const TRIGGER_EVENTS = [
  { value: "quote_requested", label: "quote_requested (Quote Builder Submission)" },
  { value: "contact_form_submitted", label: "contact_form_submitted (Contact Inquiry)" },
  { value: "product_visited", label: "product_visited (Product Page View)" },
  { value: "search_performed", label: "search_performed (Product Search)" },
  { value: "cart_added", label: "cart_added (Added to Quote Cart)" },
  { value: "pdf_downloaded", label: "pdf_downloaded (Catalogue Download)" },
]

// Opening wa.me hands a pre-filled chat to WhatsApp Web; nothing reports back.
// So "delivered"/"read" are only ever written by the demo seed and the local
// mock — against Supabase a log goes queued -> sent and stops. Scoring success
// as delivered/read therefore pinned the headline metric at 0% and made every
// message the admin actually sent vanish from the queue tiles (`sent` matched
// none of them). We report dispatch, which is the thing this integration knows.
const WA_DISPATCHED = ["sent", "delivered", "read"]
const WA_PENDING = ["queued", "sending"]

const EVENT_TONES = {
  quote_requested: "amber",
  contact_form_submitted: "blue",
  cart_added: "cyan",
  cart_removed: "rose",
  product_visited: "slate",
  search_performed: "slate",
  pdf_downloaded: "slate",
}

// PII masking. Both helpers work off digit/character positions rather than
// matching an expected format, and mask *everything* when the value can't be
// parsed. The previous phone mask was a single regex over `+dd-ddd dddd ddd`,
// so a bare 10-digit number — what visitors actually type — matched nothing and
// String.replace returned it untouched: the UI claimed PII was hidden while
// rendering it in full. A mask that fails open is worse than no mask at all.
const maskPhone = (phone, mask = true) => {
  if (!phone) return ""
  const s = String(phone)
  if (!mask) return s
  const digitCount = (s.match(/\d/g) || []).length
  if (digitCount <= 4) return s.replace(/\d/g, "•")
  const keepFrom = digitCount - 4
  let seen = 0
  return s.replace(/\d/g, (d) => (seen++ >= keepFrom ? d : "•"))
}

const maskEmail = (email, mask = true) => {
  if (!email) return ""
  const s = String(email)
  if (!mask) return s
  const at = s.lastIndexOf("@")
  if (at < 1) return "•".repeat(s.length)
  return `${s[0]}${"•".repeat(at - 1)}${s.slice(at)}`
}

const renderMetadata = (act, mask = true) => {
  const meta = act.metadata || {}
  const items = []
  if (act.productId) items.push(`Product ID: ${act.productId}`)
  if (meta.productName) items.push(`Product: ${meta.productName}`)
  if (meta.searchQuery) items.push(`Query: "${meta.searchQuery}"`)
  if (meta.quantity) items.push(`Qty: ${meta.quantity}`)
  if (meta.action) items.push(`Action: ${meta.action}`)
  if (meta.fileName) items.push(`File: ${meta.fileName}`)
  if (meta.customer?.name) items.push(`Name: ${meta.customer.name}`)
  if (meta.customer?.email) items.push(`Email: ${maskEmail(meta.customer.email, mask)}`)
  if (meta.customer?.phone) items.push(`Phone: ${maskPhone(meta.customer.phone, mask)}`)
  if (meta.message) {
    const msg = String(meta.message)
    items.push(`Msg: "${msg.substring(0, 40)}${msg.length > 40 ? '...' : ''}"`)
  }

  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {items.map((item, idx) => (
        <span key={idx} className="bg-muted px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground font-medium">
          {item}
        </span>
      ))}
    </div>
  )
}

// Report only what the tracker actually recorded. This used to fall back to a
// four-entry IP->city table and, failing that, return "Delhi, India" for *any*
// unrecognised address — inventing a location for real visitors and presenting
// the guess as fact. Rows with no geolocation now say so.
const renderLocation = (act) => {
  if (act.location) return act.location
  if (act.city && act.country) return `${act.city}, ${act.country}`
  if (!act.ipAddress || act.ipAddress === "127.0.0.1" || act.ipAddress === "::1") return "Localhost"
  return <span className="text-muted-foreground">Unknown</span>
}

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

  // Collections that failed to load (RLS denial, network) — fed to diagnostics.
  const [loadErrors, setLoadErrors] = useState([])

  const profile = useProfile()

  // Load all required collections on mount
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)

        // Record which collections we couldn't read instead of swallowing the
        // error. An RLS denial used to fall back to [], rendering as "No
        // activities found" — indistinguishable from a table that is simply
        // empty. Security Diagnostics reports whatever lands in `failures`.
        const failures = []
        const safeList = (name) =>
          repo.list(name).catch((err) => {
            console.error(`Failed to load ${name}:`, err)
            failures.push(name)
            return []
          })

        const [actList, evtList, waList, aiList, ruleList, tmplList, custList] = await Promise.all([
          safeList("user_activities"),
          safeList("event_logs"),
          safeList("whatsapp_logs"),
          safeList("ai_messages"),
          safeList("automation_rules"),
          safeList("message_templates"),
          safeList("customers")
        ])

        setLoadErrors(failures)
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

  // Rules used to store the template's name in `templateId`. Map that back to a
  // real id when editing, so an old rule is migrated on its next save. An
  // unresolvable ref (template deleted) falls back to the built-in message.
  const resolveTemplateId = (stored) => {
    if (!stored) return ""
    if (templates.some(t => t.id === stored)) return stored
    return templates.find(t => t.name === stored)?.id || ""
  }

  const templateNameFor = (stored) =>
    templates.find(t => t.id === stored)?.name || templates.find(t => t.name === stored)?.name || ""

  // Rule operations
  const handleOpenRuleDrawer = (rule = null) => {
    if (rule) {
      setEditingRule(rule)
      setRuleForm({
        name: rule.name || "",
        triggerEvent: rule.triggerEvent || "",
        templateId: resolveTemplateId(rule.templateId),
        delayMinutes: rule.delayMinutes || 0,
        active: rule.active !== false,
        description: rule.description || ""
      })
    } else {
      setEditingRule(null)
      setRuleForm({ name: "", triggerEvent: "quote_requested", templateId: templates[0]?.id || "", delayMinutes: 0, active: true, description: "" })
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
        await repo.create("automation_rules", ruleForm)
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
        await repo.create("message_templates", payload)
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
      (a.activityType || "").toLowerCase().includes(query) ||
      (a.userId || "").toLowerCase().includes(query) ||
      (a.sessionId || "").toLowerCase().includes(query) ||
      (a.ipAddress || "").includes(query) ||
      (a.location || "").toLowerCase().includes(query) ||
      (a.city || "").toLowerCase().includes(query) ||
      (a.country || "").toLowerCase().includes(query) ||
      (a.referrer || "").toLowerCase().includes(query) ||
      (a.metadata?.productName || "").toLowerCase().includes(query) ||
      (a.metadata?.searchQuery || "").toLowerCase().includes(query)
    )
  }, [activities, searchQuery])

  const filteredWhatsappLogs = useMemo(() => {
    if (!searchQuery) return whatsappLogs
    const query = searchQuery.toLowerCase()
    return whatsappLogs.filter(l =>
      (l.customerName || "").toLowerCase().includes(query) ||
      (l.phone || "").includes(query) ||
      (l.messageText || "").toLowerCase().includes(query) ||
      (l.status || "").toLowerCase().includes(query)
    )
  }, [whatsappLogs, searchQuery])

  const failedMessages = useMemo(() => {
    return whatsappLogs.filter(l => l.status === "failed")
  }, [whatsappLogs])

  const queuedMessages = useMemo(() => {
    return whatsappLogs.filter(l => WA_PENDING.includes(l.status))
  }, [whatsappLogs])

  const dispatchedMessages = useMemo(() => {
    return whatsappLogs.filter(l => WA_DISPATCHED.includes(l.status))
  }, [whatsappLogs])

  // Analytics Computations
  const analyticsData = useMemo(() => {
    const totalActivities = activities.length
    const totalEvents = events.length
    const totalWA = whatsappLogs.length
    const dispatchedWA = whatsappLogs.filter(l => WA_DISPATCHED.includes(l.status)).length
    const failedWA = whatsappLogs.filter(l => l.status === "failed").length
    // null (not 100) with no messages — an empty console shouldn't advertise success.
    const dispatchRate = totalWA > 0 ? Math.round((dispatchedWA / totalWA) * 100) : null

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

    // Conversion rate: share of browsing *sessions* that ended in a quote
    // request. The denominator used to be every tracked action, so a single
    // visitor firing ten events diluted the rate tenfold and the card's
    // "vs page visits" caption described neither numerator nor denominator.
    const sessionsWithQuote = new Set(
      activities.filter(a => a.activityType === "Quote request").map(a => a.sessionId).filter(Boolean)
    )
    const allSessions = new Set(activities.map(a => a.sessionId).filter(Boolean))
    const conversionRate = allSessions.size > 0
      ? ((sessionsWithQuote.size / allSessions.size) * 100).toFixed(1)
      : null
    const quoteSessionCount = sessionsWithQuote.size
    const sessionCount = allSessions.size

    // AI performance: generated messages vs active events
    const generatedMsgsCount = aiMessages.length

    return {
      totalActivities,
      totalEvents,
      totalWA,
      dispatchedWA,
      dispatchRate,
      failedWA,
      topSearches,
      topViews,
      conversionRate,
      quoteSessionCount,
      sessionCount,
      generatedMsgsCount
    }
  }, [activities, events, whatsappLogs, aiMessages])

  // Security diagnostics, computed from live state. Every entry here was
  // previously a hardcoded green tick — the panel reported "Operational" even
  // when the session was unauthenticated or the tables were unreadable, which
  // is exactly when someone would consult it. A check we cannot actually
  // verify from the browser is reported as a gap, not a pass.
  const diagnostics = useMemo(() => {
    const checks = []

    checks.push(hasSupabase
      ? { ok: true, label: "Authentication", detail: "Supabase Auth session active" }
      : { ok: false, label: "Authentication", detail: "No backend configured — local mode, requests are unauthenticated" })

    if (!profile) {
      checks.push({ ok: false, label: "Module access", detail: "Profile not loaded" })
    } else {
      const granted = profile.role === "admin" || (profile.modules || []).includes("automation")
      checks.push({
        ok: granted,
        label: "Module access",
        detail: granted
          ? `Signed in as ${profile.role}, automation module granted`
          : `Signed in as ${profile.role}, automation module not granted`
      })
    }

    // Honest: checkRateLimit() only gates opening a wa.me tab in this browser,
    // resets on refresh, and the publicly-callable automation-engine applies no
    // per-caller limit at all. Not something we can tick green.
    checks.push({
      ok: false,
      label: "Rate limiting",
      detail: "Browser-side send throttle only; the automation engine enforces no per-caller limit"
    })

    checks.push(loadErrors.length === 0
      ? { ok: true, label: "Data access", detail: "All automation tables readable" }
      : { ok: false, label: "Data access", detail: `Unreadable: ${loadErrors.join(", ")}` })

    return checks
  }, [profile, loadErrors])

  const openIssues = diagnostics.filter(c => !c.ok).length

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
              value={analyticsData.conversionRate === null ? "—" : `${analyticsData.conversionRate}%`}
              sub={analyticsData.sessionCount === 0
                ? "No tracked sessions yet"
                : `${analyticsData.quoteSessionCount} of ${analyticsData.sessionCount} sessions requested a quote`}
              accent="bg-amber-500/10 text-amber-600"
            />
            <StatCard
              icon={MessageCircle}
              label="WhatsApp Dispatched"
              value={analyticsData.dispatchRate === null ? "—" : `${analyticsData.dispatchRate}%`}
              sub={analyticsData.totalWA === 0
                ? "No messages generated yet"
                : `${analyticsData.dispatchedWA} of ${analyticsData.totalWA} handed to WhatsApp`}
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
              <p className="mb-4 text-xs text-muted-foreground">
                Status of the message dispatcher. WhatsApp Web returns no delivery receipt, so a message is tracked only up to hand-off.
              </p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-emerald-500/5 p-4 border border-emerald-500/10">
                  <div className="text-2xl font-bold text-emerald-600">{dispatchedMessages.length}</div>
                  <div className="text-xs text-muted-foreground mt-1">Dispatched</div>
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
                <p className="text-xs text-muted-foreground">Live checks against the current session</p>
                <ul className="mt-4 space-y-2.5 text-xs text-muted-foreground">
                  {diagnostics.map((check) => (
                    <li key={check.label} className="flex items-start gap-2">
                      {check.ok ? (
                        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-500" />
                      )}
                      <span>
                        <span className="font-semibold text-foreground">{check.label}:</span> {check.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>System status</span>
                <span className={`font-bold ${openIssues === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                  {openIssues === 0 ? "Operational" : `${openIssues} issue${openIssues > 1 ? "s" : ""}`}
                </span>
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
                  <th className="px-4 py-3">Referrer</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Device / OS</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">Metadata / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-12 text-center text-muted-foreground">No activities found.</td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => (
                    <tr key={act.id} className="hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-xs">
                        {formatDateTime(act.timestamp)}
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
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">{act.referrer || "Direct"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{renderLocation(act)}</td>
                      <td className="px-4 py-3 text-xs">
                        {act.device} ({act.operatingSystem} / {act.browser})
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{act.ipAddress}</td>
                      <td className="px-4 py-3 max-w-md">{renderMetadata(act, maskSensitiveData)}</td>
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
                      <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTime(evt.timestamp)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={EVENT_TONES[evt.eventType] || "slate"}>
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
                        <td className="whitespace-nowrap px-4 py-3 text-xs">{formatDateTime(log.createdAt)}</td>
                        <td className="px-4 py-3 font-semibold text-xs">{log.customerName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{maskPhone(log.phone, maskSensitiveData)}</td>
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
                    <span className="text-xs text-muted-foreground">{formatDateTime(msg.createdAt)}</span>
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
                      <td className="px-4 py-3 text-xs font-mono text-primary">
                        {rule.triggerEvent}
                        {!TRIGGER_EVENTS.some(ev => ev.value === rule.triggerEvent) && (
                          <div className="text-[10px] font-sans font-semibold text-destructive mt-0.5">
                            Unsupported event — never fires
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold uppercase text-emerald-600">{rule.actionType}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {templateNameFor(rule.templateId) || (
                          <span className="italic">Built-in message</span>
                        )}
                      </td>
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
              {TRIGGER_EVENTS.map(ev => (
                <option key={ev.value} value={ev.value}>{ev.label}</option>
              ))}
              {ruleForm.triggerEvent && !TRIGGER_EVENTS.some(ev => ev.value === ruleForm.triggerEvent) && (
                <option value={ruleForm.triggerEvent}>
                  {ruleForm.triggerEvent} — unsupported, never fires
                </option>
              )}
            </Select>
          </Field>

          <Field label="Message Template" hint="Without a template the engine sends its built-in message for the event.">
            <Select
              value={ruleForm.templateId}
              onChange={(e) => setRuleForm({ ...ruleForm, templateId: e.target.value })}
            >
              <option value="">No template — use built-in message</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
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
