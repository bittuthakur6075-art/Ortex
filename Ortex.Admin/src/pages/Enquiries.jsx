import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Inbox, Search, Plus, PhoneOutgoing, MessageCircle, MoreHorizontal, ImportFile, ExportFile, Mic, UserCheck, RefreshCw, Trash2 } from "../components/ui/Icons"
import { useCollection } from "../hooks/useCollection"
import { useProfile } from "../hooks/useProfile"
import { repo } from "../data/store/repository"
import { ENQUIRY_STATUS, PRODUCT_CATEGORIES, newEnquiry } from "../data/domain/schema"
import { isAdmin } from "../lib/roles"
import { formatDateTime } from "../lib/format"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import { LEAD_GROUPS, dueLabel, rupees } from "../lib/salesWork"
import EnquiryImport from "../components/editors/EnquiryImport"
import { Button, Drawer, EmptyState, Field, Input, PageLoader, Select } from "../components/ui/Ui"
import {
  ListHeader, SmartViews, ListSearch, ToolButton, FilterChip, InlineSelect, Check, CursorBar, GroupRow, StatusDot, Tag, Initials, RowAction, ActionMenu, Pager, useListKeys,
} from "../components/sales/ListParts"
import { prettyPhone } from "./voice-leads/helpers"
import { CHANNELS, channelMeta, STATUS_TONE, buildLead, leadTags } from "./leads/model"
import { useLeadActions, useStaffNames, telHref, waHref, mailHref, firstName, contactOf } from "./leads/actions"
import { callContact } from "../components/sales/ContactCard"
import LeadPreview from "./leads/LeadPreview"

const COLS = 10

const GROUP_BY = [
  { value: "none", label: "None" },
  { value: "due", label: "Due" },
  { value: "status", label: "Status" },
]
const SORT_BY = [
  { value: "newest", label: "Newest" },
  { value: "next", label: "Next step" },
  { value: "value", label: "Value" },
]

