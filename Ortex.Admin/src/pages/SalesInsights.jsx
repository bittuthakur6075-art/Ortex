import { useMemo, useState } from "react"
import { ArrowUpRight, Clock } from "../components/ui/Icons"
import { useCollections } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { QUOTATION_STATUS, statusMeta } from "../data/domain/schema"
import { VOICE_SOURCE } from "./voice-leads/helpers"
import { computeAnalytics } from "../lib/analytics/dashboard"
import { RANGES } from "../lib/analytics/today"
import { computeSales, durationWords, speedWords } from "../lib/analytics/sales"
import { formatCurrency, formatNumber, round2 } from "../lib/format"
import { cn } from "../lib/cn"
import PageHeader, { ActionBar } from "../components/layout/PageHeader"
import SectionCard from "../components/ui/SectionCard"
import { PageLoader, Segmented } from "../components/ui/Ui"
import { AreaChart, BarChart, CHART_COLORS } from "../components/ui/Chart"

// The slower questions, one tab away from the Dashboard: where leads come from
// and which convert, what is being quoted and to whom, why deals are lost, how
// fast a lead is priced and when leads arrive. The same analysis as the phone's
// Insights page, on the same maths (lib/analytics/sales.js, mirroring
// Ortex.Mobile/src/domain/dashboard.ts), over a rolling 7 / 30 / 90-day window
// compared with the one before it.
//
// Each card is gated by the module it reads. Leads and quotations work for
// anyone; the revenue, category and margin cards need invoices (and payments
// for collections), so they only render with invoice access.

const money = (v) => formatCurrency(v, { compact: true })
const plural = (n, word) => `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}`

// Status fills for the part-to-whole bar, semantic tokens only.
const STATUS_FILL = {
  draft: "bg-subtle-foreground",
  sent: "bg-primary",
  accepted: "bg-success",
  invoiced: "bg-info",
  rejected: "bg-destructive",
  expired: "bg-warning",
}

export default function SalesInsights({ embedded = false }) {
  const Header = embedded ? ActionBar : PageHeader
  const profile = useProfile()
  const access = useMemo(
    () => ({
      enquiries: canAccess(profile, "enquiries"),
      voice: canAccess(profile, "voice-leads"),
      quotations: canAccess(profile, "quotations"),
      invoices: canAccess(profile, "invoices"),
    }),
    [profile],
  )
  const leadsAccess = access.enquiries || access.voice

  const names = useMemo(
    () => [
      ...(leadsAccess ? ["enquiries"] : []),
      ...(access.quotations ? ["quotations"] : []),
      ...(access.invoices ? ["products", "invoices", "payments"] : []),
    ],
    [leadsAccess, access.quotations, access.invoices],
  )
  const { data, loading } = useCollections(names)
  const [range, setRange] = useState("30d")

  const s = useMemo(() => {
    // Drop rows of a module the profile lacks before counting, as the phone does.
    const enquiries = (data.enquiries || []).filter((e) => (e.source === VOICE_SOURCE ? access.voice : access.enquiries))
    return computeSales({ enquiries, quotations: data.quotations || [] }, range)
  }, [data, range, access])
  const money6 = useMemo(() => (access.invoices ? computeAnalytics(data, "30d") : null), [data, access.invoices])

  if (loading) return <PageLoader />

  return (
    <div>
      <Header title="Sales" subtitle={`Last ${s.days} days, compared with ${s.noun}`}>
        <Segmented items={RANGES} value={range} onChange={setRange} size="md" />
      </Header>

      {access.quotations && <Headline s={s} leadsAccess={leadsAccess} />}

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {leadsAccess && <LeadSources s={s} />}
        {leadsAccess && <WhenLeadsArrive heatmap={s.heatmap} />}
        {access.quotations && <TopProducts s={s} />}
        {access.quotations && <TopCustomers s={s} />}
        {access.quotations && <StatusMix s={s} />}
        {access.quotations && <ReasonsLost s={s} />}
      </div>

      {money6 && (
        <>
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <SectionCard className="lg:col-span-2" title="Revenue vs. collections" description="Last six months, taxable revenue booked against cash received" bodyClassName="px-3 pb-3 pt-2">
              <AreaChart
                height={272}
                categories={money6.trend.map((t) => t.label)}
                series={[
                  { name: "Revenue", data: money6.trend.map((t) => round2(t.revenue)) },
                  { name: "Collected", data: money6.trend.map((t) => round2(t.collected)) },
                ]}
                valueFormatter={(v) => money(v)}
              />
            </SectionCard>
            <InvoiceMetrics a={money6} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5">
            <CategoryRevenue rows={money6.categoryRevenue} />
          </div>
        </>
      )}
    </div>
  )
}

