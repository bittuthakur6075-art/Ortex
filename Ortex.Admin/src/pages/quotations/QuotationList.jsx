import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { FileText, Search, Plus, MessageCircle, MoreHorizontal, Send, Eye, Mail, Download, ExportFile, RefreshCw, CheckCircle2, FileCheck2, Copy, AlertTriangle, Calendar, Inbox } from "../../components/ui/Icons"
import { QUOTATION_STATUS, LOST_REASONS } from "../../data/domain/schema"
import { formatDate } from "../../lib/format"
import { exportCsv } from "../../lib/csv"
import { cn } from "../../lib/cn"
import { QUOTE_GROUPS, QUOTE_TONE, rupees } from "../../lib/salesWork"
import { Button, Chip, EmptyState, Modal, PageLoader } from "../../components/ui/Ui"
import { CompanyChip } from "../../components/ui/CompanyChip"
import {
  ListHeader, SmartViews, ListSearch, ToolButton, InlineSelect, Check, CursorBar, GroupRow, StatusDot, Initials, RowAction, ActionMenu, Pager, useListKeys,
} from "../../components/sales/ListParts"
import { Track } from "../dashboard/parts"
import { firstName } from "../leads/actions"
import { buildQuoteRow } from "./model"
import { downloadPdf, duplicateDraft, extendValidity, sendQuotation, setQuoteStatus, startWhatsAppShare } from "./actions"
import { useConvertConfirm } from "./ConvertDialog"

const COLS = 9
const DAY = 86400000

const STATUS_FILTER = [
  { value: "open", label: "open" },
  { value: "all", label: "all" },
  { value: "draft", label: "draft" },
  { value: "sent", label: "sent" },
  { value: "accepted", label: "accepted" },
  { value: "closed", label: "closed" },
]
const AMOUNT = [
  { value: "any", label: "any", test: () => true },
  { value: "s", label: "under ₹50K", test: (v) => v < 50000 },
  { value: "m", label: "₹50K to ₹2L", test: (v) => v >= 50000 && v <= 200000 },
  { value: "l", label: "over ₹2L", test: (v) => v > 200000 },
]
const GROUP_BY = [
  { value: "none", label: "None" },
  { value: "next", label: "Next step" },
  { value: "status", label: "Status" },
]
const SORT_BY = [
  { value: "newest", label: "Newest" },
  { value: "follow", label: "Follow-up" },
  { value: "amount", label: "Amount" },
]

