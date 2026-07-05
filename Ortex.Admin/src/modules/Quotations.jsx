import { useState, useMemo, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { FileText, Plus, Search, Eye, FileCheck2, Trash2, Download, AlertTriangle } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection, useSettings } from "../data/hooks"
import { createQuotation, updateQuotation, convertQuotationToInvoice, markEnquiryQuoted, markLeadQuoted, isInterState } from "../data/domain"
import { notifyMessage } from "../data/notify"
import { QUOTATION_STATUS, LOST_REASONS, newCustomer, newLine } from "../data/schema"
import { formatDate, toDateInput, daysUntil } from "../lib/format"
import { exportCsv } from "../lib/csv"
import PageHeader from "../components/PageHeader"
import CustomerFields from "../components/CustomerFields"
import LineItemsEditor from "../components/LineItemsEditor"
import DocumentView from "../components/DocumentView"
import {
  Button,
  Card,
  Input,
  Textarea,
  Field,
  StatusBadge,
  EmptyState,
  Money,
  Chip,
  Modal,
  PageLoader,
} from "../components/ui"

const emptyDraft = (settings) => ({
  id: null,
  customer: newCustomer(),
  lines: [newLine()],
  extraDiscountPercent: 0,
  issueDate: new Date().toISOString(),
  validityDays: settings?.quotation?.validityDays ?? 15,
  notes: "",
  terms: settings?.quotation?.terms ?? "",
  status: "draft",
  lostReason: "",
  enquiryId: null,
  leadId: null,
})

