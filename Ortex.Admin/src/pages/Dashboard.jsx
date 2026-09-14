import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Inbox,
  Mic,
  Phone,
  ReceiptIndianRupee,
  Sparkles,
  Users,
  Wallet,
} from "../components/ui/Icons"
import { useCollections } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { RANGES, attentionItems, computeToday } from "../lib/analytics/today"
import { loadDemoData } from "../data/seed/seed"
import { formatCurrency, formatNumber } from "../lib/format"
import PageHeader from "../components/layout/PageHeader"
import { Badge, Button, Card, CardFooter, CardHeader, EmptyState, PageLoader, Segmented } from "../components/ui/Ui"
import { PaceChart } from "../components/ui/Chart"
import { cn } from "../lib/cn"

// A page for the next hour, not a report. In the order a person works:
//   1. what is waiting on me (all dates, most urgent first, acted on in place)
//   2. how this window is going against the one before it, stated in words
//   3. where the work stands: the pipeline and the money still owed
// The slower questions (revenue mix, sources, customers, lost deals) moved to
// Insights → Sales. Every figure is a pure function in lib/analytics/today.js.
//
// Each section is gated by the module it reads, so a Sales Executive sees their
// leads and quotations rather than a wall of empty invoice tiles.

const TONE_WELL = {
  rose: "bg-destructive/10 text-destructive-text",
  amber: "bg-warning/12 text-warning-text",
  blue: "bg-primary/10 text-primary",
  emerald: "bg-success/12 text-success-text",
  orange: "bg-warning/12 text-warning-text",
}
const TONE_FILL = {
  emerald: "bg-success",
  amber: "bg-warning",
  orange: "bg-warning-text",
  rose: "bg-destructive",
}
const KIND_ICON = { money: ReceiptIndianRupee, leads: Inbox, quotes: FileText }

const GROUPS = [
  { value: "all", label: "All" },
  { value: "money", label: "Money" },
  { value: "leads", label: "Leads" },
  { value: "quotes", label: "Quotes" },
]

const PREVIEW_ROWS = 6

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

const money = (v) => formatCurrency(v, { compact: true })

export default function Dashboard() {
  const { data, loading } = useCollections(["enquiries", "quotations", "invoices", "payments"])
  const profile = useProfile()
  const navigate = useNavigate()
  const [range, setRange] = useState("30d")

  const access = useMemo(
    () => ({
      invoices: canAccess(profile, "invoices"),
      payments: canAccess(profile, "payments"),
      enquiries: canAccess(profile, "enquiries"),
      voice: canAccess(profile, "voice-leads"),
      quotations: canAccess(profile, "quotations"),
    }),
    [profile],
  )

  const items = useMemo(() => attentionItems(data, access), [data, access])
  const t = useMemo(() => computeToday(data, range), [data, range])

  if (loading) return <PageLoader />

  const isEmpty = (data.enquiries?.length || 0) + (data.quotations?.length || 0) + (data.invoices?.length || 0) === 0
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
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
  const waiting = items.length === 0 ? "nothing is waiting on you" : `${items.length} thing${items.length === 1 ? "" : "s"} need${items.length === 1 ? "s" : ""} you`

  const actions = [
    access.quotations && { label: "New quotation", to: "/quotations", icon: FileText, primary: true },
    access.invoices && { label: "New invoice", to: "/billing?tab=invoices", icon: ReceiptIndianRupee },
    access.payments && { label: "Record payment", to: "/billing?tab=payments", icon: Wallet },
    canAccess(profile, "customers") && { label: "Add customer", to: "/customers", icon: Users },
  ].filter(Boolean)

  const showPipeline = access.quotations || access.enquiries || access.voice
  const showReceivables = access.invoices

  return (
    <div>
      <PageHeader title={`${greeting()}${firstName ? `, ${firstName}` : ""}`} subtitle={`${today} · ${waiting}`}>
        {actions.map((a) => (
          <Button key={a.to} variant={a.primary ? "primary" : "outline"} onClick={() => navigate(a.to)}>
            <a.icon className="h-4 w-4" /> {a.label}
          </Button>
        ))}
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <NeedsYou items={items} className="xl:col-span-3" />
        <Performance t={t} range={range} onRange={setRange} access={access} className="xl:col-span-2" />
      </div>

      {(showPipeline || showReceivables) && (
        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-5">
          {showPipeline && <Pipeline t={t} access={access} className={showReceivables ? "xl:col-span-3" : "xl:col-span-5"} />}
          {showReceivables && <Receivables t={t} className={showPipeline ? "xl:col-span-2" : "xl:col-span-5"} />}
        </div>
      )}
    </div>
  )
}

// ---- 1. Needs you today -------------------------------------------------------