// ---- headline tiles ---------------------------------------------------------------

function Headline({ s, leadsAccess }) {
  const winDiff = s.winRate.pct != null && s.winRate.prevPct != null ? s.winRate.pct - s.winRate.prevPct : null
  const tiles = [
    { label: "Quoted", value: money(s.quoted.value), change: <Change d={s.quoted.delta} />, hint: plural(s.quoted.count, "quotation") },
    { label: "Average quote", value: money(s.avgQuote.value), change: <Change d={s.avgQuote.delta} />, hint: `${money(s.avgQuote.prev)} before` },
    {
      label: "Win rate",
      value: s.winRate.pct == null ? "–" : `${s.winRate.pct}%`,
      change: winDiff == null ? null : <Change d={{ dir: winDiff > 0 ? "up" : winDiff < 0 ? "down" : "flat", pct: Math.abs(winDiff) }} unit=" pts" />,
      hint: `${s.winRate.won} of ${s.winRate.decided} decided`,
    },
    leadsAccess && { label: "New leads", value: formatNumber(s.leads.total), change: <Change d={s.leads.delta} />, hint: `${s.uncontacted} still new` },
  ].filter(Boolean)

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <SectionCard className="lg:col-span-2" title="This period" description={`Quotations dated in the last ${s.days} days`}>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {tiles.map((k) => (
            <div key={k.label} className="rounded-xl bg-subtle px-3.5 py-3">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1.5 text-lg font-semibold leading-none tracking-tight text-foreground tabular">{k.value}</div>
              <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5">
                {k.change}
                <span className="text-[11px] text-subtle-foreground">{k.hint}</span>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
      {leadsAccess && <TimeToQuote s={s} />}
    </div>
  )
}

function TimeToQuote({ s }) {
  const { hours, prevHours, samples } = s.timeToQuote
  // Faster is better, so a shorter time reads as the good (green) direction.
  const faster = hours != null && prevHours != null ? (hours < prevHours ? "good" : hours > prevHours ? "bad" : null) : null
  return (
    <SectionCard title="Time to quote" description="Median, from a lead arriving to its first quotation">
      <div className="flex items-center gap-3">
        <span className="inline-grid h-11 w-11 flex-none place-items-center rounded-full bg-primary/10 text-primary">
          <Clock className="h-5 w-5" />
        </span>
        <span className="text-[28px] font-semibold leading-none tracking-tight text-foreground tabular">{durationWords(hours)}</span>
      </div>
      <p className={cn("mt-3 text-[13px]", faster === "good" ? "text-success-text" : faster === "bad" ? "text-destructive-text" : "text-muted-foreground")}>
        {speedWords(hours, prevHours, s.noun)}
      </p>
      <p className="mt-1 text-xs text-subtle-foreground">
        {samples ? `From ${plural(samples, "lead")} with a linked quotation` : "Only leads turned into a quotation from the lead itself are timed"}
      </p>
    </SectionCard>
  )
}

function Change({ d, unit = "%" }) {
  if (d.dir === "flat") return <span className="inline-flex h-5 items-center rounded bg-secondary px-1.5 text-[11px] font-medium text-muted-foreground">No change</span>
  const up = d.dir === "up"
  return (
    <span className={cn("inline-flex h-5 items-center gap-0.5 rounded px-1.5 text-[11px] font-medium tabular", up ? "bg-success/12 text-success-text" : "bg-destructive/10 text-destructive-text")}>
      <ArrowUpRight className={cn("h-3 w-3", !up && "rotate-90")} />
      {d.pct == null ? "New" : `${Math.abs(d.pct)}${unit}`}
    </span>
  )
}

// ---- ranked bars ------------------------------------------------------------------

// Volume and a part of it in one mark: the whole bar is the value, the solid
// part inside it (when given) the won share. Widths are relative to the largest
// row, so the ranking reads at a glance.
function RankedBars({ rows, tone = "primary", partLabel }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  const fill = tone === "destructive" ? "bg-destructive" : "bg-primary"
  const well = tone === "destructive" ? "bg-destructive/15" : "bg-primary/15"
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-foreground" title={r.label}>{r.label}</span>
            <span className="flex-none font-semibold text-foreground tabular">{r.display}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-subtle">
            <div className={cn("relative h-full overflow-hidden rounded-full", r.part != null ? well : fill)} style={{ width: `${(r.value / max) * 100}%` }}>
              {r.part != null && r.part > 0 && (
                <div className={cn("h-full rounded-full", fill)} style={{ width: `${Math.min(100, (r.part / (r.value || 1)) * 100)}%` }} title={partLabel ? `${partLabel}: ${r.partDisplay ?? r.part}` : undefined} />
              )}
            </div>
          </div>
          {r.sub && <div className="mt-1 text-xs text-subtle-foreground">{r.sub}</div>}
        </li>
      ))}
    </ul>
  )
}

