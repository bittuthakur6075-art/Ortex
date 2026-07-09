import { useState, useMemo } from "react"
import { Users, Flame, TrendingUp, Search, Sparkles, MessageCircle, IndianRupee, Trophy } from "../components/icons"
import { useCollections } from "../data/hooks"
import { computeGrowthAnalytics, computeAttribution } from "../data/analytics"
import { formatNumber, formatCurrency } from "../lib/format"
import PageHeader from "../components/PageHeader"
import { Card, StatCard, Badge, EmptyState, Chip, PageLoader, Money } from "../components/ui"

const PERIODS = [
  { id: "mtd", label: "This month" },
  { id: "qtd", label: "This quarter" },
  { id: "ytd", label: "This year" },
  { id: "30d", label: "Last 30 days" },
]

export default function Growth() {
  const { data, loading } = useCollections([
    "user_activities",
    "enquiries",
    "quotations",
    "invoices",
    "payments",
    "products",
  ])
  const [period, setPeriod] = useState("mtd")

  const g = useMemo(
    () =>
      computeGrowthAnalytics(
        {
          activities: data.user_activities || [],
          enquiries: data.enquiries || [],
          quotations: data.quotations || [],
          invoices: data.invoices || [],
          payments: data.payments || [],
          products: data.products || [],
        },
        period,
      ),
    [data, period],
  )

  const attr = useMemo(
    () =>
      computeAttribution(
        {
          activities: data.user_activities || [],
          enquiries: data.enquiries || [],
          quotations: data.quotations || [],
          invoices: data.invoices || [],
          payments: data.payments || [],
          products: data.products || [],
        },
        period,
      ),
    [data, period],
  )

  const noTracking = !loading && (data.user_activities?.length || 0) === 0

  if (loading) return <PageLoader />

  if (noTracking) {
    return (
      <div>
        <PageHeader title="Growth intelligence" subtitle="Visitor-to-cash funnel" />
        <EmptyState
          icon={TrendingUp}
          title="No visitor activity yet"
          description="Once the marketing site starts recording visits (with analytics consent), this dashboard shows the full funnel — visitors, engagement, demand gaps and conversion to paid orders."
        />
      </div>
    )
  }

  const pct = (v) => (v === null || v === undefined ? "—" : `${v}%`)

  return (
    <div>
      <PageHeader title="Growth intelligence" subtitle="Visitor-to-cash funnel & demand signals">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </PageHeader>

      {/* North-star row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Visitors"
          value={formatNumber(g.visitors)}
          sub={`${formatNumber(g.newVisitors)} new · ${formatNumber(g.returningVisitors)} returning`}
          accent="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={Flame}
          label="Visitor → Quote"
          value={pct(g.visitorToQuote)}
          sub={`${formatNumber(g.quoteSessionCount)} of ${formatNumber(g.sessionCount)} sessions`}
          accent="bg-amber-500/10 text-amber-500"
        />
        <StatCard
          icon={Sparkles}
          label="Engaged sessions"
          value={pct(g.engagedRate)}
          sub={`Bounce ${pct(g.bounceRate)} · ${g.actionsPerSession} actions/session`}
          accent="bg-violet-500/10 text-violet-500"
        />
        <StatCard
          icon={MessageCircle}
          label="Tracked actions"
          value={formatNumber(g.totalActivities)}
          sub={`${formatNumber(g.sessionCount)} sessions in period`}
          accent="bg-emerald-500/10 text-emerald-500"
        />
      </div>

      {/* Funnel + trend */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FunnelChart funnel={g.funnel} className="lg:col-span-2" />
        <TrendChart trend={g.trend} />
      </div>

      {/* Revenue attribution */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={IndianRupee}
          label="Web-influenced revenue"
          value={<Money value={attr.webInfluencedRevenue} compact />}
          sub={attr.webShare === null
            ? "No invoiced revenue in period"
            : `${attr.webShare}% of ${formatCurrency(attr.totalRevenue, { compact: true })} total`}
          accent="bg-emerald-500/10 text-emerald-500"
        />
        <StatCard
          icon={Users}
          label="Tracked enquiries"
          value={formatNumber(attr.trackedEnquiryCount)}
          sub={`${formatNumber(attr.trackedWon)} became orders`}
          accent="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={Trophy}
          label="Tracked → order"
          value={attr.trackedConversion === null ? "—" : `${attr.trackedConversion}%`}
          sub="Web-originated enquiries won"
          accent="bg-violet-500/10 text-violet-500"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RevenueBars title="Revenue by acquisition channel" rows={attr.channelRevenue} />
        <ProductPerformance rows={attr.productPerformance} />
      </div>

      {/* Acquisition */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList title="Acquisition channels" rows={g.channels} labelKey="channel" unit="sessions" />
        <BarList title="Devices" rows={g.devices} labelKey="device" unit="sessions" />
      </div>

      {/* Engagement */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarList title="Top searched keywords" rows={g.topSearches} labelKey="query" unit="searches" tone="blue" />
        <BarList title="Most viewed products" rows={g.topViews} labelKey="name" unit="views" tone="emerald" />
      </div>

      {/* Demand gap */}
      <div className="mt-4">
        <DemandGaps rows={g.demandGaps} />
      </div>
    </div>
  )
}

function SectionCard({ title, action, children, className = "" }) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </Card>
  )
}

// Vertical conversion funnel with step-to-step drop-off %.
function FunnelChart({ funnel, className }) {
  const max = Math.max(1, ...funnel.map((f) => f.count))
  return (
    <SectionCard title="Visitor-to-cash funnel" className={className}>
      <div className="space-y-3">
        {funnel.map((f, i) => {
          const prev = i > 0 ? funnel[i - 1].count : null
          const conv = prev ? Math.round((f.count / prev) * 100) : null
          const isBehavioral = i < 4
          return (
            <div key={f.stage}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-foreground">{f.stage}</span>
                <span className="text-muted-foreground">
                  {formatNumber(f.count)}
                  {conv !== null && <span className="ml-1.5 text-xs">({conv}%)</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${isBehavioral ? "bg-blue-500/60" : "bg-primary/70"}`}
                  style={{ width: `${(f.count / max) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Behavioral stages (blue) are session-based; sales stages (accent) are period-scoped by document date, so
        cross-stage rates are directional.
      </p>
    </SectionCard>
  )
}

// 8-week sessions vs quote-requesting sessions.
function TrendChart({ trend }) {
  const max = Math.max(1, ...trend.map((t) => Math.max(t.sessions, t.quotes)))
  return (
    <SectionCard title="Weekly sessions vs quotes">
      <div className="flex h-40 items-end gap-2">
        {trend.map((t, i) => (
          <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-1.5">
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: "100%" }}>
              <div
                className="w-1/2 rounded-t bg-blue-500/60 transition-all group-hover:bg-blue-500"
                style={{ height: `${(t.sessions / max) * 100}%` }}
                title={`${t.sessions} sessions`}
              />
              <div
                className="w-1/2 rounded-t bg-amber-500/70 transition-all group-hover:bg-amber-500"
                style={{ height: `${(t.quotes / max) * 100}%` }}
                title={`${t.quotes} quote requests`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500/60" /> Sessions</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500/70" /> Quote requests</span>
      </div>
    </SectionCard>
  )
}

function BarList({ title, rows, labelKey, unit, tone = "slate" }) {
  if (!rows || rows.length === 0) {
    return (
      <SectionCard title={title}>
        <p className="py-4 text-sm text-muted-foreground">No data yet.</p>
      </SectionCard>
    )
  }
  const max = Math.max(1, ...rows.map((r) => r.count))
  const barTone = tone === "blue" ? "bg-blue-500/60" : tone === "emerald" ? "bg-emerald-500/60" : "bg-primary/60"
  return (
    <SectionCard title={title}>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-foreground">{r[labelKey] || "—"}</span>
              <span className="flex-none text-muted-foreground">
                {formatNumber(r.count)} <span className="text-xs">{unit}</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${barTone}`} style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// Channel → revenue (first-touch attribution), currency bars.
function RevenueBars({ title, rows }) {
  if (!rows || rows.length === 0) {
    return (
      <SectionCard title={title}>
        <p className="py-4 text-sm text-muted-foreground">
          No revenue attributed to a web channel yet — invoiced customers aren't matching a tracked visit.
        </p>
      </SectionCard>
    )
  }
  const max = Math.max(1, ...rows.map((r) => r.revenue))
  return (
    <SectionCard title={title}>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-foreground">{r.channel}</span>
              <span className="flex-none text-muted-foreground">{formatCurrency(r.revenue, { compact: true })}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${(r.revenue / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// Product page views vs orders won — merchandising signal.
function ProductPerformance({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <SectionCard title="Product: views → orders">
        <p className="py-4 text-sm text-muted-foreground">No product views recorded yet.</p>
      </SectionCard>
    )
  }
  return (
    <SectionCard title="Product: views → orders">
      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-foreground">{r.name}</span>
            <span className="flex-none text-xs text-muted-foreground">
              {formatNumber(r.views)} views · {formatNumber(r.orders)} orders
              {r.rate !== null && <span className="ml-1.5 font-semibold text-foreground">{r.rate}%</span>}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// Searches with no matching product — a product-roadmap signal.
function DemandGaps({ rows }) {
  return (
    <SectionCard
      title="Demand gaps"
      action={
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Search className="h-3.5 w-3.5" /> searches with no matching product
        </span>
      }
    >
      {!rows || rows.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          Every searched term matched a product — no obvious catalogue gaps in this period.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-sm">
              <span className="font-medium text-foreground">"{r.query}"</span>
              <Badge tone="amber">{r.count}</Badge>
            </span>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
