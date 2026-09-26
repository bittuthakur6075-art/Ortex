import { useMemo } from "react"
import { Globe, Hash, Inbox, Mic, PhoneOutgoing, Send } from "../../components/ui/Icons"
import { formatNumber } from "../../lib/format"
import { computeVelocity } from "../../lib/analytics/velocity"
import { VOICE_LABEL, computeSales, durationWords } from "../../lib/analytics/sales"
import { cn } from "../../lib/cn"
import { Dot, Kicker, Panel, PanelLink, Pill, Row, Rows, Track, money } from "./parts"

// ---- Pipeline -----------------------------------------------------------------

const AGE_TONE = { emerald: "emerald", amber: "amber", rose: "rose" }
// Stage fills fade left to right: the funnel narrows, so does the ink.
const STAGE_FILL = ["bg-primary/24", "bg-primary/18", "bg-primary/13", "bg-primary/9", "bg-primary/6"]

export function Pipeline({ t, data, access }) {
  const stages = t.pipeline.filter((s) => {
    if (s.key === "leads") return access.enquiries || access.voice
    if (s.key === "invoiced" || s.key === "paid") return access.invoices
    return access.quotations
  })
  const speed = useMemo(() => computeVelocity(data), [data])
  const days = (d) => (d == null ? "Not enough data" : durationWords(d * 24))

  return (
    <Panel title="Pipeline" description={`What moved through each stage in the last ${t.days} days`} action={access.quotations && <PanelLink to="/quotations">Quotations</PanelLink>}>
      <ol className="flex gap-1">
        {stages.map((s, i) => {
          const prev = stages[i - 1]
          const conv = prev && prev.count > 0 ? Math.round((s.count / prev.count) * 100) : null
          return (
            <li
              key={s.key}
              className={cn(
                "squircle flex min-w-0 flex-1 flex-col gap-1.5 rounded-[4px] px-4 py-3.5",
                STAGE_FILL[i] || STAGE_FILL[4],
                i === 0 && "rounded-l-[16px]",
                i === stages.length - 1 && "rounded-r-[16px]",
              )}
            >
              <span className="text-xs font-medium leading-[15px] text-muted-foreground">{s.label}</span>
              <span className="text-2xl font-semibold leading-none tracking-[-0.015em] text-foreground tabular">{formatNumber(s.count)}</span>
              <span className="truncate text-xs leading-[15px] text-subtle-foreground tabular">{s.value != null ? money(s.value) : "All sources"}</span>
              <Pill tone={i ? "blue" : "slate"} className="self-start text-[11px]">
                {i === 0 ? "Start" : conv == null ? "–" : `${conv}% of ${prev.label.toLowerCase()}`}
              </Pill>
            </li>
          )
        })}
      </ol>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Kicker className="mb-2.5">Speed, median</Kicker>
          <Rows>
            <SpeedRow label="Enquiry to quote" value={days(speed.enquiryToQuote)} tone={speed.enquiryToQuote != null && speed.enquiryToQuote <= 1 ? "emerald" : "slate"} />
            <SpeedRow label="Quote to invoice" value={days(speed.quoteToInvoice)} />
            <SpeedRow label="Invoice to paid" value={days(speed.invoiceToPaid)} tone={speed.invoiceToPaid != null && speed.invoiceToPaid > 14 ? "amber" : "slate"} />
            <SpeedRow label="Full cycle" value={days(speed.fullCycle)} />
          </Rows>
        </div>
        {access.quotations && (
          <div>
            <Kicker className="mb-2.5">Open quotations by age</Kicker>
            <Rows>
              {t.quoteAging.map((b) => (
                <Row key={b.key}>
                  <Dot tone={AGE_TONE[b.tone]} />
                  <span className="flex-1 text-muted-foreground">{b.label}</span>
                  <span className="font-semibold text-foreground tabular">{b.count}</span>
                  <span className="w-14 text-right text-[12.5px] text-subtle-foreground tabular">{money(b.value)}</span>
                </Row>
              ))}
            </Rows>
          </div>
        )}
      </div>
    </Panel>
  )
}

function SpeedRow({ label, value, tone = "slate" }) {
  return (
    <Row>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <Pill tone={tone} className="text-xs">{value}</Pill>
    </Row>
  )
}

// ---- Lead sources ----------------------------------------------------------------

const SOURCE_ICON = [
  [/voice|anu/i, Mic],
  [/call agent|telecall/i, PhoneOutgoing],
  [/indiamart/i, Send],
  [/social|instagram|facebook|linkedin/i, Hash],
  [/web|site|form/i, Globe],
]
const iconFor = (label) => SOURCE_ICON.find(([re]) => re.test(label))?.[1] || Inbox

export function LeadSources({ data, range }) {
  const sales = useMemo(() => computeSales(data, range), [data, range])
  const rows = sales.sources.slice(0, 5)
  const max = Math.max(1, ...rows.map((r) => r.count))
  const best = [...rows].filter((r) => r.count >= 3 && r.conv != null).sort((a, b) => b.conv - a.conv)[0]
  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <Panel title="Lead sources" description={`${formatNumber(total)} leads in ${range === "7d" ? "7" : range === "90d" ? "90" : "30"} days, and how many became orders`} action={<PanelLink to="/insights?tab=sales">Insights</PanelLink>}>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No leads in this window yet.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {rows.map((r) => {
            const Icon = iconFor(r.label)
            return (
              <li key={r.label}>
                <div className="flex items-center gap-2.5">
                  <Icon className="h-[18px] w-[18px] flex-none text-primary" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{r.label === VOICE_LABEL ? "Anu voice" : r.label}</span>
                  <span className="text-[13px] font-semibold text-foreground tabular">{r.count}</span>
                  <Pill tone={best && r.label === best.label ? "emerald" : "slate"} className="text-[11px]">
                    {r.conv == null ? "–" : `${r.conv}%`}
                  </Pill>
                </div>
                <Track pct={(r.count / max) * 100} className="mt-2" fillClassName={r.conv == null ? "opacity-30" : ""} />
              </li>
            )
          })}
        </ul>
      )}
      {best && <p className="squircle rounded-xl bg-primary/10 px-3.5 py-3 text-[12.5px] font-medium leading-4 text-primary">{best.label === VOICE_LABEL ? "Anu voice" : best.label} leads convert best, at {best.conv}%.</p>}
    </Panel>
  )
}
