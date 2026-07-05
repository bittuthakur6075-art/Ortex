import { useState, useMemo, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Target,
  Plus,
  Search,
  LayoutGrid,
  List as ListIcon,
  Flame,
  Clock,
  TrendingUp,
  Trash2,
  FileText,
  CalendarClock,
  Phone,
  MessageCircle,
  Mail,
} from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection } from "../data/hooks"
import {
  computeLeadScore,
  weightedLeadValue,
  setLeadStage,
  addLeadActivity,
} from "../data/domain"
import { LEAD_STAGES, OPEN_LEAD_STAGES, ACTIVITY_TYPES, LEAD_SOURCES, LOST_REASONS, PRODUCT_CATEGORIES, newLead, stageProbability } from "../data/schema"
import { formatCurrency, formatDate, toDateInput, daysUntil, relativeTime, round2 } from "../lib/format"
import { cn } from "../lib/cn"
import PageHeader from "../components/PageHeader"
import { Button, Card, Input, Select, Textarea, Field, Badge, StatCard, StatusBadge, EmptyState, Avatar, Money, Chip, Drawer, Modal, PageLoader } from "../components/ui"

// Follow-up urgency from the nextFollowUp date.
function followState(lead) {
  if (!OPEN_LEAD_STAGES.includes(lead.stage) || !lead.nextFollowUp) return null
  const d = daysUntil(lead.nextFollowUp)
  if (d < 0) return { tone: "rose", label: "Overdue" }
  if (d === 0) return { tone: "amber", label: "Due today" }
  if (d <= 2) return { tone: "cyan", label: `In ${d}d` }
  return null
}

