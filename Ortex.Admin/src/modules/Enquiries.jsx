import { useState, useMemo, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Inbox, Plus, Search, Star, Mail, Phone, MessageCircle, Trash2, Target, Download } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { convertEnquiryToLead } from "../data/domain"
import { useCollection } from "../data/hooks"
import { ENQUIRY_STATUS, LEAD_SOURCES, PRODUCT_CATEGORIES, newEnquiry } from "../data/schema"
import { relativeTime, formatDateTime } from "../lib/format"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"
import PageHeader from "../components/PageHeader"
import {
  Button,
  Card,
  Input,
  Select,
  Textarea,
  Field,
  StatusBadge,
  EmptyState,
  Avatar,
  Chip,
  Drawer,
  PageLoader,
} from "../components/ui"

export default function Enquiries() {
  const { items, loading } = useCollection("enquiries")
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    let rows = items
    if (statusFilter === "starred") rows = rows.filter((e) => e.starred)
    else if (statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter)
    const q = query.trim().toLowerCase()
    if (q) {
      rows = rows.filter((e) =>
        [e.customer?.name, e.customer?.company, e.customer?.email, e.productInterest, e.message, e.source]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(q)),
      )
    }
    return [...rows].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }, [items, query, statusFilter])

  const active = selected === "new" ? "new" : selected ? items.find((e) => e.id === selected.id) || null : null

  const handleExport = () => {
    exportCsv(
      `ortex-enquiries-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Date", value: (e) => formatDateTime(e.createdAt) },
        { header: "Name", value: (e) => e.customer?.name },
        { header: "Company", value: (e) => e.customer?.company },
        { header: "Email", value: (e) => e.customer?.email },
        { header: "Phone", value: (e) => e.customer?.phone },
        { header: "Source", value: (e) => e.source },
        { header: "Interest", value: (e) => e.productInterest },
        { header: "Status", value: (e) => e.status },
        { header: "Message", value: (e) => e.message },
      ],
      filtered,
    )
  }

  return (
    <div>
      <PageHeader title="Enquiries" subtitle={`${items.length} leads across all sources`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" onClick={() => setSelected("new")}>
          <Plus className="h-4 w-4" /> New enquiry
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, company, message…" className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </Chip>
          <Chip active={statusFilter === "starred"} onClick={() => setStatusFilter("starred")}>
            <Star className="h-3.5 w-3.5" /> Starred
          </Chip>
          {ENQUIRY_STATUS.map((s) => (
            <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState icon={Inbox} title="No enquiries yet" description="Leads captured from the website or added manually appear here." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((e) => (
            <Card
              key={e.id}
              onClick={() => setSelected(e)}
              className="cursor-pointer p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start gap-3">
                <Avatar name={e.customer?.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-foreground">{e.customer?.name || "Unknown"}</span>
                    {e.starred && <Star className="h-3.5 w-3.5 flex-none fill-amber-400 text-amber-400" />}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{e.customer?.company || e.customer?.email}</div>
                </div>
                <StatusBadge list={ENQUIRY_STATUS} status={e.status} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{e.message}</p>
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                <span className="truncate">{e.productInterest || "—"}</span>
                <span className="flex-none">{relativeTime(e.createdAt)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EnquiryDrawer enquiry={active} onClose={() => setSelected(null)} />
    </div>
  )
}

function EnquiryDrawer({ enquiry, onClose }) {
  const navigate = useNavigate()
  const isNew = enquiry === "new"
  const open = enquiry !== null
  const [form, setForm] = useState(newEnquiry())

  useEffect(() => {
    if (!open) return
    setForm(isNew ? newEnquiry() : { ...newEnquiry(), ...enquiry, customer: { ...newEnquiry().customer, ...enquiry.customer } })
  }, [open, isNew, enquiry])

  const setCustomer = (key, value) => setForm((f) => ({ ...f, customer: { ...f.customer, [key]: value } }))
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const patch = async (changes) => {
    const next = { ...form, ...changes }
    setForm(next)
    if (!isNew) await repo.update("enquiries", enquiry.id, changes)
  }

  const saveNew = async () => {
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    await repo.create("enquiries", form)
    toast.success("Enquiry added")
    onClose()
  }

  const remove = async () => {
    if (window.confirm("Delete this enquiry?")) {
      await repo.remove("enquiries", enquiry.id)
      toast.success("Enquiry deleted")
      onClose()
    }
  }

  const convert = async () => {
    const lead = await convertEnquiryToLead(enquiry.id)
    toast.success("Converted to lead")
    onClose()
    navigate("/leads", { state: { openLeadId: lead.id } })
  }

  const phoneDigits = (form.customer.phone || "").replace(/\D/g, "")
  const waNumber = phoneDigits.length === 10 ? "91" + phoneDigits : phoneDigits

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNew ? "New enquiry" : form.customer.name || "Enquiry"}
      subtitle={isNew ? "Add a lead manually" : `${form.source} · ${formatDateTime(enquiry?.createdAt)}`}
      footer={
        isNew ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveNew}>
              Add enquiry
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button size="sm" onClick={convert}>
              <Target className="h-4 w-4" /> Convert to lead
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-5">
        {!isNew && (
          <>
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
                  <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-[hsl(var(--success))] hover:bg-[hsl(var(--success))]/10">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </>
              )}
              <button
                onClick={() => patch({ starred: !form.starred })}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted",
                  form.starred && "text-amber-500",
                )}
              >
                <Star className={cn("h-4 w-4", form.starred && "fill-amber-400 text-amber-400")} /> Star
              </button>
            </div>

            <Field label="Status">
              <div className="flex flex-wrap gap-1.5">
                {ENQUIRY_STATUS.map((s) => (
                  <Chip key={s.id} active={form.status === s.id} onClick={() => patch({ status: s.id })}>
                    {s.label}
                  </Chip>
                ))}
              </div>
            </Field>
          </>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <Input value={form.customer.name} onChange={(e) => setCustomer("name", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="Company">
            <Input value={form.customer.company} onChange={(e) => setCustomer("company", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="Email">
            <Input value={form.customer.email} onChange={(e) => setCustomer("email", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="Phone">
            <Input value={form.customer.phone} onChange={(e) => setCustomer("phone", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
          </Field>
          <Field label="State code" hint="GST — e.g. 07 Delhi, 27 MH">
            <Input value={form.customer.stateCode} onChange={(e) => setCustomer("stateCode", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} placeholder="07" />
          </Field>
          <Field label="GSTIN">
            <Input value={form.customer.gstin} onChange={(e) => setCustomer("gstin", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { customer: form.customer })} />
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
        </div>

        <Field label="Message">
          <Textarea value={form.message} onChange={(e) => set("message", e.target.value)} onBlur={() => !isNew && repo.update("enquiries", enquiry.id, { message: form.message })} placeholder="Requirement details…" />
        </Field>

        {!isNew && (
          <Field label="Internal notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} onBlur={() => repo.update("enquiries", enquiry.id, { notes: form.notes })} placeholder="Private notes (saved on blur)…" />
          </Field>
        )}
      </div>
    </Drawer>
  )
}