const compact = (v) => {
  const n = Number(v) || 0
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${+(n / 1e3).toFixed(1)}K`
  return `₹${Math.round(n)}`
}
const dm = (ts) => new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
const monthKey = (t) => `${new Date(t).getFullYear()}-${new Date(t).getMonth()}`

// Quotations (Figma "V2 · Quotations · List"): grouped by what each one needs
// next, with its age since sending, validity countdown, source lead, owner and
// the send / remind / invoice action on the row itself.
export default function QuotationList({ items, loading, settingsOf, enquiries = [], invoices = [], onOpen, onNew, onSend, onPreview }) {
  const navigate = useNavigate()
  const [view, setView] = useState("all")
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("all")
  const [owner, setOwner] = useState("")
  const [amount, setAmount] = useState("any")
  const [groupBy, setGroupBy] = useState("none")
  const [sortBy, setSortBy] = useState("newest")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [selected, setSelected] = useState(() => new Set())
  const [activeId, setActiveId] = useState(null)
  const [menu, setMenu] = useState(null)
  const [filterMenu, setFilterMenu] = useState(null)
  const [lostFor, setLostFor] = useState(null)
  const searchRef = useRef(null)
  const convert = useConvertConfirm()
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const rows = useMemo(
    () =>
      items.map((q) => buildQuoteRow(q, { enquiries, invoices, now })),
    [items, enquiries, invoices, now],
  )

  const views = useMemo(() => {
    const sum = (list) => list.reduce((s, r) => s + r.total, 0)
    const needs = rows.filter((r) => r.fu.group === "needs")
    const drafts = rows.filter((r) => r.st === "draft")
    const follow = rows.filter((r) => r.st === "sent" && (r.fu.overdue || r.fu.today))
    const expiring = rows.filter((r) => r.st === "sent" && r.left != null && r.left >= 0 && r.left <= 7)
    const accepted = rows.filter((r) => r.st === "accepted")
    const mk = monthKey(now)
    const issued = rows.filter((r) => monthKey(r.q.issueDate) === mk)
    const won = issued.filter((r) => ["accepted", "invoiced"].includes(r.st))
    const month = new Date(now).toLocaleDateString("en-IN", { month: "short" })
    return [
      { key: "needs", label: "Needs you", value: needs.length, sub: compact(sum(needs)), match: (r) => r.fu.group === "needs" },
      { key: "drafts", label: "Drafts to send", tone: "slate", value: drafts.length, sub: compact(sum(drafts)), match: (r) => r.st === "draft" },
      { key: "follow", label: "Follow up today", tone: "rose", alert: follow.length > 0, value: follow.length, sub: `${follow.filter((r) => r.fu.overdue).length} overdue`, match: (r) => r.st === "sent" && (r.fu.overdue || r.fu.today) },
      { key: "expiring", label: "Expiring in 7 days", tone: "amber", value: expiring.length, sub: `${compact(sum(expiring))} at risk`, match: (r) => r.st === "sent" && r.left != null && r.left >= 0 && r.left <= 7 },
      { key: "accepted", label: "Accepted, not invoiced", tone: "emerald", value: accepted.length, sub: `${compact(sum(accepted))} to bill`, match: (r) => r.st === "accepted" },
      { key: "won", label: `Won · ${month}`, tone: "emerald", value: compact(sum(won)), sub: `${won.length} of ${issued.length} · ${issued.length ? Math.round((won.length / issued.length) * 100) : 0}%`, match: (r) => monthKey(r.q.issueDate) === mk && ["accepted", "invoiced"].includes(r.st) },
      { key: "all", label: "All quotations", value: rows.length, sub: "every status", match: () => true },
    ]
  }, [rows, now])

  const owners = useMemo(() => [...new Set(items.map((q) => q.sellerName).filter(Boolean))].sort(), [items])

  const filtered = useMemo(() => {
    const match = views.find((v) => v.key === view)?.match || (() => true)
    const amt = AMOUNT.find((a) => a.value === amount).test
    const s = query.trim().toLowerCase()
    let list = rows.filter(match).filter((r) => amt(r.total))
    if (view === "all") {
      if (status === "open") list = list.filter((r) => r.open)
      else if (status === "closed") list = list.filter((r) => !r.open)
      else if (status !== "all") list = list.filter((r) => r.st === status)
    }
    if (owner) list = list.filter((r) => r.q.sellerName === owner)
    if (s) {
      list = list.filter((r) =>
        [r.q.number, r.q.customer?.name, r.q.customer?.company, r.q.customer?.phone, r.lead?.reference, ...(r.q.lines || []).map((l) => l.description)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(s)),
      )
    }
    const due = (r) => (r.fu.due == null ? Infinity : r.fu.due)
    // Newest first: when it was made, then its issue date, then its number.
    const newer = (a, b) => new Date(b.q.createdAt || b.q.issueDate) - new Date(a.q.createdAt || a.q.issueDate) || String(b.q.number || "").localeCompare(String(a.q.number || ""))
    const sorters = {
      follow: (a, b) => due(a) - due(b) || newer(a, b),
      newest: newer,
      amount: (a, b) => b.total - a.total,
    }
    return list.sort(sorters[sortBy])
  }, [rows, views, view, amount, query, status, owner, sortBy])

  useEffect(() => setPage(1), [view, query, status, owner, amount, sortBy, pageSize])
  useEffect(() => setSelected(new Set()), [view, query, status, owner, amount])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = Math.min(page, pageCount)
  const shown = filtered.slice((cur - 1) * pageSize, cur * pageSize)

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", rows: shown }]
    if (groupBy === "status") return QUOTATION_STATUS.map((s) => ({ key: s.id, label: s.label, tone: QUOTE_TONE[s.id], rows: shown.filter((r) => r.st === s.id) })).filter((g) => g.rows.length)
    return QUOTE_GROUPS.map((g) => ({ ...g, rows: shown.filter((r) => r.fu.group === g.key) })).filter((g) => g.rows.length)
  }, [shown, groupBy])

  const flat = groups.flatMap((g) => g.rows)
  const active = flat.find((r) => r.id === activeId) || null
  const move = (d) => {
    if (!flat.length) return
    const i = flat.findIndex((r) => r.id === activeId)
    const next = flat[Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + d))]
    setActiveId(next.id)
    document.getElementById(`quote-${next.id}`)?.scrollIntoView({ block: "nearest" })
  }

  const primary = async (r) => {
    if (r.fu.action === "send" || r.fu.action === "remind") return onSend(r.q)
    if (r.fu.action === "invoice") return convert.ask(r.q)
    if (r.fu.action === "revise") return onOpen(duplicateDraft(r.q))
  }

  useListKeys(
    {
      j: () => move(1),
      k: () => move(-1),
      Enter: () => active && onOpen(active.q),
      p: () => active && onPreview(active.q),
      s: () => active && onSend(active.q),
      w: () => active && startWhatsAppShare(active.q, settingsOf(active.q.companyId)),
      i: () => active && active.st === "accepted" && convert.ask(active.q),
      "/": () => searchRef.current?.focus(),
    },
    [flat, activeId, active],
  )

  const menuFor = (r) => {
    const q = r.q
    return [
      {
        title: "Share",
        items: [
          { icon: Eye, label: "Preview", key: "P", onSelect: () => onPreview(q) },
          { icon: Mail, label: r.st === "draft" ? "Send by email" : "Send reminder by email", key: "E", disabled: r.st === "invoiced", onSelect: () => sendQuotation(q, settingsOf(q.companyId)) },
          { icon: MessageCircle, label: r.st === "draft" ? "Send on WhatsApp" : "Remind on WhatsApp", key: "W", tone: "green", onSelect: () => startWhatsAppShare(q, settingsOf(q.companyId)) },
          { icon: Download, label: "Download PDF", key: "D", onSelect: () => downloadPdf(q, settingsOf(q.companyId)) },
        ],
      },
      {
        title: "Update",
        items: [
          { icon: RefreshCw, label: "Revise as a new draft", key: "V", onSelect: () => onOpen(duplicateDraft(q)) },
          { icon: Calendar, label: "Extend validity", hint: "+15 days", key: "X", disabled: !["draft", "sent", "expired"].includes(r.st), onSelect: () => extendValidity(q, 15) },
          { icon: CheckCircle2, label: "Mark accepted", key: "A", disabled: !["draft", "sent", "expired"].includes(r.st), onSelect: () => setQuoteStatus(q, "accepted").then(() => toast.success("Marked accepted")) },
          ...(r.st === "accepted" ? [{ icon: FileCheck2, label: "Convert to invoice", key: "I", onSelect: () => convert.ask(q) }] : []),
          { icon: Copy, label: "Duplicate", key: "⇧D", onSelect: () => onOpen(duplicateDraft(q)) },
        ],
      },
      { items: [{ icon: AlertTriangle, label: "Mark as lost", key: "L", danger: true, disabled: ["rejected", "invoiced"].includes(r.st), onSelect: () => setLostFor(q) }] },
    ]
  }

  const bulkSend = async () => {
    const list = rows.filter((r) => selected.has(r.id) && ["draft", "sent", "expired"].includes(r.st))
    let ok = 0
    for (const r of list) if (await sendQuotation(r.q, settingsOf(r.q.companyId))) ok++
    toast.success(`${ok} of ${list.length} sent by email`)
    setSelected(new Set())
  }

  const handleExport = () =>
    exportCsv(
      `ortex-quotations-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (r) => r.q.number },
        { header: "Date", value: (r) => formatDate(r.q.issueDate) },
        { header: "Customer", value: (r) => r.q.customer?.company || r.q.customer?.name },
        { header: "Contact", value: (r) => r.q.customer?.name },
        { header: "Status", value: (r) => r.st },
        { header: "Taxable", value: (r) => r.q.totals?.taxable },
        { header: "Grand total", value: (r) => r.q.totals?.grandTotal },
        { header: "Valid until", value: (r) => formatDate(r.q.validUntil) },
        { header: "Seller", value: (r) => r.q.sellerName },
        { header: "Lead", value: (r) => r.lead?.reference },
      ],
      filtered,
    )

  const open = rows.filter((r) => r.open)
  const ninety = rows.filter((r) => now - new Date(r.q.issueDate) <= 90 * DAY && ["accepted", "invoiced", "rejected", "expired"].includes(r.st))
  const winRate = ninety.length ? Math.round((ninety.filter((r) => ["accepted", "invoiced"].includes(r.st)).length / ninety.length) * 100) : null
  const summary = [`${compact(open.reduce((s, r) => s + r.total, 0))} open across ${open.length} quotation${open.length === 1 ? "" : "s"}`, winRate != null && `${winRate}% win rate over 90 days`].filter(Boolean).join(" · ")
  const allOn = shown.length > 0 && shown.every((r) => selected.has(r.id))

  return (
    <div className="space-y-4 pb-8">
      <ListHeader title="Quotations" summary={summary}>
        <Button variant="outline" onClick={handleExport} disabled={!filtered.length}>
          <ExportFile className="h-4 w-4" /> Export
        </Button>
        <Button variant="outline" onClick={() => navigate("/crm")} title="Start a quotation from a lead">
          <Inbox className="h-4 w-4" /> From a lead
        </Button>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" /> New quotation
        </Button>
      </ListHeader>

      <SmartViews views={views.filter((v) => v.key !== "all")} value={view} onChange={(v) => setView(v === view ? "all" : v)} />

      <div id="quotes-table" className="squircle scroll-mt-4 overflow-hidden rounded-card bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <ListSearch inputRef={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, customer, item" />
          <ToolButton count={(owner ? 1 : 0) + (amount !== "any" ? 1 : 0)} onClick={(e) => setFilterMenu(e.currentTarget)}>
            Filters
          </ToolButton>
          <SelectPill label="Status" value={view === "all" ? status : "view"} options={view === "all" ? STATUS_FILTER : [{ value: "view", label: views.find((v) => v.key === view)?.label.toLowerCase() }, ...STATUS_FILTER]} onChange={(v) => (setView("all"), setStatus(v))} />
          <SelectPill label="Owner" value={owner} options={[{ value: "", label: "anyone" }, ...owners.map((o) => ({ value: o, label: firstName(o) }))]} onChange={setOwner} />
          <SelectPill label="Amount" value={amount} options={AMOUNT} onChange={setAmount} />
          <div className="ml-auto flex items-center gap-2">
            <InlineSelect label="Group" value={groupBy} onChange={setGroupBy} options={GROUP_BY} />
            <InlineSelect label="Sort" value={sortBy} onChange={setSortBy} options={SORT_BY} />
          </div>
        </div>

        {loading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState icon={FileText} title="No quotations yet" description="Create one from scratch, or turn a lead into one." action={<Button onClick={onNew}><Plus className="h-4 w-4" /> New quotation</Button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="Nothing here" description={view === "needs" ? "No drafts, overdue follow-ups or acceptances to bill. Nice." : "Try another view, or clear the filters."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] table-fixed text-left">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 138 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 128 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 124 }} />
                <col style={{ width: 172 }} />
              </colgroup>
              <thead className="v2-head">
                <tr>
                  <th style={{ paddingLeft: 16 }}>
                    <Check checked={allOn} label="Select all" onChange={(on) => setSelected(on ? new Set(shown.map((r) => r.id)) : new Set())} />
                  </th>
                  <th>Quotation</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                  <th>Validity</th>
                  <th>Follow-up</th>
                  <th className="text-right" style={{ paddingRight: 16 }}>Quick actions</th>
                </tr>
              </thead>
              <tbody className="v2-body">
                {groups.map((g) => (
                  <Group key={g.key} g={g} show={groupBy !== "none"}>
                    {g.rows.map((r) => (
                      <QuoteRow
                        key={r.id}
                        r={r}
                        checked={selected.has(r.id)}
                        onCheck={(on) =>
                          setSelected((s) => {
                            const n = new Set(s)
                            if (on) n.add(r.id)
                            else n.delete(r.id)
                            return n
                          })
                        }
                        active={activeId === r.id}
                        menuOpen={menu?.id === r.id}
                        onOpen={() => onOpen({ ...r.q })}
                        onPrimary={() => primary(r)}
                        onWhatsApp={() => startWhatsAppShare(r.q, settingsOf(r.q.companyId))}
                        onMenu={(anchor) => (setActiveId(r.id), setMenu({ id: r.id, anchor }))}
                      />
                    ))}
                  </Group>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs">
            <span className="font-semibold text-foreground">
              {selected.size} selected · {rupees(rows.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.total, 0))}
            </span>
            <Button variant="outline" size="sm" onClick={bulkSend}>
              <Send className="h-3.5 w-3.5" /> Send by email
            </Button>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          filtered.length > 0 && (
            <Pager
              page={cur}
              pageSize={pageSize}
              total={filtered.length}
              noun={filtered.length === 1 ? "quotation" : "quotations"}
              onPage={(p) => (setPage(p), document.getElementById("quotes-table")?.scrollIntoView({ block: "start", behavior: "smooth" }))}
              onPageSize={setPageSize}
              shortcuts={[["J / K", "Move down / up"], ["Enter", "Open"], ["P", "Preview"], ["S", "Send or remind"], ["W", "WhatsApp"], ["I", "Convert to invoice"], ["/", "Search"]]}
            />
          )
        )}
      </div>

      <ActionMenu open={!!menu} anchor={menu?.anchor} onClose={() => setMenu(null)} sections={menu ? menuFor(rows.find((r) => r.id === menu.id)) : []} />
      <ActionMenu
        open={!!filterMenu}
        anchor={filterMenu}
        onClose={() => setFilterMenu(null)}
        width={220}
        sections={[
          { title: "Owner", items: [{ value: "", label: "Anyone" }, ...owners.map((o) => ({ value: o, label: o }))].map((o) => ({ icon: null, label: o.label, checked: owner === o.value, onSelect: () => setOwner(o.value) })) },
          { title: "Amount", items: AMOUNT.map((a) => ({ icon: null, label: a.label[0].toUpperCase() + a.label.slice(1), checked: amount === a.value, onSelect: () => setAmount(a.value) })) },
        ]}
      />
      {convert.element}
      <Modal open={!!lostFor} onClose={() => setLostFor(null)} title="Why was this quotation lost?" width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((reason) => (
            <Chip
              key={reason}
              onClick={async () => {
                await setQuoteStatus(lostFor, "rejected", { lostReason: reason })
                toast.success("Marked as lost")
                setLostFor(null)
              }}
            >
              {reason}
            </Chip>
          ))}
        </div>
      </Modal>
    </div>
  )
}

