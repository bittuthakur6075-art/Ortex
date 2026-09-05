import { useState, useMemo } from "react"
import { Link } from "react-router-dom"
import {
  Clock,
  Sparkles,
  ArrowUpRight,
  AlertTriangle,
  Users,
  Plus,
  FileText,
  ReceiptIndianRupee,
  Wallet,
  CalendarClock,
  TrendingUp,
  Trophy,
} from "../components/ui/Icons"
import { useCollections } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { computeAnalytics } from "../lib/analytics/dashboard"
import { OPEN_LEAD_STAGES } from "../data/domain/schema"
import { loadDemoData } from "../data/seed/seed"
import { formatCurrency, formatNumber, daysUntil, round2 } from "../lib/format"
import PageHeader from "../components/layout/PageHeader"
import { PERIODS } from "../lib/periods"
import SectionCard from "../components/ui/SectionCard"
import { Card, CardHeader, CardFooter, EmptyState, Button, Segmented, PageLoader, Avatar, Badge } from "../components/ui/Ui"
import { BarChart, AreaChart, CHART_COLORS } from "../components/ui/Chart"
import { cn } from "../lib/cn"


const QUICK_ACTIONS = [
  { label: "New quotation", to: "/quotations", icon: FileText },
  { label: "New invoice", to: "/billing?tab=invoices", icon: ReceiptIndianRupee },
  { label: "Add customer", to: "/customers", icon: Users },
  { label: "Record payment", to: "/billing?tab=payments", icon: Wallet },
]

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

const partyName = (c) => c?.company || c?.name || "Unknown"

