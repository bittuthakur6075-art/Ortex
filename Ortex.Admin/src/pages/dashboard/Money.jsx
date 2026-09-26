import { useMemo, useState } from "react"
import { TrendingUp } from "../../components/ui/Icons"
import { formatCurrency } from "../../lib/format"
import { DAY, monthlyCash, partyName, weeklyCash } from "../../lib/analytics/today"
import { cn } from "../../lib/cn"
import { invoiceBalance, resolveInvoiceStatus } from "../../data/domain/domain"
import { Dot, Initials, Kicker, Panel, PanelLink, PairBars, Pill, Row, Rows, Seg, SplitBar, Tile, money } from "./parts"

// ---- Cash flow ----------------------------------------------------------------

export function CashFlow({ data }) {
  const [by, setBy] = useState("week")
  const series = useMemo(() => (by === "week" ? weeklyCash(data, 12) : monthlyCash(data, 6)), [data, by])
  const total = (k) => series.reduce((s, w) => s + w[k], 0)
  const invoiced = total("invoiced")
  const collected = total("collected")
  const paidOut = total("paidOut")
  const share = invoiced > 0 ? Math.round((collected / invoiced) * 100) : null
  const ahead = series.slice(-4).filter((w) => w.collected > w.invoiced).length
  const span = by === "week" ? "12 weeks" : "6 months"
  const invoicesIn = (data.invoices || []).filter((i) => !["draft", "cancelled"].includes(i.status) && Date.now() - new Date(i.issueDate).getTime() <= (by === "week" ? 84 : 183) * DAY).length
  const payoutsIn = (data.payments || []).filter((p) => p.type !== "inflow" && Date.now() - new Date(p.date).getTime() <= (by === "week" ? 84 : 183) * DAY).length

  return (
    <Panel
      title="Cash flow"
      description={by === "week" ? "Invoiced against collected, week by week" : "Invoiced against collected, month by month"}
      action={<Seg items={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }]} value={by} onChange={setBy} />}
    >
      <div className="flex gap-2">
        <Tile label={<Legend className="bg-primary">Collected</Legend>} value={money(collected)} sub={share == null ? "Nothing invoiced yet" : `${share}% of invoiced`} />
        <Tile label={<Legend className="bg-primary-soft">Invoiced</Legend>} value={money(invoiced)} sub={`${invoicesIn} invoice${invoicesIn === 1 ? "" : "s"}`} />
        <Tile label={<Legend className="bg-warning">Paid out</Legend>} value={money(paidOut)} sub={`${payoutsIn} payout${payoutsIn === 1 ? "" : "s"}`} />
        <Tile label={<Legend className="bg-success">Net</Legend>} value={money(collected - paidOut)} sub={`Over ${span}`} />
      </div>

      <PairBars series={series} height={220} format={(v) => formatCurrency(v, { compact: true })} />

      {invoiced > 0 && (
        <p className="squircle flex items-center gap-2.5 rounded-xl bg-primary/10 px-3.5 py-3 text-[13px] font-medium leading-4 text-primary">
          <TrendingUp className="h-[18px] w-[18px] flex-none" />
          {ahead >= 3 && by === "week"
            ? `Collections ran ahead of invoicing in ${ahead} of the last 4 weeks. ${share}% of what was invoiced is already in.`
            : `${share}% of what was invoiced over ${span} is already in.`}
        </p>
      )}
    </Panel>
  )
}

function Legend({ className, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 flex-none rounded-full", className)} aria-hidden="true" />
      {children}
    </span>
  )
}

// ---- Receivables ----------------------------------------------------------------

const TONE_OF = { emerald: "emerald", amber: "amber", orange: "orange", rose: "rose" }

export function Receivables({ t, invoices, payments }) {
  // The biggest balances already late, so the card ends in a name to call.
  const worst = useMemo(() => {
    const now = Date.now()
    return invoices
      .map((inv) => {
        const status = resolveInvoiceStatus(inv, payments)
        if (["paid", "cancelled", "draft"].includes(status) || !inv.dueDate) return null
        const late = Math.floor((now - new Date(inv.dueDate).getTime()) / DAY)
        const balance = invoiceBalance(inv, payments)
        return late > 0 && balance > 0.5 ? { id: inv.id, name: partyName(inv.customer), number: inv.number, late, balance } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 3)
  }, [invoices, payments])

  const total = t.outstanding
  return (
    <Panel title="Receivables" description="Invoiced, not yet received" action={<PanelLink to="/billing?tab=invoices">Billing</PanelLink>}>
      <div>
        <div className="text-[12.5px] font-medium leading-4 text-muted-foreground">Outstanding</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-foreground tabular">{formatCurrency(total)}</span>
          {t.overdue > 0 && <Pill tone="rose">{money(t.overdue)} overdue</Pill>}
        </div>
      </div>
      {total > 0 ? (
        <>
          <SplitBar parts={t.receivables.map((b) => ({ key: b.key, value: b.value, tone: TONE_OF[b.tone], label: `${b.label}: ${formatCurrency(b.value)}` }))} />
          <Rows>
            {t.receivables.map((b) => (
              <Row key={b.key}>
                <Dot tone={TONE_OF[b.tone]} />
                <span className="flex-1 text-foreground">{b.label}</span>
                <span className="font-semibold text-foreground tabular">{money(b.value)}</span>
              </Row>
            ))}
          </Rows>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">Every invoice is settled.</p>
      )}
      {worst.length > 0 && (
        <div>
          <Kicker className="mb-2.5">Most overdue</Kicker>
          <ul className="space-y-2.5">
            {worst.map((w) => (
              <li key={w.id} className="flex items-center gap-2.5">
                <Initials name={w.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">{w.name}</div>
                  <div className="text-[11.5px] text-subtle-foreground">{w.number} · {w.late} days late</div>
                </div>
                <span className="text-[13px] font-semibold text-destructive-text tabular">{money(w.balance)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
