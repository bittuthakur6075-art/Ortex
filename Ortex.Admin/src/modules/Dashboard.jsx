import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  IndianRupee,
  Trophy,
  Clock,
  Wallet,
  TrendingUp,
  Sparkles,
  ArrowUpRight,
  AlertTriangle,
  Users,
} from "../components/icons"
import { toast } from "sonner"
import { useCollections } from "../data/hooks"
import { computeAnalytics } from "../data/analytics"
import { weightedLeadValue } from "../data/domain"
import { LEAD_STAGES, OPEN_LEAD_STAGES } from "../data/schema"
import { seedDemo } from "../data/seed"
import { formatCurrency, formatNumber, daysUntil, round2 } from "../lib/format"
import PageHeader from "../components/PageHeader"
import { Card, StatCard, StatusBadge, Money, EmptyState, Button, Chip, PageLoader } from "../components/ui"

const PERIODS = [
  { id: "mtd", label: "This month" },
  { id: "qtd", label: "This quarter" },
  { id: "ytd", label: "This year" },
  { id: "30d", label: "Last 30 days" },
]

export default function Dashboard() {
  const { data, loading } = useCollections(["products", "enquiries", "leads", "quotations", "invoices", "payments"])
  const [period, setPeriod] = useState("mtd")

  const a = useMemo(() => computeAnalytics(data, period), [data, period])

  const leadStats = useMemo(() => {
    const leads = data.leads || []
    const open = leads.filter((l) => OPEN_LEAD_STAGES.includes(l.stage))
    const weighted = round2(open.reduce((s, l) => s + weightedLeadValue(l), 0))
    const overdue = open.filter((l) => l.nextFollowUp && daysUntil(l.nextFollowUp) < 0).length
    const today = open.filter((l) => l.nextFollowUp && daysUntil(l.nextFollowUp) === 0).length
    const byStage = LEAD_STAGES.map((s) => ({ ...s, count: leads.filter((l) => l.stage === s.id).length }))
    return { openCount: open.length, weighted, overdue, today, byStage, total: leads.length }
  }, [data.leads])

  const isEmpty =
    !loading &&
    (data.enquiries?.length || 0) + (data.quotations?.length || 0) + (data.invoices?.length || 0) === 0

  const handleSeed = async () => {
    await seedDemo()
    toast.success("Demo data loaded")
  }

  if (loading) return <PageLoader />

  if (isEmpty) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Business overview" />
        <EmptyState
          icon={Sparkles}
          title="Welcome to Ortex Admin"
          description="Load demo data to explore the full quote-to-cash workflow — enquiries, products, quotations, GST invoices and payments — with a populated growth dashboard."
          action={
            <Button onClick={handleSeed}>
              <Sparkles className="h-4 w-4" /> Load demo data
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Growth dashboard" subtitle="Quote-to-cash performance at a glance">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <Chip key={p.id} active={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      </PageHeader>

      {/* Row 1 — north-star KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IndianRupee} label="Cash collected" value={<Money value={a.cashCollected} compact />} sub="Received in period" accent="bg-emerald-500/10 text-emerald-500" />
        <StatCard icon={Trophy} label="Win rate" value={`${a.winRate}%`} sub={`${a.wonCount} of ${a.decidedCount} decided`} accent="bg-violet-500/10 text-violet-500" />
        <StatCard icon={Wallet} label="Outstanding" value={<Money value={a.outstanding} compact />} sub={`DSO ${a.dso} days`} accent="bg-amber-500/10 text-amber-500" />
        <StatCard icon={TrendingUp} label="Revenue (taxable)" value={<Money value={a.revenue} compact />} sub={`Margin ${a.grossMarginPct}%`} accent="bg-primary/10 text-primary" />
      </div>

      {/* Row 2 — trend + funnel */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RevenueTrend trend={a.trend} className="lg:col-span-2" />
        <Funnel funnel={a.funnel} />
      </div>

      {/* Leads pipeline */}
      {leadStats.total > 0 && (
        <div className="mt-4">
          <LeadsPipeline stats={leadStats} />
        </div>
      )}

      {/* Row 3 — aging quotes to chase + AR aging */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuoteAging aging={a.quoteAging} openCount={a.openQuotesCount} />
        <ArAging aging={a.arAging} total={a.totalOutstanding} />
      </div>

      {/* Row 4 — category, lead source */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CategoryRevenue rows={a.categoryRevenue} />
        <LeadSources rows={a.leadSources} />
      </div>

      {/* Row 5 — top customers, reasons lost, quick KPIs */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopCustomers rows={a.topCustomers} repeatRate={a.repeatRate} />
        <ReasonsLost rows={a.reasonsLost} />
        <MiniKpis a={a} />
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

function RevenueTrend({ trend, className }) {
  const max = Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.collected)))
  return (
    <SectionCard title="Revenue vs. collections" className={className}>
      <div className="flex h-48 items-end gap-4">
        {trend.map((t, i) => (
          <div key={i} className="group flex flex-1 flex-col items-center justify-end gap-2">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: "100%" }}>
              <div className="relative flex w-1/2 items-end justify-center" style={{ height: "100%" }}>
                <div className="w-full rounded-t bg-primary/70 transition-all group-hover:bg-primary" style={{ height: `${(t.revenue / max) * 100}%` }} title={`Revenue ${formatCurrency(t.revenue)}`} />
              </div>
              <div className="relative flex w-1/2 items-end justify-center" style={{ height: "100%" }}>
                <div className="w-full rounded-t bg-emerald-500/70 transition-all group-hover:bg-emerald-500" style={{ height: `${(t.collected / max) * 100}%` }} title={`Collected ${formatCurrency(t.collected)}`} />
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{t.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/70" /> Revenue (taxable)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/70" /> Collected
        </span>
      </div>
    </SectionCard>
  )
}

function Funnel({ funnel }) {
  const max = Math.max(1, ...funnel.map((f) => f.count))
  return (
    <SectionCard title="Sales funnel">
      <div className="space-y-3">
        {funnel.map((f, i) => {
          const prev = i > 0 ? funnel[i - 1].count : null
          const conv = prev ? Math.round((f.count / prev) * 100) : null
          return (
            <div key={f.stage}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-foreground">{f.stage}</span>
                <span className="text-muted-foreground">
                  {f.count}
                  {conv !== null && <span className="ml-1.5 text-xs">({conv}%)</span>}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(f.count / max) * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

function QuoteAging({ aging, openCount }) {
  const buckets = [
    { key: "0-7", label: "0–7 days", tone: "text-emerald-500" },
    { key: "8-15", label: "8–15 days", tone: "text-amber-500" },
    { key: "16-30", label: "16–30 days", tone: "text-orange-500" },
    { key: "30+", label: "30+ days", tone: "text-destructive" },
  ]
  return (
    <SectionCard
      title="Open quotes to chase"
      action={
        <Link to="/quotations" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {openCount} open <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="grid grid-cols-4 gap-3">
        {buckets.map((b) => (
          <div key={b.key} className="rounded-lg border border-border bg-muted/30 p-3 text-center">
            <div className={`text-2xl font-bold ${b.tone}`}>{aging[b.key]}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{b.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Aged quotes are the cheapest win-rate lever — follow up before they expire.
      </p>
    </SectionCard>
  )
}

function ArAging({ aging, total }) {
  const buckets = [
    { key: "current", label: "Current", tone: "bg-emerald-500" },
    { key: "1-30", label: "1–30 od", tone: "bg-amber-500" },
    { key: "31-60", label: "31–60 od", tone: "bg-orange-500" },
    { key: "60+", label: "60+ od", tone: "bg-destructive" },
  ]
  const max = Math.max(1, ...buckets.map((b) => aging[b.key]))
  return (
    <SectionCard
      title="Receivables aging"
      action={<span className="text-sm font-semibold text-foreground">{formatCurrency(total)}</span>}
    >
      <div className="space-y-3">
        {buckets.map((b) => (
          <div key={b.key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-foreground">{b.label}</span>
              <span className="text-muted-foreground">{formatCurrency(aging[b.key])}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${b.tone}`} style={{ width: `${(aging[b.key] / max) * 100}%`, opacity: aging[b.key] > 0 ? 1 : 0.2 }} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function CategoryRevenue({ rows }) {
  if (!rows.length) return <SectionCard title="Revenue by category"><Empty /></SectionCard>
  const max = Math.max(1, ...rows.map((r) => r.revenue))
  return (
    <SectionCard title="Revenue by category">
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.category}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-foreground">{r.category}</span>
              <span className="flex-none text-muted-foreground">
                {formatCurrency(r.revenue)} <span className="text-xs text-[hsl(var(--success))]">· {r.marginPct}% margin</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-accent/70" style={{ width: `${(r.revenue / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function LeadSources({ rows }) {
  if (!rows.length) return <SectionCard title="Lead sources"><Empty /></SectionCard>
  const max = Math.max(1, ...rows.map((r) => r.enquiries))
  return (
    <SectionCard title="Lead sources & conversion">
      <div className="space-y-3">
        {rows.slice(0, 6).map((r) => (
          <div key={r.source}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-foreground">{r.source}</span>
              <span className="flex-none text-muted-foreground">
                {r.enquiries} · <span className="text-xs">{r.conv}% won</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${(r.enquiries / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function TopCustomers({ rows, repeatRate }) {
  return (
    <SectionCard
      title="Top customers"
      action={
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" /> {repeatRate}% repeat
        </span>
      }
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2.5">
          {rows.map((c, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{c.company || c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.orders} order{c.orders > 1 ? "s" : ""}
                </div>
              </div>
              <span className="flex-none font-semibold text-foreground">{formatCurrency(c.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function ReasonsLost({ rows }) {
  return (
    <SectionCard title="Why we lose">
      {rows.length === 0 ? (
        <Empty text="No losses recorded yet." />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.reason} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> {r.reason}
              </span>
              <span className="font-semibold text-muted-foreground">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function MiniKpis({ a }) {
  const items = [
    { label: "Avg. order value", value: formatCurrency(a.aov) },
    { label: "Avg. quote value", value: formatCurrency(a.avgQuoteValue) },
    { label: "Gross margin", value: formatCurrency(a.grossMargin) },
    { label: "New enquiries", value: formatNumber(a.counts.newEnquiries) },
  ]
  return (
    <SectionCard title="Key metrics">
      <div className="grid grid-cols-2 gap-3">
        {items.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-0.5 text-base font-bold text-foreground">{k.value}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function LeadsPipeline({ stats }) {
  const max = Math.max(1, ...stats.byStage.map((s) => s.count))
  return (
    <SectionCard
      title="Leads pipeline"
      action={
        <Link to="/leads" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          Open board <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="grid grid-cols-3 gap-3 lg:col-span-1">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Weighted</div>
            <div className="mt-0.5 text-lg font-bold text-foreground">{formatCurrency(stats.weighted, { compact: true })}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className="mt-0.5 text-lg font-bold text-rose-500">{stats.overdue}</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Due today</div>
            <div className="mt-0.5 text-lg font-bold text-amber-500">{stats.today}</div>
          </div>
        </div>
        <div className="space-y-2 lg:col-span-2">
          {stats.byStage.map((s) => (
            <div key={s.id} className="flex items-center gap-3">
              <div className="w-28 flex-none">
                <StatusBadge list={LEAD_STAGES} status={s.id} dot={false} />
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary/70" style={{ width: `${(s.count / max) * 100}%`, opacity: s.count ? 1 : 0.2 }} />
              </div>
              <span className="w-6 flex-none text-right text-xs text-muted-foreground">{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

function Empty({ text = "No data yet." }) {
  return <p className="py-4 text-sm text-muted-foreground">{text}</p>
}