function Legend({ items }) {
  return (
    <span className="flex items-center gap-3 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", i.className)} /> {i.label}
        </span>
      ))}
    </span>
  )
}

function LeadSources({ s }) {
  return (
    <SectionCard
      title="Where leads come from"
      description={`${plural(s.leads.total, "lead")} in the last ${s.days} days, won ones counted through their quotation`}
      action={<Legend items={[{ label: "Leads", className: "bg-primary/15" }, { label: "Won", className: "bg-primary" }]} />}
    >
      {s.sources.length ? (
        <RankedBars
          partLabel="Won"
          rows={s.sources.map((x) => ({
            key: x.label,
            label: x.label,
            value: x.count,
            part: x.won,
            display: formatNumber(x.count),
            sub: x.won ? `${x.won} won · ${x.conv}% converted` : "None won yet",
          }))}
        />
      ) : (
        <Empty text={`No leads in the last ${s.days} days.`} />
      )}
    </SectionCard>
  )
}

function TopProducts({ s }) {
  return (
    <SectionCard title="Most quoted products" description="By line value, ex-GST, on quotations issued in the period">
      {s.topProducts.length ? (
        <RankedBars
          rows={s.topProducts.map((p) => ({
            key: p.name,
            label: p.name,
            value: p.value,
            display: money(p.value),
            sub: `${formatNumber(p.quantity)} pcs across ${plural(p.quotes, "quote")}`,
          }))}
        />
      ) : (
        <Empty text={`Nothing quoted in the last ${s.days} days.`} />
      )}
    </SectionCard>
  )
}

function TopCustomers({ s }) {
  return (
    <SectionCard
      title="Top customers"
      description="By quoted value, with the part won"
      action={<Legend items={[{ label: "Quoted", className: "bg-primary/15" }, { label: "Won", className: "bg-primary" }]} />}
    >
      {s.topCustomers.length ? (
        <RankedBars
          partLabel="Won"
          rows={s.topCustomers.map((c) => ({
            key: c.name,
            label: c.name,
            value: c.value,
            part: c.wonValue,
            partDisplay: money(c.wonValue),
            display: money(c.value),
            sub: `${plural(c.quotes, "quote")}${c.wonValue ? ` · ${money(c.wonValue)} won` : " · none won yet"}`,
          }))}
        />
      ) : (
        <Empty text={`No customers quoted in the last ${s.days} days.`} />
      )}
    </SectionCard>
  )
}

function ReasonsLost({ s }) {
  const total = s.lostReasons.reduce((n, r) => n + r.count, 0)
  return (
    <SectionCard title="Why we lose" description={total ? `${plural(total, "rejected quotation")} in the period` : "Rejected quotations in the period"}>
      {total ? (
        <RankedBars
          tone="destructive"
          rows={s.lostReasons.map((r) => ({
            key: r.reason,
            label: r.reason,
            value: r.count,
            display: `${r.count} · ${Math.round((r.count / total) * 100)}%`,
          }))}
        />
      ) : (
        <Empty text="No quotation was rejected in this period." />
      )}
    </SectionCard>
  )
}

// ---- quotation status mix -------------------------------------------------------