export default function Leads() {
  const { items, loading } = useCollection("leads")
  const location = useLocation()
  const navigate = useNavigate()
  const [view, setView] = useState("board")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [lostFor, setLostFor] = useState(null) // { id, stage:'lost' } pending reason

  // Arriving from an enquiry "Convert to lead" that created the lead.
  useEffect(() => {
    const id = location.state?.openLeadId
    if (id) {
      setSelected({ id })
      navigate(location.pathname, { replace: true })
    }
  }, [location, navigate])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((l) => [l.customer?.name, l.customer?.company, l.productInterest, l.owner].filter(Boolean).some((v) => v.toLowerCase().includes(q)))
  }, [items, query])

  const stats = useMemo(() => {
    const open = items.filter((l) => OPEN_LEAD_STAGES.includes(l.stage))
    const weighted = round2(open.reduce((s, l) => s + weightedLeadValue(l), 0))
    const raw = round2(open.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0))
    const overdue = open.filter((l) => l.nextFollowUp && daysUntil(l.nextFollowUp) < 0).length
    const today = open.filter((l) => l.nextFollowUp && daysUntil(l.nextFollowUp) === 0).length
    return { weighted, raw, overdue, today, openCount: open.length }
  }, [items])

  const active = selected === "new" ? "new" : selected ? items.find((l) => l.id === selected.id) || null : null

  const moveStage = async (leadId, stage) => {
    if (stage === "lost") {
      setLostFor({ id: leadId })
      return
    }
    await setLeadStage(leadId, stage)
  }

  const confirmLost = async (reason) => {
    await setLeadStage(lostFor.id, "lost", { lostReason: reason })
    setLostFor(null)
    toast.success("Marked lost")
  }

  if (loading) return <PageLoader />

  return (
    <div>
      <PageHeader title="Leads" subtitle="Sales pipeline — qualify, follow up and convert to quotes">
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button onClick={() => setView("board")} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium", view === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            <LayoutGrid className="h-4 w-4" /> Board
          </button>
          <button onClick={() => setView("list")} className={cn("flex items-center gap-1.5 px-3 py-2 text-sm font-medium", view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            <ListIcon className="h-4 w-4" /> List
          </button>
        </div>
        <Button size="sm" onClick={() => setSelected("new")}>
          <Plus className="h-4 w-4" /> New lead
        </Button>
      </PageHeader>

      {/* KPI strip */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={TrendingUp} label="Weighted pipeline" value={<Money value={stats.weighted} compact />} sub={`of ${formatCurrency(stats.raw)} raw`} accent="bg-primary/10 text-primary" />
        <StatCard icon={Target} label="Open leads" value={stats.openCount} accent="bg-violet-500/10 text-violet-500" />
        <StatCard icon={Clock} label="Follow-ups overdue" value={stats.overdue} accent="bg-rose-500/10 text-rose-500" />
        <StatCard icon={CalendarClock} label="Due today" value={stats.today} accent="bg-amber-500/10 text-amber-500" />
      </div>

      <div className="mb-4 relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search lead, company, owner…" className="pl-10" />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No leads yet"
          description="Convert an enquiry into a lead, or add one manually, to start working the pipeline."
          action={
            <Button onClick={() => setSelected("new")}>
              <Plus className="h-4 w-4" /> New lead
            </Button>
          }
        />
      ) : view === "board" ? (
        <Board leads={filtered} onOpen={(l) => setSelected(l)} onMove={moveStage} />
      ) : (
        <LeadList leads={filtered} onOpen={(l) => setSelected(l)} />
      )}

      <LeadDrawer lead={active} onClose={() => setSelected(null)} />

      <Modal open={!!lostFor} onClose={() => setLostFor(null)} title="Reason for losing this lead" width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Chip key={r} onClick={() => confirmLost(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </Modal>
    </div>
  )
}

/* ---------------- Board (Kanban with native drag-and-drop) --------------- */

function Board({ leads, onOpen, onMove }) {
  const [dragId, setDragId] = useState(null)
  const [overStage, setOverStage] = useState(null)

  const byStage = (stage) => leads.filter((l) => l.stage === stage)

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-3">
        {LEAD_STAGES.map((stage) => {
          const cards = byStage(stage.id)
          const value = round2(cards.reduce((s, l) => s + (Number(l.estimatedValue) || 0), 0))
          return (
            <div
              key={stage.id}
              onDragOver={(e) => {
                e.preventDefault()
                setOverStage(stage.id)
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => {
                if (dragId) onMove(dragId, stage.id)
                setDragId(null)
                setOverStage(null)
              }}
              className={cn("w-64 flex-none rounded-xl border p-2 transition-colors", overStage === stage.id ? "border-primary bg-primary/5" : "border-border bg-muted/20")}
            >
              <div className="mb-2 flex items-center justify-between px-2 pt-1">
                <StatusBadge list={LEAD_STAGES} status={stage.id} />
                <span className="text-xs text-muted-foreground">{cards.length}</span>
              </div>
              <div className="px-2 pb-2 text-[11px] text-muted-foreground">{formatCurrency(value)} · {stageProbability(stage.id)}%</div>
              <div className="space-y-2">
                {cards.map((l) => (
                  <LeadCard key={l.id} lead={l} onOpen={onOpen} onDragStart={() => setDragId(l.id)} dragging={dragId === l.id} />
                ))}
                {cards.length === 0 && <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">Drop here</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LeadCard({ lead, onOpen, onDragStart, dragging }) {
  const score = computeLeadScore(lead)
  const fu = followState(lead)
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={() => onOpen(lead)}
      className={cn("cursor-pointer rounded-lg border border-border bg-card p-3 transition-shadow hover:border-primary/40", dragging && "opacity-40")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{lead.customer?.company || lead.customer?.name || "Unnamed lead"}</div>
          <div className="truncate text-xs text-muted-foreground">{lead.customer?.name && lead.customer?.company ? lead.customer.name : lead.productInterest}</div>
        </div>
        {score >= 60 && <Flame className="h-4 w-4 flex-none text-orange-500" title={`Hot · score ${score}`} />}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">{formatCurrency(lead.estimatedValue)}</span>
        <span className="text-[11px] text-muted-foreground">Score {score}</span>
      </div>
      {fu && (
        <div className="mt-2">
          <Badge tone={fu.tone}>
            <Clock className="h-3 w-3" /> {fu.label}
          </Badge>
        </div>
      )}
    </div>
  )
}

/* ---------------- List view ---------------- */

function LeadList({ leads, onOpen }) {
  const sorted = [...leads].sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0))
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Stage</th>
              <th className="px-4 py-3 text-right font-medium">Value</th>
              <th className="px-4 py-3 text-right font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Follow-up</th>
              <th className="px-4 py-3 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((l) => {
              const fu = followState(l)
              return (
                <tr key={l.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => onOpen(l)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={l.customer?.company || l.customer?.name} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-foreground">{l.customer?.company || l.customer?.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{l.productInterest || "—"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge list={LEAD_STAGES} status={l.stage} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    <Money value={l.estimatedValue} />
                  </td>
                  <td className="px-4 py-3 text-right tabular text-muted-foreground">{computeLeadScore(l)}</td>
                  <td className="px-4 py-3">
                    {fu ? <Badge tone={fu.tone}>{fu.label}</Badge> : l.nextFollowUp ? <span className="text-xs text-muted-foreground">{formatDate(l.nextFollowUp)}</span> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.owner || "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/* ---------------- Lead drawer ---------------- */

function LeadDrawer({ lead, onClose }) {
  const navigate = useNavigate()
  const isNew = lead === "new"
  const open = lead !== null
  const [form, setForm] = useState(newLead())
  const [act, setAct] = useState({ type: "Call", summary: "", nextFollowUp: "" })

  useEffect(() => {
    if (!open) return
    setForm(isNew ? newLead() : { ...newLead(), ...lead, customer: { ...newLead().customer, ...lead.customer } })
    setAct({ type: "Call", summary: "", nextFollowUp: "" })
  }, [open, isNew, lead])

  if (!open) return null
  const score = computeLeadScore(form)
  const setC = (k, v) => setForm((f) => ({ ...f, customer: { ...f.customer, [k]: v } }))

  const patch = async (changes) => {
    setForm((f) => ({ ...f, ...changes }))
    if (!isNew) await repo.update("leads", lead.id, changes)
  }

  const saveNew = async () => {
    if (!form.customer.name.trim() && !form.customer.company.trim()) return toast.error("Enter a customer name or company")
    await repo.create("leads", { ...form, estimatedValue: round2(form.estimatedValue) })
    toast.success("Lead added")
    onClose()
  }

  const remove = async () => {
    if (window.confirm("Delete this lead?")) {
      await repo.remove("leads", lead.id)
      toast.success("Lead deleted")
      onClose()
    }
  }

  const logActivity = async () => {
    if (!act.summary.trim()) return toast.error("Add a note for the activity")
    await addLeadActivity(lead.id, {
      type: act.type,
      summary: act.summary,
      nextFollowUp: act.nextFollowUp ? new Date(act.nextFollowUp).toISOString() : undefined,
    })
    setAct({ type: "Call", summary: "", nextFollowUp: "" })
    toast.success("Activity logged")
  }

  const convert = () => {
    navigate("/quotations", { state: { fromLead: { ...form, id: lead?.id } } })
  }

  const phoneDigits = (form.customer.phone || "").replace(/\D/g, "")
  const wa = phoneDigits.length === 10 ? "91" + phoneDigits : phoneDigits
  const activities = [...(form.activities || [])].sort((a, b) => new Date(b.at) - new Date(a.at))

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-lg"
      title={
        <div className="flex items-center gap-2">
          <span>{isNew ? "New lead" : form.customer.company || form.customer.name || "Lead"}</span>
          {!isNew && score >= 60 && <Flame className="h-4 w-4 text-orange-500" />}
        </div>
      }
      subtitle={isNew ? "Add to the pipeline" : `Score ${score} · ${form.source}`}
      footer={
        isNew ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveNew}>
              Add lead
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" onClick={convert}>
              <FileText className="h-4 w-4" /> Convert to quotation
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {/* Quick actions */}
        {!isNew && (
          <div className="flex flex-wrap gap-2">
            {form.customer.email && (
              <a href={`mailto:${form.customer.email}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                <Mail className="h-4 w-4" /> Email
              </a>
            )}
            {phoneDigits && (
              <>
                <a href={`tel:${form.customer.phone}`} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </>
            )}
          </div>
        )}

        {/* Stage */}
        <Field label="Stage">
          <div className="flex flex-wrap gap-1.5">
            {LEAD_STAGES.map((s) => (
              <Chip
                key={s.id}
                active={form.stage === s.id}
                onClick={() => {
                  if (s.id === "lost") {
                    const reason = window.prompt(`Lost reason (${LOST_REASONS.join(", ")}):`, form.lostReason || "Price too high")
                    if (reason) patch({ stage: "lost", lostReason: reason })
                  } else patch({ stage: s.id, ...(s.id === "won" ? { nextFollowUp: null } : {}) })
                }}
              >
                {s.label} · {s.prob}%
              </Chip>
            ))}
          </div>
          {form.stage === "lost" && form.lostReason && <p className="mt-2 text-xs text-destructive">Lost: {form.lostReason}</p>}
        </Field>

        {/* Value + follow-up */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estimated value (₹)" hint={`Weighted ${formatCurrency(weightedLeadValue(form))}`}>
            <Input type="number" min="0" value={form.estimatedValue} onChange={(e) => setForm((f) => ({ ...f, estimatedValue: Number(e.target.value) }))} onBlur={() => !isNew && repo.update("leads", lead.id, { estimatedValue: round2(form.estimatedValue) })} />
          </Field>
          <Field label="Next follow-up">
            <Input type="date" value={form.nextFollowUp ? toDateInput(form.nextFollowUp) : ""} onChange={(e) => patch({ nextFollowUp: e.target.value ? new Date(e.target.value).toISOString() : null })} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Source">
            <Select value={form.source} onChange={(e) => patch({ source: e.target.value })}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} onBlur={() => !isNew && repo.update("leads", lead.id, { owner: form.owner })} placeholder="Salesperson" />
          </Field>
          <Field label="Product interest">
            <Select value={form.productInterest} onChange={(e) => patch({ productInterest: e.target.value })}>
              <option value="">—</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Est. quantity">
            <Input value={form.quantityEstimate} onChange={(e) => setForm((f) => ({ ...f, quantityEstimate: e.target.value }))} onBlur={() => !isNew && repo.update("leads", lead.id, { quantityEstimate: form.quantityEstimate })} placeholder="e.g. 500 pcs" />
          </Field>
        </div>

        {/* Customer */}
        <div className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-muted/20 p-4">
          <Field label="Contact">
            <Input value={form.customer.name} onChange={(e) => setC("name", e.target.value)} onBlur={() => !isNew && repo.update("leads", lead.id, { customer: form.customer })} />
          </Field>
          <Field label="Company">
            <Input value={form.customer.company} onChange={(e) => setC("company", e.target.value)} onBlur={() => !isNew && repo.update("leads", lead.id, { customer: form.customer })} />
          </Field>
          <Field label="Phone">
            <Input value={form.customer.phone} onChange={(e) => setC("phone", e.target.value)} onBlur={() => !isNew && repo.update("leads", lead.id, { customer: form.customer })} />
          </Field>
          <Field label="Email">
            <Input value={form.customer.email} onChange={(e) => setC("email", e.target.value)} onBlur={() => !isNew && repo.update("leads", lead.id, { customer: form.customer })} />
          </Field>
        </div>

        {/* Activity timeline */}
        {!isNew && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Activity</h3>
            <div className="rounded-xl border border-border p-3">
              <div className="flex gap-2">
                <Select value={act.type} onChange={(e) => setAct((a) => ({ ...a, type: e.target.value }))} className="w-32 flex-none">
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
                <Input value={act.summary} onChange={(e) => setAct((a) => ({ ...a, summary: e.target.value }))} placeholder="What happened / next step…" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Next follow-up:</span>
                <Input type="date" value={act.nextFollowUp} onChange={(e) => setAct((a) => ({ ...a, nextFollowUp: e.target.value }))} className="h-9 w-40 py-1.5 text-xs" />
                <Button size="sm" className="ml-auto" onClick={logActivity}>
                  Log
                </Button>
              </div>
            </div>

            {activities.length > 0 && (
              <div className="mt-3 space-y-3 border-l-2 border-border pl-4">
                {activities.map((a) => (
                  <div key={a.id} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" />
                    <div className="flex items-center gap-2">
                      <Badge tone="slate">{a.type}</Badge>
                      <span className="text-xs text-muted-foreground">{relativeTime(a.at)}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{a.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} onBlur={() => !isNew && repo.update("leads", lead.id, { notes: form.notes })} placeholder="Private notes…" />
        </Field>
      </div>
    </Drawer>
  )
}
