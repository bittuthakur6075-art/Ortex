import { useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Hash,
  Inbox,
  Mic,
  PhoneOutgoing,
  ReceiptIndianRupee,
  Wallet,
} from "../../components/ui/Icons"
import { Button } from "../../components/ui/Ui"
import { cn } from "../../lib/cn"
import { Dot, Kicker, Panel, PanelLink, Pill, Seg, TONE, money } from "./parts"

// One queue for every module, most urgent first. Quote-to-cash items come from
// attentionItems, decisions from approvalItems (lib/analytics/today.js).
// Leave can be approved in place; declining asks for a reason, so it (and
// every other action) opens the record's own page.

const GROUPS = [
  { value: "approvals", label: "Approvals", title: "Approvals · only you or an admin can give these", tone: "violet" },
  { value: "money", label: "Money", title: "Money", tone: "rose" },
  { value: "leads", label: "Leads", title: "Leads", tone: "blue" },
  { value: "quotes", label: "Quotes", title: "Quotes", tone: "amber" },
]

const ICON = {
  Leave: Calendar,
  Correction: CalendarClock,
  "Pay run": Wallet,
  "Social post": Hash,
  Overdue: ReceiptIndianRupee,
  "Due soon": ReceiptIndianRupee,
  Complaint: AlertTriangle,
  "Anu call": Mic,
  "Urgent call": Mic,
  "New enquiry": Inbox,
  Expiring: Clock,
  Lapsed: Clock,
  Chase: FileText,
  "Deal closed": PhoneOutgoing,
  "Needs a quote": PhoneOutgoing,
  Interested: PhoneOutgoing,
}

// The row's own action, in the words the Figma queue uses. Each opens the
// record; the only in-place write is approving leave.
const ACTION = {
  Correction: "Decide",
  "Pay run": "Review",
  "Social post": "Review",
  Overdue: "View",
  "Due soon": "View",
  Complaint: "Call",
  "Anu call": "Call",
  "Urgent call": "Call",
  "New enquiry": "Open",
  Expiring: "Follow up",
  Lapsed: "Follow up",
  Chase: "Follow up",
  "Deal closed": "Quote",
  "Needs a quote": "Quote",
  Interested: "Open",
}
const PRIMARY = new Set(["Pay run", "Social post"])

const PREVIEW = 8

export default function NeedsYou({ items, onApprove }) {
  const [group, setGroup] = useState("all")
  const [expanded, setExpanded] = useState(false)

  const counts = useMemo(() => {
    const c = { all: items.length }
    for (const it of items) c[it.group] = (c[it.group] || 0) + 1
    return c
  }, [items])

  const tabs = [{ value: "all", label: `All ${items.length}` }, ...GROUPS.filter((g) => counts[g.value]).map((g) => ({ value: g.value, label: `${g.label} ${counts[g.value]}` }))]
  const active = tabs.some((t) => t.value === group) ? group : "all"
  const list = active === "all" ? items : items.filter((it) => it.group === active)
  const shown = expanded ? list : list.slice(0, PREVIEW)
  const sections = GROUPS.map((g) => ({ ...g, rows: shown.filter((it) => it.group === g.value) })).filter((g) => g.rows.length)
  const hasApprovals = counts.approvals > 0

  return (
    <Panel title="Needs you today" description="Every module in one queue, most urgent first" action={items.length > 0 && <Pill tone="blue" size="md">{items.length} open</Pill>}>
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success/12 text-success-text">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="mt-3 text-[15px] font-medium text-foreground">All clear</p>
          <p className="mt-1 max-w-xs text-[13px] text-muted-foreground">Nothing is overdue, waiting or about to lapse, and no one is waiting on a decision.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Seg items={tabs} value={active} onChange={(v) => { setGroup(v); setExpanded(false) }} />
            <span className="hidden text-[12.5px] font-medium text-subtle-foreground sm:inline">Sorted by urgency</span>
          </div>

          <div className="flex flex-col gap-4">
            {sections.map((g) => (
              <div key={g.value} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-1 pb-1">
                  <Dot tone={g.tone} />
                  <Kicker>{g.title}</Kicker>
                </div>
                {g.rows.map((it) => (
                  <QueueRow key={it.id} it={it} tone={g.tone} onApprove={onApprove} />
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            {list.length > PREVIEW ? (
              <button type="button" onClick={() => setExpanded((e) => !e)} className="text-[13px] font-semibold text-primary hover:underline">
                {expanded ? "Show fewer" : `Show all ${list.length} →`}
              </button>
            ) : (
              <PanelLink to="/crm">All leads</PanelLink>
            )}
            {hasApprovals && <span className="text-[12.5px] text-subtle-foreground">Leave, corrections and pay runs now arrive here too</span>}
          </div>
        </>
      )}
    </Panel>
  )
}

function QueueRow({ it, tone, onApprove }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const Icon = ICON[it.kind] || FileText
  const t = TONE[tone] || TONE.slate
  const leave = onApprove && it.id.startsWith("leave-")
  const label = ACTION[it.kind] || "Open"
  const open = () => navigate(it.to, { state: it.state })

  const approve = async () => {
    setBusy(true)
    try {
      await onApprove(it)
      toast.success("Leave approved")
    } catch (e) {
      toast.error(e.message || "Could not approve")
      setBusy(false)
    }
  }

  return (
    <div className="squircle flex items-center gap-3.5 rounded-xl bg-subtle p-3">
      <span className={cn("squircle grid h-10 w-10 flex-none place-items-center rounded-xl", t.soft, t.text)}>
        <Icon className="h-5 w-5" />
      </span>
      <Link to={it.to} state={it.state} className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-sm font-medium leading-[17px] text-foreground hover:underline">{it.title}</span>
        <span className="truncate text-[12.5px] leading-[15px] text-subtle-foreground">{it.detail}</span>
      </Link>
      {it.amount > 0 && <span className="flex-none text-sm font-semibold text-foreground tabular">{money(it.amount)}</span>}
      <div className="flex flex-none items-center gap-2">
        {leave ? (
          <>
            <Button size="sm" variant="outline" onClick={open}>
              Decline
            </Button>
            <Button size="sm" onClick={approve} disabled={busy}>
              {busy ? "Approving" : "Approve"}
            </Button>
          </>
        ) : label === "Call" && it.phone ? (
          <Button size="sm" variant="outline" onClick={() => (window.location.href = `tel:${it.phone}`)}>
            Call
          </Button>
        ) : (
          <Button size="sm" variant={PRIMARY.has(it.kind) ? "primary" : "outline"} onClick={open}>
            {label === "Call" ? "Open" : label}
          </Button>
        )}
      </div>
    </div>
  )
}