export default function Quotations() {
  const { items, loading } = useCollection("quotations")
  const { items: products } = useCollection("products")
  const { items: customers } = useCollection("customers")
  const settings = useSettings()
  const location = useLocation()
  const navigate = useNavigate()

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState(null) // draft object or null
  const [preview, setPreview] = useState(null)

  // Prefill a new quotation when arriving from a "Convert to quotation" action
  // on an enquiry or a lead.
  useEffect(() => {
    const { fromEnquiry, fromLead } = location.state || {}
    if ((fromEnquiry || fromLead) && settings) {
      const src = fromEnquiry || fromLead
      setEditing({
        ...emptyDraft(settings),
        customer: { ...newCustomer(), ...src.customer },
        enquiryId: fromEnquiry?.id || null,
        leadId: fromLead?.id || null,
        notes: src.message ? `Ref: ${src.message}` : "",
      })
      navigate(location.pathname, { replace: true })
    }
  }, [location, settings, navigate])

  const filtered = useMemo(() => {
    let rows = items
    if (statusFilter !== "all") rows = rows.filter((q) => q.status === statusFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      rows = rows.filter((q) =>
        [q.number, q.customer?.name, q.customer?.company].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }
    return [...rows].sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
  }, [items, query, statusFilter])

  const handleExport = () => {
    exportCsv(
      `ortex-quotations-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (q) => q.number },
        { header: "Date", value: (q) => formatDate(q.issueDate) },
        { header: "Customer", value: (q) => q.customer?.company || q.customer?.name },
        { header: "Status", value: (q) => q.status },
        { header: "Taxable", value: (q) => q.totals?.taxable },
        { header: "Grand total", value: (q) => q.totals?.grandTotal },
        { header: "Valid until", value: (q) => formatDate(q.validUntil) },
      ],
      filtered,
    )
  }

  if (!settings) return <PageLoader />

  return (
    <div>
      <PageHeader title="Quotations" subtitle={`${items.length} quotes · convert accepted quotes to invoices`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" onClick={() => setEditing(emptyDraft(settings))}>
          <Plus className="h-4 w-4" /> New quotation
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, customer…" className="pl-10" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
            All
          </Chip>
          {QUOTATION_STATUS.map((s) => (
            <Chip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotations yet"
          description="Create a quotation from scratch or convert an enquiry into one."
          action={
            <Button onClick={() => setEditing(emptyDraft(settings))}>
              <Plus className="h-4 w-4" /> New quotation
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="Try adjusting your search or filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Validity</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((q) => {
                  const left = daysUntil(q.validUntil)
                  const expiring = ["draft", "sent"].includes(q.status) && left !== null && left < 0
                  return (
                    <tr key={q.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setEditing({ ...q })}>
                      <td className="px-4 py-3 font-medium tabular text-foreground">{q.number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{q.customer?.company || q.customer?.name}</div>
                        <div className="text-xs text-muted-foreground">{q.customer?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        <Money value={q.totals?.grandTotal} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge list={QUOTATION_STATUS} status={q.status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {expiring ? <span className="text-destructive">Expired {formatDate(q.validUntil)}</span> : formatDate(q.validUntil)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setPreview(q)
                          }}
                          className="text-muted-foreground hover:text-primary"
                          title="Preview"
                        >
                          <Eye className="ml-auto h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <QuotationEditor
          draft={editing}
          products={products}
          customers={customers}
          settings={settings}
          onClose={() => setEditing(null)}
          onPreview={(q) => setPreview(q)}
        />
      )}

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
    </div>
  )
}

function QuotationEditor({ draft, products, customers, settings, onClose, onPreview }) {
  const isEdit = !!draft.id
  const [form, setForm] = useState(draft)
  const [showLost, setShowLost] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const interState = isInterState(settings.company.stateCode, form.customer.stateCode)

  const save = async () => {
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    if (!form.lines.length) return toast.error("Add at least one line item")
    if (isEdit) {
      await updateQuotation(form.id, form)
      toast.success("Quotation updated")
      onClose()
    } else {
      const created = await createQuotation(form)
      if (form.enquiryId) await markEnquiryQuoted(form.enquiryId)
      if (form.leadId) await markLeadQuoted(form.leadId, created.id)
      toast.success(`Quotation ${created.number} created`)
      onClose()
    }
  }

  const changeStatus = async (status) => {
    if (status === "rejected") {
      setShowLost(true)
      return
    }
    set({ status })
    if (isEdit) await repo.update("quotations", form.id, { status })
  }

  const confirmReject = async (reason) => {
    set({ status: "rejected", lostReason: reason })
    setShowLost(false)
    if (isEdit) await repo.update("quotations", form.id, { status: "rejected", lostReason: reason })
  }

  const convert = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    const inv = await convertQuotationToInvoice(form.id)
    toast.success(`Invoice ${inv.number} generated`)
    const m = notifyMessage(inv._notify)
    if (m) toast[m.tone === "error" ? "error" : "message"](m.text)
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={
        <div className="flex items-center gap-3">
          <span>{isEdit ? `Quotation ${draft.number}` : "New quotation"}</span>
          {isEdit && <StatusBadge list={QUOTATION_STATUS} status={form.status} />}
        </div>
      }
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {isEdit && (
              <>
                <Button variant="outline" size="sm" onClick={() => onPreview(form)}>
                  <Eye className="h-4 w-4" /> Preview
                </Button>
                {form.status !== "invoiced" && (
                  <Button variant="success" size="sm" onClick={convert}>
                    <FileCheck2 className="h-4 w-4" /> Convert to invoice
                  </Button>
                )}
                <Button
                  variant="dangerGhost"
                  size="sm"
                  onClick={async () => {
                    if (window.confirm("Delete this quotation?")) {
                      await repo.remove("quotations", form.id)
                      toast.success("Quotation deleted")
                      onClose()
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              {isEdit ? "Save changes" : "Create quotation"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {isEdit && (
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
            <div className="flex flex-wrap gap-1.5">
              {QUOTATION_STATUS.filter((s) => s.id !== "invoiced").map((s) => (
                <Chip key={s.id} active={form.status === s.id} onClick={() => changeStatus(s.id)}>
                  {s.label}
                </Chip>
              ))}
            </div>
            {form.status === "rejected" && form.lostReason && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" /> Lost: {form.lostReason}
              </p>
            )}
          </div>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Customer</h3>
          <CustomerFields value={form.customer} onChange={(customer) => set({ customer })} customers={customers} />
          {interState ? (
            <p className="mt-2 text-xs text-muted-foreground">Inter-state supply → IGST will be applied.</p>
          ) : form.customer.stateCode ? (
            <p className="mt-2 text-xs text-muted-foreground">Intra-state supply → CGST + SGST will be applied.</p>
          ) : null}
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Line items</h3>
          <LineItemsEditor
            lines={form.lines}
            onChange={(lines) => set({ lines })}
            products={products}
            extraDiscountPercent={form.extraDiscountPercent}
            onExtraDiscountChange={(v) => set({ extraDiscountPercent: v })}
            interState={interState}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Issue date">
            <Input type="date" value={toDateInput(form.issueDate)} onChange={(e) => set({ issueDate: new Date(e.target.value).toISOString() })} />
          </Field>
          <Field label="Validity (days)">
            <Input type="number" min="1" value={form.validityDays} onChange={(e) => set({ validityDays: Number(e.target.value) })} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Internal or customer-facing note" />
          </Field>
          <Field label="Terms & conditions" className="sm:col-span-2">
            <Textarea value={form.terms} onChange={(e) => set({ terms: e.target.value })} className="min-h-[120px]" />
          </Field>
        </section>
      </div>

      <Modal open={showLost} onClose={() => setShowLost(false)} title="Reason for losing this quote" width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Chip key={r} onClick={() => confirmReject(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </Modal>
    </Modal>
  )
}