export default function Dashboard() {
  const { data, loading } = useCollections(["products", "enquiries", "leads", "quotations", "invoices", "payments"])
  const profile = useProfile()
  const [period, setPeriod] = useState("mtd")

  const a = useMemo(() => computeAnalytics(data, period), [data, period])

  // "Needs attention" rail: overdue invoices, due/overdue follow-ups, expiring quotes.
  const attention = useMemo(() => {
    const out = []
    for (const inv of data.invoices || []) {
      if (!inv.dueDate || ["paid", "cancelled", "draft"].includes(inv.status)) continue
      const d = daysUntil(inv.dueDate)
      if (inv.status !== "overdue" && d >= 0) continue
      const due = Math.max(0, (inv.totals?.grandTotal || 0) - (inv.amountPaid || 0))
      out.push({ id: `inv-${inv.id}`, kind: "Invoice overdue", tone: "rose", who: partyName(inv.customer), what: `${inv.number} · ${Math.max(1, -d)}d late`, amount: due, to: "/billing?tab=invoices", sort: -d })
    }
    for (const l of data.leads || []) {
      if (!OPEN_LEAD_STAGES.includes(l.stage) || !l.nextFollowUp) continue
      const d = daysUntil(l.nextFollowUp)
      if (d > 0) continue
      out.push({ id: `lead-${l.id}`, kind: d < 0 ? "Follow-up overdue" : "Follow-up today", tone: d < 0 ? "amber" : "blue", who: partyName(l.customer), what: l.productInterest || l.quantityEstimate || "", amount: l.estimatedValue, to: "/crm?tab=leads", sort: -d })
    }
    for (const q of data.quotations || []) {
      if (q.status !== "sent" || !q.validUntil) continue
      const d = daysUntil(q.validUntil)
      if (d > 3) continue
      out.push({ id: `qtn-${q.id}`, kind: d < 0 ? "Quote expired" : "Quote expiring", tone: d < 0 ? "rose" : "amber", who: partyName(q.customer), what: `${q.number} · ${d < 0 ? `${-d}d ago` : d === 0 ? "today" : `in ${d}d`}`, amount: q.totals?.grandTotal, to: "/quotations", sort: -d })
    }
    return out.sort((x, y) => y.sort - x.sort).slice(0, 7)
  }, [data.invoices, data.leads, data.quotations])

  const isEmpty =
    !loading &&
    (data.enquiries?.length || 0) + (data.quotations?.length || 0) + (data.invoices?.length || 0) === 0

  if (loading) return <PageLoader />

  if (isEmpty) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Quote-to-cash at a glance" />
        <EmptyState
          icon={Sparkles}
          title="Welcome to Ortex Console"
          description="Load demo data to explore the full quote-to-cash workflow - enquiries, products, quotations, GST invoices and payments - with a populated dashboard."
          action={
            <Button onClick={loadDemoData}>
              <Sparkles className="h-4 w-4" /> Load demo data
            </Button>
          }
        />
      </div>
    )
  }

  const firstName = (profile?.name || "").split(" ")[0]
  const openInvoices = (data.invoices || []).filter((i) => !["paid", "cancelled", "draft"].includes(i.status)).length
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div>
      {/* Toolbar (Metronic): title + subtitle left, period picker right */}
      <PageHeader title="Dashboard" subtitle={`${greeting()}${firstName ? `, ${firstName}` : ""} · ${today}`}>
        <Segmented items={PERIODS} value={period} onChange={setPeriod} size="md" />
      </PageHeader>

      {/* Row 1 - four stat tiles left (2×2), attention card right (Demo 1) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="grid grid-cols-2 content-start gap-5">
          <StatTile icon={Wallet} accent="bg-success/12 text-success-text" value={formatCurrency(a.cashCollected, { compact: true })} label="Cash collected" />
          <StatTile icon={TrendingUp} accent="bg-primary/10 text-primary" value={formatCurrency(a.revenue, { compact: true })} label="Revenue (taxable)" />
          <StatTile icon={ReceiptIndianRupee} accent="bg-warning/12 text-warning-text" value={formatCurrency(a.outstanding, { compact: true })} label="Outstanding" />
          <StatTile icon={Trophy} accent="bg-info/10 text-info-text" value={`${a.winRate}%`} label="Win rate" />
        </div>
        <div className="lg:col-span-2">
          <AttentionRail items={attention} summary={openInvoices > 0 ? `${openInvoices} open invoice${openInvoices === 1 ? "" : "s"} · ${formatCurrency(a.totalOutstanding)} outstanding` : "No invoices outstanding"} />
        </div>
      </div>

      {/* Row 2 - quick actions + revenue chart (Highlights / Earnings) */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Quick actions" />
          <div className="flex flex-col gap-2.5 p-5">
            {QUICK_ACTIONS.map((qa) => (
              <Link key={qa.to} to={qa.to} className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent">
                <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-primary/10 text-primary">
                  <qa.icon className="h-4 w-4" />
                </span>
                {qa.label}
                <Plus className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
          <CardFooter>
            <span className="text-[13px] text-muted-foreground">Margin {a.grossMarginPct}% · DSO {a.dso} days · {a.wonCount} of {a.decidedCount} quotes won</span>
          </CardFooter>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue vs. collections" description="Taxable revenue booked against cash received" />
          <div className="px-3 pb-3 pt-2">
            <AreaChart
              height={272}
              categories={a.trend.map((t) => t.label)}
              series={[
                { name: "Revenue", data: a.trend.map((t) => round2(t.revenue)) },
                { name: "Collected", data: a.trend.map((t) => round2(t.collected)) },
              ]}
              valueFormatter={(v) => formatCurrency(v, { compact: true })}
            />
          </div>
        </Card>
      </div>

      {/* Funnel + quote aging + AR aging */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Funnel funnel={a.funnel} />
        <QuoteAging aging={a.quoteAging} openCount={a.openQuotesCount} />
        <ArAging aging={a.arAging} total={a.totalOutstanding} />
      </div>

      {/* Category, lead source */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CategoryRevenue rows={a.categoryRevenue} />
        <LeadSources rows={a.leadSources} />
      </div>

      {/* Top customers, reasons lost, quick KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <TopCustomers rows={a.topCustomers} repeatRate={a.repeatRate} />
        <ReasonsLost rows={a.reasonsLost} />
        <MiniKpis a={a} />
      </div>
    </div>
  )
}

// Metronic stat tile: icon top-left, 26px number, 14px muted label.
function StatTile({ icon: Icon, accent, value, label }) {
  return (
    <Card className="min-h-[151px] justify-between gap-6 px-5 pb-4 pt-5">
      <span className={cn("inline-grid h-8 w-8 place-items-center rounded-md", accent)}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[26px] font-semibold leading-none tracking-tight text-foreground tabular">{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
    </Card>
  )
}

function AttentionRail({ items, summary }) {
  return (
    <Card className="h-full">
      <CardHeader
        title="Needs attention"
        description={summary}
        action={items.length > 0 && <Badge tone="rose" className="h-[22px] px-2 text-xs">{items.length} items</Badge>}
      />
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 pb-8 pt-2 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-success/12 text-success-text">
            <CalendarClock className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-foreground">All clear</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Nothing is overdue right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li key={it.id}>
              <Link to={it.to} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-subtle">
                <Avatar name={it.who} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{it.who}</span>
                    <Badge tone={it.tone}>{it.kind}</Badge>
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">{it.what}</span>
                </span>
                {it.amount != null && <span className="flex-none text-sm font-semibold text-foreground tabular">{formatCurrency(it.amount, { compact: true })}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CardFooter className="mt-auto">
        <Link to="/billing?tab=invoices" className="text-[13px] font-medium text-primary underline decoration-dotted underline-offset-4 hover:decoration-solid">
          View all invoices
        </Link>
      </CardFooter>
    </Card>
  )
}

function ViewAll({ to, children }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
      {children} <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  )
}

function Funnel({ funnel }) {
  return (
    <SectionCard title="Sales funnel" bodyClassName="px-3 pb-3">
      <BarChart
        height={240}
        categories={funnel.map((f) => f.stage)}
        series={[{ name: "Count", data: funnel.map((f) => f.count) }]}
        valueFormatter={(v) => formatNumber(v)}
      />
    </SectionCard>
  )
}

function QuoteAging({ aging, openCount }) {
  const buckets = [
    { key: "0-7", label: "0–7 days", tone: "text-success-text" },
    { key: "8-15", label: "8–15 days", tone: "text-warning-text" },
    { key: "16-30", label: "16–30 days", tone: "text-warning-text" },
    { key: "30+", label: "30+ days", tone: "text-destructive-text" },
  ]
  return (
    <SectionCard title="Open quotes to chase" action={<ViewAll to="/quotations">{openCount} open</ViewAll>}>
      <div className="grid grid-cols-2 gap-2">
        {buckets.map((b) => (
          <div key={b.key} className="rounded-lg bg-subtle px-3 py-2.5">
            <div className={cn("text-xl font-semibold tabular", b.tone)}>{aging[b.key]}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{b.label}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Aged quotes are the cheapest win-rate lever - follow up before they expire.
      </p>
    </SectionCard>
  )
}

function ArAging({ aging, total }) {
  const buckets = [
    { key: "current", label: "Current", color: CHART_COLORS.emerald },
    { key: "1-30", label: "1–30 od", color: CHART_COLORS.amber },
    { key: "31-60", label: "31–60 od", color: CHART_COLORS.orange },
    { key: "60+", label: "60+ od", color: CHART_COLORS.red },
  ]
  return (
    <SectionCard title="Receivables aging" action={<span className="text-[13px] font-semibold text-foreground tabular">{formatCurrency(total)}</span>} bodyClassName="px-3 pb-3">
      <BarChart
        height={200}
        distributed
        categories={buckets.map((b) => b.label)}
        series={[{ name: "Outstanding", data: buckets.map((b) => round2(aging[b.key])) }]}
        colors={buckets.map((b) => b.color)}
        valueFormatter={(v) => formatCurrency(v, { compact: true })}
      />
    </SectionCard>
  )
}

function CategoryRevenue({ rows }) {
  if (!rows.length) return <SectionCard title="Revenue by category"><Empty /></SectionCard>
  return (
    <SectionCard title="Revenue by category" bodyClassName="px-3 pb-3">
      <BarChart
        height={Math.max(200, rows.length * 44)}
        categories={rows.map((r) => r.category)}
        series={[{ name: "Revenue", data: rows.map((r) => round2(r.revenue)) }]}
        colors={[CHART_COLORS.violet]}
        valueFormatter={(v) => formatCurrency(v, { compact: true })}
      />
    </SectionCard>
  )
}

function LeadSources({ rows }) {
  if (!rows.length) return <SectionCard title="Lead sources"><Empty /></SectionCard>
  const top = rows.slice(0, 6)
  return (
    <SectionCard title="Lead sources & conversion" bodyClassName="px-3 pb-3">
      <BarChart
        height={Math.max(200, top.length * 44)}
        categories={top.map((r) => r.source)}
        series={[{ name: "Enquiries", data: top.map((r) => r.enquiries) }]}
        valueFormatter={(v) => formatNumber(v)}
      />
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
      bodyClassName="px-5 pb-3"
    >
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((c, i) => (
            <li key={i} className="flex items-center gap-3 py-2.5">
              <Avatar name={c.company || c.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-foreground">{c.company || c.name}</div>
                <div className="text-xs text-muted-foreground">{c.orders} order{c.orders > 1 ? "s" : ""}</div>
              </div>
              <span className="flex-none text-[13px] font-semibold text-foreground tabular">{formatCurrency(c.revenue)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function ReasonsLost({ rows }) {
  return (
    <SectionCard title="Why we lose" bodyClassName="px-5 pb-3">
      {rows.length === 0 ? (
        <Empty text="No losses recorded yet." />
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.reason} className="flex items-center justify-between py-2.5 text-[13px]">
              <span className="flex items-center gap-2 text-foreground">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> {r.reason}
              </span>
              <span className="font-semibold text-muted-foreground tabular">{r.count}</span>
            </li>
          ))}
        </ul>
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
      <div className="grid grid-cols-2 gap-2">
        {items.map((k) => (
          <div key={k.label} className="rounded-lg bg-subtle px-3 py-2.5">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-0.5 text-[15px] font-semibold text-foreground tabular">{k.value}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}


function Empty({ text = "No data yet." }) {
  return <p className="py-4 text-[13px] text-muted-foreground">{text}</p>
}