function NeedsYou({ items, className }) {
  const [group, setGroup] = useState("all")
  const [expanded, setExpanded] = useState(false)

  const counts = useMemo(() => {
    const c = { all: items.length, money: 0, leads: 0, quotes: 0 }
    for (const it of items) c[it.group] += 1
    return c
  }, [items])

  const tabs = GROUPS.filter((g) => g.value === "all" || counts[g.value] > 0).map((g) => ({ ...g, count: counts[g.value] }))
  const active = tabs.some((g) => g.value === group) ? group : "all"
  const list = active === "all" ? items : items.filter((it) => it.group === active)
  const shown = expanded ? list : list.slice(0, PREVIEW_ROWS)
  const urgent = items.filter((it) => it.priority === 0).length

  return (
    <Card className={cn("min-h-[420px]", className)}>
      <CardHeader
        title="Needs you today"
        description={items.length === 0 ? "Across every date" : urgent > 0 ? `${urgent} urgent · across every date, most urgent first` : "Across every date, most urgent first"}
        action={tabs.length > 2 && <Segmented items={tabs} value={active} onChange={(v) => { setGroup(v); setExpanded(false) }} />}
      />

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success/12 text-success-text">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[15px] font-medium text-foreground">All clear</p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">No overdue invoices, waiting leads or quotations about to lapse.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((it) => (
            <AttentionRow key={it.id} it={it} />
          ))}
        </ul>
      )}

      {list.length > PREVIEW_ROWS && (
        <CardFooter className="mt-auto">
          <button type="button" onClick={() => setExpanded((e) => !e)} className="text-[13px] font-medium text-primary hover:underline">
            {expanded ? "Show fewer" : `Show all ${list.length}`}
          </button>
        </CardFooter>
      )}
    </Card>
  )
}

function AttentionRow({ it }) {
  const Icon = it.kind === "Complaint" ? AlertTriangle : it.id.startsWith("call-") ? Mic : it.group === "quotes" && it.kind === "Expiring" ? Clock : KIND_ICON[it.group]
  return (
    <li className="group relative flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-subtle">
      <span className={cn("grid h-9 w-9 flex-none place-items-center rounded-full", TONE_WELL[it.tone])}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <Link to={it.to} state={it.state} className="min-w-0 flex-1 after:absolute after:inset-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{it.title}</span>
          <Badge tone={it.tone}>{it.kind}</Badge>
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{it.detail}</span>
      </Link>
      {it.amount > 0 && <span className="flex-none text-sm font-semibold text-foreground tabular">{money(it.amount)}</span>}
      {it.phone ? (
        <a
          href={`tel:${it.phone}`}
          title={`Call ${it.phone}`}
          aria-label={`Call ${it.title}`}
          className="relative z-10 grid h-8 w-8 flex-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : (
        <span className="h-8 w-8 flex-none" aria-hidden="true" />
      )}
      <ArrowRight className="h-4 w-4 flex-none text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </li>
  )
}

// ---- 2. Performance -------------------------------------------------------------

