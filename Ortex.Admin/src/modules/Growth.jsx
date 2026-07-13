import { useState, useMemo } from "react"
import { Users, Flame, TrendingUp, Search, Sparkles, MessageCircle, IndianRupee, Trophy, Clock } from "../components/icons"
import { useCollections } from "../data/hooks"
import { computeGrowthAnalytics, computeAttribution, computeVelocity, computeCohorts, computeMessagingImpact } from "../data/analytics"
import { formatNumber, formatCurrency } from "../lib/format"
import PageHeader from "../components/PageHeader"
import { Card, StatCard, Badge, EmptyState, Chip, PageLoader, Money } from "../components/ui"
import { BarChart, AreaChart, CHART_COLORS } from "../components/Chart"

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
    "whatsapp_logs",
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

  // P3 metrics are lifetime views over the document chain (not period-scoped):
  // velocity and cohorts answer "how fast / how well do we convert", which
  // needs full history, not a window.
  const velocity = useMemo(
    () =>
      computeVelocity({
        enquiries: data.enquiries || [],
        quotations: data.quotations || [],
        invoices: data.invoices || [],
        payments: data.payments || [],
      }),
    [data],
  )
  const cohorts = useMemo(
    () => computeCohorts({ enquiries: data.enquiries || [], quotations: data.quotations || [] }),
    [data],
  )
  const messaging = useMemo(
    () =>
      computeMessagingImpact({
        whatsappLogs: data.whatsapp_logs || [],
        quotations: data.quotations || [],
        invoices: data.invoices || [],
      }),
    [data],
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

      {/* Velocity + cohorts + messaging (lifetime views, not period-scoped) */}
      <div className="mt-4">
        <VelocityCard v={velocity} />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CohortTable rows={cohorts} />
        <MessagingImpact m={messaging} />
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

// Conversion funnel by stage count.
function FunnelChart({ funnel, className }) {
  return (
    <SectionCard title="Visitor-to-cash funnel" className={className}>
      <BarChart
        height={Math.max(240, funnel.length * 42)}
        categories={funnel.map((f) => f.stage)}
        series={[{ name: "Count", data: funnel.map((f) => f.count) }]}
        valueFormatter={(v) => formatNumber(v)}
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Behavioral stages are session-based; sales stages are period-scoped by document date, so cross-stage rates
        are directional.
      </p>
    </SectionCard>
  )
}

// 8-week sessions vs quote-requesting sessions.
function TrendChart({ trend }) {
  return (
    <SectionCard title="Weekly sessions vs quotes">
      <AreaChart
        height={220}
        categories={trend.map((t) => t.label)}
        series={[
          { name: "Sessions", data: trend.map((t) => t.sessions) },
          { name: "Quote requests", data: trend.map((t) => t.quotes) },
        ]}
        colors={[CHART_COLORS.blue, CHART_COLORS.amber]}
        valueFormatter={(v) => formatNumber(v)}
      />
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
  const color = tone === "blue" ? CHART_COLORS.blue : tone === "emerald" ? CHART_COLORS.emerald : undefined
  return (
    <SectionCard title={title}>
      <BarChart
        height={Math.max(200, rows.length * 42)}
        categories={rows.map((r) => r[labelKey] || "—")}
        series={[{ name: unit, data: rows.map((r) => r.count) }]}
        colors={color ? [color] : undefined}
        valueFormatter={(v) => formatNumber(v)}
      />
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
  return (
    <SectionCard title={title}>
      <BarChart
        height={Math.max(200, rows.length * 42)}
        categories={rows.map((r) => r.channel)}
        series={[{ name: "Revenue", data: rows.map((r) => Math.round(r.revenue)) }]}
        colors={[CHART_COLORS.emerald]}
        valueFormatter={(v) => formatCurrency(v, { compact: true })}
      />
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

// Median sales-cycle timing per stage of the document chain.
function VelocityCard({ v }) {
  const stages = [
    { key: "enquiryToQuote", label: "Enquiry → Quote" },
    { key: "quoteToInvoice", label: "Quote → Invoice" },
    { key: "invoiceToPaid", label: "Invoice → Paid" },
    { key: "fullCycle", label: "Full cycle" },
  ]
  return (
    <SectionCard
      title="Sales velocity"
      action={
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> median days per stage
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.map((s) => (
          <div key={s.key} className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="mt-0.5 text-xl font-bold text-foreground">
              {v[s.key] === null ? "—" : `${v[s.key]}d`}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {v.samples[s.key]} sample{v.samples[s.key] === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// Monthly enquiry cohorts: intake volume and how each month's intake converted.
function CohortTable({ rows }) {
  const hasData = rows.some((r) => r.enquiries > 0)
  return (
    <SectionCard title="Enquiry cohorts (by intake month)">
      {!hasData ? (
        <p className="py-4 text-sm text-muted-foreground">No enquiries in the last six months.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-semibold uppercase text-muted-foreground">
              <th className="py-2">Month</th>
              <th className="py-2 text-right">Enquiries</th>
              <th className="py-2 text-right">Quoted</th>
              <th className="py-2 text-right">Won</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-2 font-medium text-foreground">{r.label}</td>
                <td className="py-2 text-right text-muted-foreground">{formatNumber(r.enquiries)}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {r.quotedPct === null ? "—" : `${r.quoted} (${r.quotedPct}%)`}
                </td>
                <td className="py-2 text-right font-semibold text-foreground">
                  {r.wonPct === null ? "—" : `${r.won} (${r.wonPct}%)`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SectionCard>
  )
}

// Dispatched WhatsApp messages vs recipients who later placed a won order.
function MessagingImpact({ m }) {
  return (
    <SectionCard
      title="Messaging impact"
      action={
        <span className="text-xs text-muted-foreground">
          {m.orderedRate === null ? "no messages dispatched" : `${m.orderedRate}% ordered after a message`}
        </span>
      }
    >
      {m.totalDispatched === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No WhatsApp messages dispatched yet — impact appears once the queue is worked.
        </p>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Dispatched</div>
              <div className="mt-0.5 text-xl font-bold text-foreground">{formatNumber(m.totalDispatched)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Ordered afterwards</div>
              <div className="mt-0.5 text-xl font-bold text-emerald-600">{formatNumber(m.orderedAfter)}</div>
            </div>
          </div>
          <div className="space-y-2">
            {m.byTrigger.slice(0, 6).map((t) => (
              <div key={t.trigger} className="flex items-center justify-between text-sm">
                <span className="truncate font-mono text-xs text-foreground">{t.trigger}</span>
                <span className="flex-none text-xs text-muted-foreground">
                  {t.dispatched} sent · <span className="font-semibold text-foreground">{t.ordered} ordered</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Correlation, not causation — wa.me returns no delivery receipt, so "ordered afterwards" means a won order
        exists for that phone number dated after dispatch.
      </p>
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