function StatusMix({ s }) {
  const total = s.statusMix.reduce((n, m) => n + m.value, 0)
  const count = s.statusMix.reduce((n, m) => n + m.count, 0)
  return (
    <SectionCard title="Quotation status" description={`By value, every quotation dated in the period, drafts included · ${money(s.openValue)} open overall`}>
      {count ? (
        <>
          <span className="text-[28px] font-semibold leading-none tracking-tight text-foreground tabular">{formatCurrency(total)}</span>
          <p className="mt-1.5 text-[13px] text-muted-foreground">{plural(count, "quotation")}</p>
          {total > 0 && (
            <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
              {s.statusMix.filter((m) => m.value > 0).map((m) => (
                <span
                  key={m.id}
                  className={cn("h-full first:rounded-l-full last:rounded-r-full", STATUS_FILL[m.id])}
                  style={{ width: `${(m.value / total) * 100}%` }}
                  title={`${statusMeta(QUOTATION_STATUS, m.id).label}: ${formatCurrency(m.value)}`}
                />
              ))}
            </div>
          )}
          <ul className="mt-4 divide-y divide-border">
            {s.statusMix.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 py-2.5 text-[13px]">
                <span className={cn("h-2 w-2 flex-none rounded-full", STATUS_FILL[m.id])} />
                <span className="flex-1 text-foreground">{statusMeta(QUOTATION_STATUS, m.id).label}</span>
                <span className="text-muted-foreground tabular">{m.count}</span>
                <span className="w-12 text-right text-muted-foreground tabular">{total ? `${Math.round((m.value / total) * 100)}%` : "–"}</span>
                <span className="w-20 text-right font-semibold text-foreground tabular">{money(m.value)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty text={`No quotations in the last ${s.days} days.`} />
      )}
    </SectionCard>
  )
}

// ---- when leads arrive ----------------------------------------------------------

// Weekday × time band, one hue whose strength is the count. The busiest cell is
// named in words above the grid and outlined inside it.
function WhenLeadsArrive({ heatmap: h }) {
  return (
    <SectionCard
      title="When leads arrive"
      description="Last 90 days, whatever the range, in your local time"
    >
      {h.total ? (
        <>
          <p className="text-[13px] text-muted-foreground">
            Busiest: <span className="font-medium text-foreground">{h.peak.day} {h.peak.band}</span> with {plural(h.peak.count, "lead")} of {formatNumber(h.total)}.
          </p>
          <div className="mt-4 overflow-x-auto">
            <div className="grid min-w-[340px] gap-1" style={{ gridTemplateColumns: `2.5rem repeat(${h.bands.length}, minmax(0, 1fr))` }}>
              <span />
              {h.bands.map((b) => (
                <span key={b} className="pb-1 text-center text-xs text-muted-foreground">{b}</span>
              ))}
              {h.days.map((day, di) => (
                <Row key={day} day={day} cells={h.cells[di]} bands={h.bands} max={h.max} peak={h.peak} />
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-xs text-subtle-foreground">
            Fewer
            {[0.12, 0.35, 0.6, 0.85, 1].map((o) => (
              <span key={o} className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: `hsl(var(--primary) / ${o})` }} />
            ))}
            More
          </div>
        </>
      ) : (
        <Empty text="No leads in the last 90 days." />
      )}
    </SectionCard>
  )
}

function Row({ day, cells, bands, max, peak }) {
  return (
    <>
      <span className="self-center text-xs text-muted-foreground">{day}</span>
      {cells.map((n, bi) => {
        const isPeak = peak && peak.day === day && peak.band === bands[bi]
        const strength = n ? 0.12 + 0.88 * (n / max) : 0
        return (
          <span
            key={bi}
            title={`${day} ${bands[bi]}: ${plural(n, "lead")}`}
            className={cn(
              "grid h-8 place-items-center rounded-md text-[11px] tabular",
              n ? "" : "bg-subtle",
              strength > 0.55 ? "text-primary-foreground" : "text-muted-foreground",
              isPeak && "ring-2 ring-foreground ring-offset-1 ring-offset-card",
            )}
            style={n ? { backgroundColor: `hsl(var(--primary) / ${strength})` } : undefined}
          >
            {n || ""}
          </span>
        )
      })}
    </>
  )
}

// ---- invoice-derived cards (need invoice access) -----------------------------------

function InvoiceMetrics({ a }) {
  const revenue = a.categoryRevenue.reduce((n, c) => n + c.revenue, 0)
  const margin = a.categoryRevenue.reduce((n, c) => n + c.margin, 0)
  const items = [
    { label: "Gross margin", value: revenue ? `${Math.round((margin / revenue) * 100)}%` : "–", hint: `${money(margin)}, all invoices` },
    { label: "Days sales outstanding", value: `${a.dso}`, hint: "days, trailing 90" },
    { label: "Repeat customers", value: `${a.repeatRate}%`, hint: "invoiced twice or more" },
    { label: "Outstanding", value: money(a.totalOutstanding), hint: "on every live invoice" },
  ]
  return (
    <SectionCard title="Invoices">
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((k) => (
          <div key={k.label} className="rounded-xl bg-subtle px-3.5 py-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-lg font-semibold leading-none tracking-tight text-foreground tabular">{k.value}</div>
            <div className="mt-1 text-xs text-subtle-foreground">{k.hint}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

function CategoryRevenue({ rows }) {
  return (
    <SectionCard title="Revenue by category" description="Taxable value of invoice lines, all time" bodyClassName="px-3 pb-3">
      {rows.length === 0 ? (
        <Empty />
      ) : (
        <BarChart
          height={Math.max(200, rows.length * 44)}
          categories={rows.map((r) => r.category)}
          series={[{ name: "Revenue", data: rows.map((r) => round2(r.revenue)) }]}
          colors={[CHART_COLORS.violet]}
          valueFormatter={(v) => money(v)}
        />
      )}
    </SectionCard>
  )
}

function Empty({ text = "No data yet." }) {
  return <p className="py-4 text-[13px] text-muted-foreground">{text}</p>
}