function Performance({ t, range, onRange, access, className }) {
  // The hero is cash when this person can see payments, otherwise the value they
  // quoted: both answer "is the money coming in", at the level they work at.
  const cashHero = access.payments
  const hero = cashHero
    ? { label: "Cash collected", value: t.cash.value, prev: t.cash.prev, delta: t.cash.delta }
    : { label: "Quoted", value: t.quoted.value, prev: t.quoted.prev, delta: t.quoted.delta }

  const tiles = [
    cashHero && access.quotations && { label: "Quoted", value: money(t.quoted.value), change: <Change d={t.quoted.delta} /> },
    access.invoices && { label: "Revenue (taxable)", value: money(t.revenue.value), change: <Change d={t.revenue.delta} /> },
    access.quotations && {
      label: "Win rate",
      value: t.winRate.pct == null ? "–" : `${t.winRate.pct}%`,
      change: t.winRate.diff == null ? <Hint>{t.winRate.decided ? `${t.winRate.won} of ${t.winRate.decided}` : "No decisions yet"}</Hint> : <Change d={{ dir: t.winRate.diff > 0 ? "up" : t.winRate.diff < 0 ? "down" : "flat", pct: t.winRate.diff }} unit=" pts" />,
    },
    (access.enquiries || access.voice) && { label: "New leads", value: formatNumber(t.leads.value), change: <Change d={t.leads.delta} /> },
  ].filter(Boolean).slice(0, 4)

  return (
    <Card className={className}>
      <CardHeader title="Performance" description={`Last ${t.days} days against ${t.noun}`} action={<Segmented items={RANGES} value={range} onChange={onRange} />} />
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <span className="text-[13px] text-muted-foreground">{hero.label}</span>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[32px] font-semibold leading-none tracking-tight text-foreground tabular">{formatCurrency(hero.value)}</span>
          <Change d={hero.delta} />
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">{inWords(hero.delta, t.noun)}</p>

        {cashHero && (
          <div className="-mx-1 mt-3">
            <PaceChart labels={t.cash.pace.labels} current={t.cash.pace.current} previous={t.cash.pace.previous} height={92} valueFormatter={(v) => formatCurrency(v)} />
            <div className="mt-1.5 flex items-center gap-4 px-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-primary" /> This period</span>
              <span className="flex items-center gap-1.5"><span className="w-3.5 border-t border-dashed border-muted-foreground" /> Previous, same day</span>
            </div>
          </div>
        )}

        {tiles.length > 0 && (
          <div className="mt-auto grid grid-cols-2 gap-2.5 pt-5">
            {tiles.map((k) => (
              <div key={k.label} className="rounded-xl bg-subtle px-3.5 py-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="mt-1.5 text-lg font-semibold leading-none tracking-tight text-foreground tabular">{k.value}</div>
                <div className="mt-1.5">{k.change}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function inWords(d, noun) {
  if (d.dir === "flat") return `Level with ${noun}.`
  if (d.pct == null) return `Up from nothing in ${noun}.`
  return `${money(Math.abs(d.diff))} ${d.dir === "up" ? "more" : "less"} than ${noun}.`
}

function Change({ d, unit = "%" }) {
  if (d.dir === "flat") return <span className="inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium bg-secondary text-muted-foreground">No change</span>
  const up = d.dir === "up"
  return (
    <span className={cn("inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[11px] font-medium tabular", up ? "bg-success/12 text-success-text" : "bg-destructive/10 text-destructive-text")}>
      <ArrowUpRight className={cn("h-3 w-3", !up && "rotate-90")} />
      {d.pct == null ? "New" : `${Math.abs(d.pct)}${unit}`}
    </span>
  )
}

const Hint = ({ children }) => <span className="text-[11px] text-subtle-foreground">{children}</span>

// ---- 3a. Pipeline ---------------------------------------------------------------

function Pipeline({ t, access, className }) {
  const stages = t.pipeline.filter((s) => {
    if (s.key === "leads") return access.enquiries || access.voice
    if (s.key === "invoiced" || s.key === "paid") return access.invoices
    return access.quotations
  })
  const max = Math.max(1, ...stages.map((s) => s.count))

  return (
    <Card className={className}>
      <CardHeader title="Pipeline" description={`What moved through each stage in the last ${t.days} days`} />
      <div className="px-5 pb-5 pt-4">
        <ol className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
          {stages.map((s, i) => (
            <li key={s.key} className="relative flex min-w-0 flex-col rounded-xl bg-subtle px-3.5 py-3">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-foreground tabular">{formatNumber(s.count)}</span>
              <span className="mt-1.5 truncate text-xs text-subtle-foreground tabular">{s.value != null ? money(s.value) : " "}</span>
              <span className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(s.count / max) * 100}%`, opacity: 1 - i * 0.14 }} />
              </span>
            </li>
          ))}
        </ol>

        {access.quotations && (
          <div className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Open quotations by age</h4>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {t.openQuotes.count} open · {money(t.openQuotes.value)} · the older a quote, the less likely it closes
                </p>
              </div>
              <Link to="/quotations" className="inline-flex flex-none items-center gap-1 text-[13px] font-medium text-primary hover:underline">
                View quotations <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {t.quoteAging.map((b) => (
                <div key={b.key} className="rounded-xl border border-border px-3.5 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("h-2 w-2 rounded-full", TONE_FILL[b.tone])} /> {b.label}
                  </div>
                  <div className="mt-1.5 text-lg font-semibold leading-none text-foreground tabular">{b.count}</div>
                  <div className="mt-1 text-xs text-subtle-foreground tabular">{money(b.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

// ---- 3b. Receivables ------------------------------------------------------------

function Receivables({ t, className }) {
  const total = t.outstanding
  const overduePct = total > 0 ? Math.round((t.overdue / total) * 100) : 0
  return (
    <Card className={className}>
      <CardHeader title="Receivables" description="Money invoiced and not yet received" />
      <div className="flex flex-1 flex-col px-5 pb-5 pt-4">
        <span className="text-[13px] text-muted-foreground">Outstanding</span>
        <span className="mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-foreground tabular">{formatCurrency(total)}</span>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {total === 0 ? "Every invoice is settled." : t.overdue > 0 ? <><span className="font-medium text-destructive-text">{money(t.overdue)} overdue</span>, {overduePct}% of what is owed.</> : "Nothing is overdue yet."}
        </p>

        {total > 0 && (
          <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {t.receivables.filter((b) => b.value > 0).map((b) => (
              <span key={b.key} className={cn("h-full first:rounded-l-full last:rounded-r-full", TONE_FILL[b.tone])} style={{ width: `${(b.value / total) * 100}%` }} title={`${b.label}: ${formatCurrency(b.value)}`} />
            ))}
          </div>
        )}

        <ul className="mt-4 divide-y divide-border">
          {t.receivables.map((b) => (
            <li key={b.key} className="flex items-center gap-2.5 py-2.5 text-[13px]">
              <span className={cn("h-2 w-2 flex-none rounded-full", TONE_FILL[b.tone])} />
              <span className="flex-1 text-foreground">{b.label}</span>
              <span className="text-muted-foreground tabular">{b.count} inv</span>
              <span className="w-20 text-right font-semibold text-foreground tabular">{money(b.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <CardFooter className="mt-auto justify-between">
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
          {t.dso == null ? "No invoices in the last 90 days" : `Days sales outstanding: ${t.dso}`}
        </span>
        <Link to="/billing?tab=invoices" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
          Invoices <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardFooter>
    </Card>
  )
}