function Group({ g, show, children }) {
  return (
    <>
      {show && <GroupRow tone={g.tone} label={g.label} count={g.rows.length} hint={g.hint} colSpan={COLS} />}
      {children}
    </>
  )
}

// "Status: open ⌄": an outline pill wrapping a native select.
function SelectPill({ label, value, options, onChange }) {
  return (
    <label className="squircle relative inline-flex h-[34px] flex-none items-center gap-1 rounded-[10px] border border-line bg-card px-2.5 text-[13px] text-muted-foreground hover:bg-muted">
      {label}:<span className="font-medium text-foreground">{options.find((o) => o.value === value)?.label}</span>
      <span className="text-[10px]">▾</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

function statusLine(r) {
  const q = r.q
  switch (r.st) {
    case "draft":
      return "Not sent yet"
    case "sent": {
      const sends = (q.sendLog || []).length
      return q.sentAt ? `Sent ${dm(q.sentAt)}${sends > 1 ? ` · ${sends}×` : ""}` : `Issued ${dm(q.issueDate)}`
    }
    case "accepted":
      return q.statusAt?.accepted ? `Accepted ${dm(q.statusAt.accepted)}` : "Accepted"
    case "invoiced":
      return r.inv?.number || "Invoiced"
    case "rejected":
      return q.lostReason ? `Lost: ${q.lostReason.toLowerCase()}` : "Lost"
    case "expired":
      return q.validUntil ? `Lapsed ${dm(q.validUntil)}` : "Lapsed"
    default:
      return ""
  }
}

function QuoteRow({ r, checked, onCheck, active, menuOpen, onOpen, onPrimary, onWhatsApp, onMenu }) {
  const q = r.q
  const label = QUOTATION_STATUS.find((s) => s.id === r.st)?.label || r.st
  const days = Number(q.validityDays) || 15
  const pct = r.left == null ? 0 : Math.max(0, Math.min(100, (r.left / days) * 100))
  const action = { send: ["Send", true], remind: ["Remind", false], invoice: ["Invoice", false], revise: ["Revise", false] }[r.fu.action]
  return (
    <tr id={`quote-${r.id}`} className="v2-row" data-selected={checked} aria-current={active || undefined} onClick={onOpen}>
      <td className="relative" style={{ paddingLeft: 16 }} onClick={(e) => e.stopPropagation()}>
        <CursorBar on={active} />
        <Check checked={checked} onChange={onCheck} label={`Select ${q.number}`} />
      </td>
      <td>
        <button type="button" onClick={(e) => (e.stopPropagation(), onOpen())} className="block max-w-full truncate font-semibold text-foreground tabular hover:underline">
          {q.number || "Draft"}
        </button>
        <div className="mt-px truncate text-xs text-muted-foreground">
          <CompanyChip companyId={q.companyId} className="mr-1" />
          {r.st === "draft" ? "Draft" : dm(q.issueDate)}
          {r.lead?.reference ? ` · from ${r.lead.reference}` : ""}
        </div>
      </td>
      <td>
        <div className="flex min-w-0 items-center gap-2.5">
          <Initials name={r.customer} size={28} />
          <div className="min-w-0">
            <div className={cn("truncate font-semibold", r.customer ? "text-foreground" : "text-muted-foreground")}>{r.customer || "No customer"}</div>
            <div className="truncate text-xs text-muted-foreground">{[r.contact, r.place].filter(Boolean).join(" · ") || "No contact details"}</div>
          </div>
        </div>
      </td>
      <td>
        <div className={cn("truncate font-medium", r.firstItem ? "text-foreground" : "text-muted-foreground")} title={r.firstItem}>{r.firstItem || "No items"}</div>
        <div className="mt-px truncate text-xs text-muted-foreground">{r.itemsSub}</div>
      </td>
      <td className="text-right">
        <div className="font-semibold text-foreground tabular">{rupees(r.total)}</div>
        <div className="mt-[3px] text-[11px] text-muted-foreground">incl. GST</div>
      </td>
      <td>
        <StatusDot tone={QUOTE_TONE[r.st]}>{label}</StatusDot>
        <div className="mt-0.5 truncate pl-[14px] text-xs text-muted-foreground" title={statusLine(r)}>{statusLine(r)}</div>
      </td>
      <td>
        {["draft", "sent"].includes(r.st) && r.left != null ? (
          <>
            <div className={cn("text-xs font-medium", r.left <= 2 ? "text-warning-text" : "text-foreground")}>{r.st === "draft" ? `${days} days` : r.left === 0 ? "Ends today" : `${r.left} day${r.left === 1 ? "" : "s"} left`}</div>
            <Track pct={r.st === "draft" ? 100 : pct} tone={r.left <= 2 ? "amber" : "blue"} className="mt-1.5 w-[80px]" />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{r.st === "accepted" ? "Accepted" : "Closed"}</span>
        )}
      </td>
      <td>
        {r.fu.label ? (
          <>
            <div className={cn("truncate text-xs font-semibold", r.fu.overdue ? "text-destructive-text" : r.fu.group === "needs" ? "text-warning-text" : "text-foreground")}>{r.fu.label}</div>
            <div className="mt-px truncate text-xs text-muted-foreground">{q.sellerName || "No owner"}</div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{q.sellerName || ""}</span>
        )}
      </td>
      <td style={{ paddingRight: 16 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          {action && (
            <Button size="sm" variant={action[1] ? "primary" : "outline"} className="flex-none" onClick={onPrimary}>
              {r.fu.action === "invoice" ? <FileCheck2 className="h-3.5 w-3.5" /> : r.fu.action === "revise" ? <RefreshCw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
              {action[0]}
            </Button>
          )}
          <RowAction icon={MessageCircle} label="WhatsApp (W)" tone="green" onClick={onWhatsApp} />
          <RowAction icon={MoreHorizontal} label="More actions" active={menuOpen} onClick={(e) => onMenu(e.currentTarget)} />
        </div>
      </td>
    </tr>
  )
}
