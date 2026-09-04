import { useMemo } from "react"
import { hasSupabase } from "../../data/store/supabaseClient"
import { StatCard, Card, Badge } from "../../components/ui/Ui"
import { Flame, MessageCircle, Sparkles, Users, CheckCircle2, AlertTriangle } from "../../components/ui/Icons"
import { WA_DISPATCHED, WA_PENDING } from "./helpers"
import WindowNotice from "./WindowNotice"

export default function AnalyticsTab({ activities, events, whatsappLogs, aiMessages, totals, activityTruncated, profile, loadErrors }) {
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

  return (
    <div className="space-y-6">
      {activityTruncated && (
        <WindowNotice shown={activities.length} total={totals.user_activities} what="tracked actions" />
      )}
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Tracked Actions"
          value={(totals.user_activities ?? analyticsData.totalActivities).toLocaleString()}
          sub={activityTruncated
            ? `Analytics below cover the newest ${activities.length.toLocaleString()}`
            : "Across all active visitor sessions"}
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
  )
}