const monthKey = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${d.getMonth()}`
}

// Leads (Figma "V2 · Leads · List"): every enquiry, from the website, Anu's
// calls, IndiaMART, WhatsApp and imports, in one table grouped by when the next
// step is due. A row click (or Enter) opens the lead's page; P opens the quick
// preview. The view, search, filters and page live in the URL, so Back from a
// lead returns to the same list.
export default function Enquiries() {
  const { items, loading } = useCollection("enquiries")
  const { items: products } = useCollection("products")
  const { items: quotations } = useCollection("quotations")
  const profile = useProfile()
  const staff = useStaffNames(profile)
  const actions = useLeadActions({ products, staff, me: profile?.name || "" })
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const view = params.get("view") || "open"
  const query = params.get("q") || ""
  const chParam = params.get("ch") || ""
  const channels = useMemo(() => chParam.split(",").filter(Boolean), [chParam])
  const owner = params.get("owner") || "" // "" | "me" | "none"
  const page = Math.max(1, Number(params.get("page")) || 1)
  // A change to what the list shows starts again at page 1 with nothing ticked.
  const setUrl = (changes) => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p)
        for (const [k, v] of Object.entries(changes)) {
          if (v) n.set(k, v)
          else n.delete(k)
        }
        if (!("page" in changes)) n.delete("page")
        return n
      },
      { replace: true },
    )
    if (!("page" in changes)) setSelected(new Set())
  }
  const setView = (v) => setUrl({ view: v === "open" ? "" : v })
  const setChannels = (fn) => setUrl({ ch: fn(channels).join(",") })
  const setOwner = (fn) => setUrl({ owner: typeof fn === "function" ? fn(owner) : fn })
  const setPage = (p) => setUrl({ page: p > 1 ? String(p) : "" })
  const [groupBy, setGroupBy] = useState("none")
  const [sortBy, setSortBy] = useState("newest")
  const [creating, setCreating] = useState(false)
  const [pageSize, setPageSize] = useState(() => {
    try {
      return Number(localStorage.getItem("ortex.leads.pageSize")) || 25
    } catch {
      return 25
    }
  })
  const [selected, setSelected] = useState(() => new Set())
  const [activeId, setActiveId] = useState(null)
  const [previewId, setPreviewId] = useState(null)
  const [menu, setMenu] = useState(null) // { id, anchor }
  const [filterMenu, setFilterMenu] = useState(null)
  const [importing, setImporting] = useState(false)
  const searchRef = useRef(null)

  // Due labels ("Overdue 5 hours") move with the clock, once a minute.
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  const me = profile?.name || ""

  const leads = useMemo(() => items.map((e) => buildLead(e, { products, quotations, now })), [items, products, quotations, now])

  // ---- smart views ----
  const views = useMemo(() => {
    const open = leads.filter((l) => l.open)
    const due = open.filter((l) => l.group === "overdue" || l.group === "today")
    const quotes = open.filter((l) => l.flags.quote && l.e.status !== "quoted")
    const anu = open.filter((l) => l.channel === "anu")
    const support = open.filter((l) => l.flags.support)
    const thisMonth = monthKey(now)
    const received = leads.filter((l) => monthKey(l.e.createdAt) === thisMonth)
    const won = leads.filter((l) => l.e.status === "won" && monthKey(l.e.updatedAt || l.e.createdAt) === thisMonth)
    const wonValue = won.reduce((s, l) => s + l.value, 0)
    const month = new Date(now).toLocaleDateString("en-IN", { month: "short" })
    const pct = received.length ? Math.round((won.length / received.length) * 100) : 0
    return [
      { key: "open", label: "All open", value: open.length, sub: `${compact(open.reduce((s, l) => s + l.value, 0))} pipeline`, match: (l) => l.open },
      { key: "today", label: "Needs you today", tone: "rose", alert: due.length > 0, value: due.length, sub: `${due.filter((l) => l.group === "overdue").length} overdue`, match: (l) => l.open && (l.group === "overdue" || l.group === "today") },
      { key: "quotes", label: "Quote requests", tone: "blue", value: quotes.length, sub: "not yet quoted", match: (l) => l.open && l.flags.quote && l.e.status !== "quoted" },
      { key: "anu", label: "Anu calls", tone: "violet", value: anu.length, sub: `${anu.filter((l) => l.e.status === "new").length} to call back`, match: (l) => l.open && l.channel === "anu" },
      { key: "support", label: "Support", tone: "amber", value: support.length, sub: "route to accounts", match: (l) => l.open && l.flags.support },
      { key: "won", label: `Won · ${month}`, tone: "emerald", value: won.length, sub: `${compact(wonValue)} · ${pct}%`, match: (l) => l.e.status === "won" && monthKey(l.e.updatedAt || l.e.createdAt) === thisMonth },
    ]
  }, [leads, now])

  const filtered = useMemo(() => {
    const match = views.find((v) => v.key === view)?.match || (() => true)
    const q = query.trim().toLowerCase()
    let rows = leads.filter(match)
    if (channels.length) rows = rows.filter((l) => channels.includes(l.channel))
    if (owner === "me") rows = rows.filter((l) => l.e.owner && l.e.owner === me)
    if (owner === "none") rows = rows.filter((l) => !l.e.owner)
    if (q) {
      rows = rows.filter((l) =>
        [l.e.reference, l.e.customer?.name, l.e.customer?.company, l.e.customer?.email, l.e.customer?.phone, l.e.productInterest, l.e.message, l.e.source, l.asked]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    }
    const due = (l) => (l.step ? l.step.due : Infinity)
    const sorters = {
      next: (a, b) => due(a) - due(b) || new Date(b.e.createdAt) - new Date(a.e.createdAt),
      newest: (a, b) => new Date(b.e.createdAt) - new Date(a.e.createdAt),
      value: (a, b) => b.value - a.value,
    }
    return [...rows].sort(sorters[sortBy])
  }, [leads, views, view, query, channels, owner, me, sortBy])

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize)

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", rows: shown }]
    if (groupBy === "status") {
      return ENQUIRY_STATUS.map((s) => ({ key: s.id, label: s.label, tone: STATUS_TONE[s.id], rows: shown.filter((l) => (l.e.status || "new") === s.id) })).filter((g) => g.rows.length)
    }
    return LEAD_GROUPS.map((g) => ({ ...g, rows: shown.filter((l) => l.group === g.key) })).filter((g) => g.rows.length)
  }, [shown, groupBy])

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const byId = (id) => leads.find((l) => l.id === id) || null
  const preview = previewId ? byId(previewId) : null
  // The lead page walks this list's order with its "Next lead" arrow.
  const linkState = useMemo(() => ({ ids: filtered.map((l) => l.id) }), [filtered])
  const openLead = (id) => navigate(`/enquiries/${id}`, { state: linkState })

  // A link from elsewhere (the Dashboard, a notification) may name one lead.
  useEffect(() => {
    const id = params.get("lead")
    if (id && items.length) {
      setPreviewId(id)
      setActiveId(id)
      params.delete("lead")
      setParams(params, { replace: true })
    }
  }, [params, setParams, items.length])

  const move = (delta) => {
    if (!flat.length) return
    const i = flat.findIndex((l) => l.id === activeId)
    const next = flat[Math.max(0, Math.min(flat.length - 1, i < 0 ? 0 : i + delta))]
    setActiveId(next.id)
    if (previewId) setPreviewId(next.id)
    document.getElementById(`lead-${next.id}`)?.scrollIntoView({ block: "nearest" })
  }
  const active = activeId ? byId(activeId) : null

  useListKeys(
    {
      j: () => move(1),
      k: () => move(-1),
      Enter: () => active && openLead(active.id),
      c: () => active && callContact({ currentTarget: document.querySelector(`#lead-${active.id} [data-call] button`) }, contactOf(active.e)),
      w: () => active && waHref(active.e.customer?.phone) && window.open(waHref(active.e.customer.phone), "_blank", "noopener"),
      e: () => active?.e.customer?.email && (window.location.href = mailHref(active.e.customer.email)),
      q: () => active && !active.quote && actions.quote({ ...active.e, rfqItems: active.items }),
      r: () => active?.quote && actions.openQuote(active.quote),
      p: () => active && setPreviewId((id) => (id === active.id ? null : active.id)),
      "/": () => searchRef.current?.focus(),
    },
    [flat, activeId, previewId, active],
  )

  const toggle = (id, on) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })
  const allOn = shown.length > 0 && shown.every((l) => selected.has(l.id))

  const picked = () => items.filter((e) => selected.has(e.id))
  const assignPicked = async (name) => {
    const rows = picked()
    try {
      await Promise.all(rows.map((e) => repo.update("enquiries", e.id, { owner: name })))
      toast.success(`${name ? `Assigned to ${firstName(name)}` : "Unassigned"} · ${rows.length} lead${rows.length === 1 ? "" : "s"}`)
      setSelected(new Set())
    } catch (err) {
      toast.error(err?.message || "Could not update every lead")
    }
  }
  // Won and lost leads are closed; "Mark contacted" leaves them alone.
  const markContacted = async () => {
    const rows = picked().filter((e) => !["won", "lost"].includes(e.status))
    if (!rows.length) return toast.message("Every selected lead is already won or lost")
    if (await actions.setStatus(rows[0], "contacted", rows)) setSelected(new Set())
  }

  const handleExport = () =>
    exportCsv(
      `ortex-leads-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Reference", value: (l) => l.e.reference },
        { header: "Date", value: (l) => formatDateTime(l.e.createdAt) },
        { header: "Name", value: (l) => l.e.customer?.name },
        { header: "Company", value: (l) => l.e.customer?.company },
        { header: "Email", value: (l) => l.e.customer?.email },
        { header: "Phone", value: (l) => l.e.customer?.phone },
        { header: "Alternate mobile", value: (l) => l.e.altPhone },
        { header: "City", value: (l) => l.e.customer?.city },
        { header: "Source", value: (l) => l.e.source },
        { header: "Interest", value: (l) => l.e.productInterest },
        { header: "Quantity", value: (l) => l.e.quantity },
        { header: "Rate", value: (l) => l.e.rate },
        { header: "Status", value: (l) => l.e.status },
        { header: "Owner", value: (l) => l.e.owner },
        { header: "Next step", value: (l) => l.step?.label },
        { header: "Message", value: (l) => l.e.message },
      ],
      filtered,
    )

  const open = leads.filter((l) => l.open)
  const overdueCount = open.filter((l) => l.group === "overdue").length
  const unassigned = open.filter((l) => !l.e.owner).length
  const summary = [`${open.length.toLocaleString("en-IN")} open`, `${compact(open.reduce((s, l) => s + l.value, 0))} in play`, overdueCount && `${overdueCount} overdue`, unassigned && `${unassigned} unassigned`].filter(Boolean).join(" · ")
  const filterCount = channels.length + (owner ? 1 : 0)

  const filterSections = [
    {
      title: "Channel",
      items: CHANNELS.map((c) => ({
        icon: c.icon,
        label: c.label,
        checked: channels.includes(c.key),
        keepOpen: true,
        onSelect: () => setChannels((cs) => (cs.includes(c.key) ? cs.filter((k) => k !== c.key) : [...cs, c.key])),
      })),
    },
    {
      title: "Owner",
      items: [
        { icon: UserCheck, label: "Me", checked: owner === "me", keepOpen: true, onSelect: () => setOwner((o) => (o === "me" ? "" : "me")) },
        { icon: UserCheck, label: "Unassigned", checked: owner === "none", keepOpen: true, onSelect: () => setOwner((o) => (o === "none" ? "" : "none")) },
      ],
    },
  ]

  return (
    <div className="space-y-4 pb-8">
      <ListHeader title="Leads" summary={summary}>
        <Button variant="outline" onClick={() => setParams({ tab: "voice" })} title="Anu's calls, with recordings">
          <Mic className="h-4 w-4" /> Voice calls
        </Button>
        <Button variant="outline" onClick={() => setImporting(true)} title="Import enquiries from an Excel sheet">
          <ImportFile className="h-4 w-4" /> Import
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={!filtered.length} title="Download the leads in this view as CSV">
          <ExportFile className="h-4 w-4" /> Export
        </Button>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> New lead
        </Button>
      </ListHeader>

      <SmartViews views={views} value={view} onChange={setView} />

      <div id="leads-table" className="squircle scroll-mt-4 overflow-hidden rounded-card bg-card">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <ListSearch inputRef={searchRef} value={query} onChange={(e) => setUrl({ q: e.target.value })} placeholder="Search leads" aria-label="Search leads" />
          <ToolButton count={filterCount} onClick={(e) => setFilterMenu(e.currentTarget)}>
            Filters
          </ToolButton>
          {channels.length > 0 && <FilterChip onClear={() => setChannels(() => [])}>Channel: {channels.map((k) => channelMeta(k).label).join(", ")}</FilterChip>}
          {owner && <FilterChip onClear={() => setOwner("")}>Owner: {owner === "me" ? "Me" : "Unassigned"}</FilterChip>}
          <div className="ml-auto flex items-center gap-2">
            <InlineSelect label="Group" value={groupBy} onChange={setGroupBy} options={GROUP_BY} />
            <InlineSelect label="Sort" value={sortBy} onChange={(v) => (setSortBy(v), setPage(1))} options={SORT_BY} />
          </div>
        </div>

        {loading ? (
          <PageLoader />
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title="No leads yet" description="Website enquiries, Anu's calls and imported sheets appear here." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Search} title="No matches" description="Try another view, or clear the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1160px] table-fixed text-left">
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 176 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 84 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 112 }} />
              </colgroup>
              <thead className="v2-head">
                <tr>
                  <th style={{ paddingLeft: 16 }}>
                    <Check checked={allOn} label="Select all" onChange={(on) => setSelected(on ? new Set(shown.map((l) => l.id)) : new Set())} />
                  </th>
                  <th>Lead</th>
                  <th>Phone · Location</th>
                  <th>Product · Qty</th>
                  <th className="text-right">Value</th>
                  <th>Status</th>
                  <th>Next step</th>
                  <th>Owner</th>
                  <th>Received</th>
                  <th className="text-right" style={{ paddingRight: 16 }}>Quick actions</th>
                </tr>
              </thead>
              <tbody className="v2-body">
                {groups.map((g) => (
                  <GroupBlock key={g.key} g={g} showHeader={groupBy !== "none"}>
                    {g.rows.map((l) => (
                      <LeadRow
                        key={l.id}
                        l={l}
                        now={now}
                        checked={selected.has(l.id)}
                        onCheck={(on) => toggle(l.id, on)}
                        active={activeId === l.id || previewId === l.id}
                        menuOpen={menu?.id === l.id}
                        linkState={linkState}
                        onOpen={() => openLead(l.id)}
                        onAssign={(anchor) => actions.pickOwner(l.e, anchor)}
                        onMenu={(anchor) => (setActiveId(l.id), setMenu({ id: l.id, anchor }))}
                      />
                    ))}
                  </GroupBlock>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-xs">
            <span className="font-semibold text-foreground">{selected.size} selected</span>
            {me && <Button variant="outline" size="sm" onClick={() => assignPicked(me)}>Assign to me</Button>}
            <Button variant="outline" size="sm" onClick={(ev) => actions.pickOwner(null, ev.currentTarget, assignPicked)}>
              <UserCheck className="h-3.5 w-3.5" /> Assign to…
            </Button>
            <Button variant="outline" size="sm" onClick={markContacted}>Mark contacted</Button>
            <Button variant="outline" size="sm" onClick={(ev) => { const rows = picked(); if (rows.length) actions.pickStatus(rows[0], ev.currentTarget, rows) }}>
              <RefreshCw className="h-3.5 w-3.5" /> Change status
            </Button>
            {isAdmin(profile) && (
              <Button variant="dangerGhost" size="sm" onClick={() => actions.confirmDelete(picked(), () => setSelected(new Set()))}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )}
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        ) : (
          filtered.length > 0 && (
            <Pager
              page={Math.min(page, pageCount)}
              pageSize={pageSize}
              total={filtered.length}
              noun={filtered.length === 1 ? "lead" : "leads"}
              onPage={(p) => (setPage(p), document.getElementById("leads-table")?.scrollIntoView({ block: "start", behavior: "smooth" }))}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(1)
                try {
                  localStorage.setItem("ortex.leads.pageSize", String(n))
                } catch {
                  /* private window: the choice lasts this visit */
                }
              }}
              shortcuts={[["J / K", "Move down / up"], ["Enter", "Open the lead"], ["P", "Quick preview"], ["C", "Call"], ["W", "WhatsApp"], ["E", "Email"], ["Q", "Create quotation"], ["R", "Resend quotation"], ["/", "Search"]]}
            />
          )
        )}
      </div>

      <ActionMenu
        open={!!menu}
        anchor={menu?.anchor}
        onClose={() => setMenu(null)}
        sections={menu ? actions.menu(byId(menu.id), menu.anchor) : []}
      />
      <ActionMenu open={!!filterMenu} anchor={filterMenu} onClose={() => setFilterMenu(null)} sections={filterSections} width={220} />
      {actions.element}

      <LeadPreview
        lead={preview}
        now={now}
        products={products}
        quotations={quotations}
        staff={staff}
        actions={actions}
        linkState={linkState}
        position={preview ? `${flat.findIndex((l) => l.id === preview.id) + 1} of ${flat.length}` : ""}
        onMove={move}
        onClose={() => setPreviewId(null)}
      />
      <EnquiryImport open={importing} onClose={() => setImporting(false)} existing={items} staff={staff} me={me} />
      <NewLeadDrawer open={creating} onClose={() => setCreating(false)} me={me} onCreated={(id) => navigate(`/enquiries/${id}`)} />
    </div>
  )
}

// "New lead": a phone enquiry typed in by hand. Nothing is written until Save,
// so an abandoned form never leaves an empty lead behind.
function NewLeadDrawer({ open, onClose, me, onCreated }) {
  const blank = { name: "", phone: "", productInterest: "" }
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const dirty = Object.values(form).some((v) => v.trim())
  const close = () => (setForm(blank), onClose())

  const save = async () => {
    const name = form.name.trim()
    const phone = form.phone.trim()
    if (!name && !phone) return toast.error("Enter a name or a phone number")
    if (phone && phone.replace(/\D/g, "").length < 10) return toast.error("Enter the full 10-digit mobile number")
    setSaving(true)
    try {
      const base = newEnquiry()
      const row = await repo.create("enquiries", newEnquiry({ source: "Phone", owner: me, productInterest: form.productInterest, customer: { ...base.customer, name, phone } }))
      toast.success("Lead added")
      close()
      onCreated(row.id)
    } catch (err) {
      toast.error(err?.message || "Could not add the lead")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open={open}
      onClose={close}
      dirty={dirty}
      title="New lead"
      subtitle="A phone enquiry. Add the rest on the lead's page."
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Adding…" : "Add lead"}</Button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(ev) => (ev.preventDefault(), save())}>
        <Field label="Name">
          <Input autoFocus value={form.name} onChange={(ev) => set("name", ev.target.value)} placeholder="Who called" />
        </Field>
        <Field label="Phone">
          <Input type="tel" inputMode="tel" value={form.phone} onChange={(ev) => set("phone", ev.target.value)} placeholder="10-digit mobile" />
        </Field>
        <Field label="Product">
          <Select value={form.productInterest} onChange={(ev) => set("productInterest", ev.target.value)}>
            <option value="">Not known yet</option>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}

function GroupBlock({ g, showHeader, children }) {
  return (
    <>
      {showHeader && <GroupRow tone={g.tone} label={g.label} count={g.rows.length} hint={g.hint} colSpan={COLS} />}
      {children}
    </>
  )
}

function LeadRow({ l, now, checked, onCheck, active, menuOpen, linkState, onOpen, onAssign, onMenu }) {
  const e = l.e
  const c = e.customer || {}
  const ch = channelMeta(l.channel)
  const tags = leadTags(l)
  const status = ENQUIRY_STATUS.find((s) => s.id === (e.status || "new"))
  const received = new Date(e.createdAt || e.submittedAt || now)
  const days = Math.floor((now - received) / 86400000)
  return (
    <tr id={`lead-${l.id}`} className="v2-row" data-selected={checked} aria-current={active || undefined} onClick={onOpen}>
      <td className="relative" style={{ paddingLeft: 16 }} onClick={(ev) => ev.stopPropagation()}>
        <CursorBar on={active} />
        <Check checked={checked} onChange={onCheck} label={`Select ${c.name || "lead"}`} />
      </td>
      <td>
        <div className="flex min-w-0 items-center gap-2.5">
          <Initials name={l.name} badge={<ch.icon className="h-[11px] w-[11px] text-muted-foreground" />} />
          <div className="min-w-0">
            <div className="flex items-center gap-[5px]">
              <Link to={`/enquiries/${l.id}`} state={linkState} onClick={(ev) => ev.stopPropagation()} className={cn("truncate font-semibold hover:underline", l.name ? "text-foreground" : "text-muted-foreground")}>
                {l.name || "Unnamed caller"}
              </Link>
              {e.starred && <span className="flex-none text-xs text-warning" aria-label="Starred">★</span>}
            </div>
            <div className="truncate text-xs text-muted-foreground">{c.company || ch.label}</div>
          </div>
        </div>
      </td>
      <td>
        <div className="whitespace-nowrap font-medium text-foreground tabular">
          {c.phone ? (
            <button type="button" onClick={(ev) => callContact(ev, contactOf(e))} className="tabular hover:text-primary hover:underline">{prettyPhone(c.phone)}</button>
          ) : (
            <span className="font-normal text-subtle-foreground">No phone</span>
          )}
        </div>
        <div className="mt-px truncate text-xs text-muted-foreground">{l.location || "Location not given"}</div>
      </td>
      <td>
        <div className="truncate font-medium text-foreground" title={l.asked}>{l.asked}</div>
        <div className="mt-px flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs text-muted-foreground">{l.askedSub}</span>
          {tags.slice(0, 1).map((t) => (
            <Tag key={t.label} tone={t.tone}>{t.label}</Tag>
          ))}
        </div>
      </td>
      <td className="text-right">
        {l.value > 0 ? (
          <>
            <div className="font-semibold text-foreground tabular">{rupees(l.value)}</div>
            <div className="mt-[3px] whitespace-nowrap text-[11px] text-muted-foreground">{l.valueNote}</div>
          </>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>
      <td>
        <StatusDot tone={STATUS_TONE[e.status || "new"]}>{status?.label || e.status}</StatusDot>
      </td>
      <td>
        {l.step ? (
          <>
            <div className="truncate font-medium text-foreground">{l.step.label}</div>
            <div className={cn("mt-px truncate text-xs", l.step.overdue ? "font-semibold text-destructive-text" : l.step.today ? "font-semibold text-warning-text" : "text-muted-foreground")}>
              {dueLabel(l.step.due, now)}
            </div>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{e.status === "lost" && e.lostReason ? `Lost: ${e.lostReason}` : "Closed"}</span>
        )}
      </td>
      <td onClick={(ev) => ev.stopPropagation()}>
        {e.owner ? (
          <button type="button" onClick={(ev) => onAssign(ev.currentTarget)} className="flex min-w-0 items-center gap-1.5" title={`Owner: ${e.owner}`}>
            <Initials name={e.owner} size={22} />
            <span className="truncate text-xs font-medium text-muted-foreground">{firstName(e.owner)}</span>
          </button>
        ) : (
          <button type="button" onClick={(ev) => onAssign(ev.currentTarget)} className="text-xs font-medium text-primary hover:underline">
            + Assign
          </button>
        )}
      </td>
      <td className="whitespace-nowrap text-muted-foreground">
        <span title={received.toLocaleString("en-IN")}>{days < 1 ? "Today" : days === 1 ? "Yesterday" : days < 7 ? `${days}d ago` : received.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(received.getFullYear() !== new Date(now).getFullYear() && { year: "2-digit" }) })}</span>
      </td>
      <td style={{ paddingRight: 16 }} onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <span data-call className="contents">
            <RowAction icon={PhoneOutgoing} label="Call (C)" onClick={(ev) => callContact(ev, contactOf(e))} disabled={!telHref(c.phone)} />
          </span>
          <RowAction icon={MessageCircle} label="WhatsApp (W)" tone="green" href={waHref(c.phone)} external disabled={!waHref(c.phone)} />
          <RowAction icon={MoreHorizontal} label="More actions" active={menuOpen} onClick={(ev) => onMenu(ev.currentTarget)} />
        </div>
      </td>
    </tr>
  )
}

function compact(v) {
  const n = Number(v) || 0
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`
  if (n >= 1e3) return `₹${+(n / 1e3).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

