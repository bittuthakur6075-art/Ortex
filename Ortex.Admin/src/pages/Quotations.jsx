import { useState, useMemo, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { FileText, Plus, Search, Eye, FileCheck2, Trash2, Download, AlertTriangle, Send, CalendarClock } from "../components/ui/Icons"
import { toast } from "sonner"
import { repo } from "../data/store/repository"
import { useCollection, useSettings, useSorting } from "../hooks/useCollection"
import { createQuotation, updateQuotation, convertQuotationToInvoice, markEnquiryQuoted, markLeadQuoted, isInterState } from "../data/domain/domain"
import { notifyMessage, notifyQuotationSent } from "../services/notify"
import { QUOTATION_STATUS, LOST_REASONS, newCustomer, newLine } from "../data/domain/schema"
import { formatDate, toDateInput, daysUntil, formatCurrency } from "../lib/format"
import { exportCsv } from "../lib/csv"
import PageHeader from "../components/layout/PageHeader"
import CustomerPicker from "../components/editors/CustomerPicker"
import LivePreview from "../components/editors/LivePreview"
import { computeDocument } from "../lib/pricing"
import { cn } from "../lib/cn"
import ShipToFields from "../components/editors/ShipToFields"
import LineItemsEditor from "../components/editors/LineItemsEditor"
import DocumentView from "../components/documents/DocumentView"
import { EditorHeader, Tiles, Tile, Section, EditorFooter } from "../components/editors/DocumentEditorShell"
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
  SortTh,
} from "../components/ui/Ui"

const emptyDraft = (settings) => ({
  id: null,
  customer: newCustomer(),
  shipTo: null,
  lines: [newLine()],
  extraDiscountPercent: 0,
  paymentTerms: "",
  issueDate: new Date().toISOString(),
  validityDays: settings?.quotation?.validityDays ?? 15,
  notes: "",
  terms: settings?.quotation?.terms ?? "",
  status: "draft",
  lostReason: "",
  enquiryId: null,
  leadId: null,
})

// Status as shown in the UI: a "sent" quote whose validity has lapsed reads as
// "expired" without a background job mutating the stored record.
function displayStatus(q) {
  if (q.status !== "sent" || !q.validUntil) return q.status
  const left = daysUntil(q.validUntil)
  return left !== null && left < 0 ? "expired" : q.status
}

// Email the quotation (EmailJS or mailto per settings) and, if it was still a
// draft or had lapsed, mark it "sent". Returns true when the send went through.
async function sendQuotation(q, settings) {
  if (!q?.id) {
    toast.error("Save the quotation first")
    return false
  }
  const res = await notifyQuotationSent(q, settings)
  const m = notifyMessage(res)
  if (res?.error) {
    toast.error(m?.text || res.error)
    return false
  }
  if (m) toast[m.tone === "success" ? "success" : "message"](m.text)
  if (["draft", "expired", "sent"].includes(q.status)) await repo.update("quotations", q.id, { status: "sent" })
  return true
}

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
  const [sort, onSort] = useSorting("issueDate", true)

  // Router state handoffs:
  //  - fromEnquiry / fromLead: prefill a new quotation from a "Convert to
  //    quotation" action.
  //  - fromCustomer: start a blank quotation for a customer-master record.
  //  - openId: open an existing quotation (links from Customers / Products).
  useEffect(() => {
    if (!settings) return
    const { fromEnquiry, fromLead, fromCustomer, openId } = location.state || {}
    if (fromEnquiry || fromLead) {
      const src = fromEnquiry || fromLead
      setEditing({
        ...emptyDraft(settings),
        customer: { ...newCustomer(), ...src.customer },
        // A voice lead arrives with the product and quantity Anu captured, so it
        // can seed the first line and leave only the rate to fill in. Sources
        // without line detail keep the empty draft's blank row.
        lines: src.lines?.length ? src.lines : emptyDraft(settings).lines,
        enquiryId: fromEnquiry?.id || null,
        leadId: fromLead?.id || null,
        notes: src.message ? `Ref: ${src.message}` : "",
      })
      navigate(location.pathname, { replace: true })
    } else if (fromCustomer) {
      setEditing({ ...emptyDraft(settings), customer: { ...newCustomer(), ...fromCustomer } })
      navigate(location.pathname, { replace: true })
    } else if (openId) {
      if (loading) return // wait for the collection, the effect re-runs when it lands
      const q = items.find((x) => x.id === openId)
      if (q) setEditing({ ...q })
      else toast.error("That quotation no longer exists")
      navigate(location.pathname, { replace: true })
    }
  }, [location, settings, navigate, items, loading])

  const filtered = useMemo(() => {
    let rows = items
    if (statusFilter !== "all") rows = rows.filter((q) => displayStatus(q) === statusFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      rows = rows.filter((q) =>
        [q.number, q.customer?.name, q.customer?.company].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }
    const { key, desc } = sort
    const sorted = [...rows].sort((a, b) => {
      let valA, valB
      if (key === "customer") {
        valA = a.customer?.company || a.customer?.name
        valB = b.customer?.company || b.customer?.name
      } else if (key === "grandTotal") {
        valA = a.totals?.grandTotal
        valB = b.totals?.grandTotal
      } else if (key === "issueDate" || key === "validUntil") {
        valA = a[key] ? new Date(a[key]).getTime() : 0
        valB = b[key] ? new Date(b[key]).getTime() : 0
      } else {
        valA = a[key]
        valB = b[key]
      }
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "string") return desc ? valB.localeCompare(valA) : valA.localeCompare(valB)
      return desc ? valB - valA : valA - valB
    })
    return sorted
  }, [items, query, statusFilter, sort])

  const handleExport = () => {
    exportCsv(
      `ortex-quotations-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (q) => q.number },
        { header: "Date", value: (q) => formatDate(q.issueDate) },
        { header: "Customer", value: (q) => q.customer?.company || q.customer?.name },
        { header: "Status", value: (q) => displayStatus(q) },
        { header: "Taxable", value: (q) => q.totals?.taxable },
        { header: "Grand total", value: (q) => q.totals?.grandTotal },
        { header: "Valid until", value: (q) => formatDate(q.validUntil) },
      ],
      filtered,
    )
  }

  if (!settings) return <PageLoader />

  if (editing) {
    return (
      <div className="space-y-6">
        <QuotationEditor
          draft={editing}
          products={products}
          customers={customers}
          settings={settings}
          onClose={() => setEditing(null)}
          onPreview={(q) => setPreview(q)}
          onSend={(q) => sendQuotation(q, settings)}
        />
        <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
      </div>
    )
  }

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

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-[320px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle-foreground" />
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
              <thead className="bg-subtle text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <tr>
                  <SortTh sortKey="number" sort={sort} onSort={onSort}>Number</SortTh>
                  <SortTh sortKey="customer" sort={sort} onSort={onSort}>Customer</SortTh>
                  <SortTh sortKey="grandTotal" sort={sort} onSort={onSort} align="right">Total</SortTh>
                  <SortTh sortKey="status" sort={sort} onSort={onSort}>Status</SortTh>
                  <SortTh sortKey="validUntil" sort={sort} onSort={onSort}>Validity</SortTh>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border rows-in">
                {filtered.map((q) => {
                  const left = daysUntil(q.validUntil)
                  const expiring = ["draft", "sent"].includes(q.status) && left !== null && left < 0
                  const canSend = ["draft", "sent"].includes(q.status)
                  return (
                    <tr key={q.id} className="cursor-pointer transition-colors hover:bg-subtle" onClick={() => setEditing({ ...q })}>
                      <td className="px-4 py-3 font-medium tabular text-foreground">{q.number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{q.customer?.company || q.customer?.name}</div>
                        <div className="text-xs text-muted-foreground">{q.customer?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        <Money value={q.totals?.grandTotal} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge list={QUOTATION_STATUS} status={displayStatus(q)} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {expiring ? <span className="text-destructive">Expired {formatDate(q.validUntil)}</span> : formatDate(q.validUntil)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {canSend && (
                            <button
                              onClick={(ev) => {
                                ev.stopPropagation()
                                sendQuotation(q, settings)
                              }}
                              className="text-muted-foreground hover:text-primary"
                              title={q.status === "sent" ? "Resend" : "Send"}
                            >
                              <Send className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setPreview(q)
                            }}
                            className="text-muted-foreground hover:text-primary"
                            title="Preview"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="quotation" />
    </div>
  )
}

function QuotationEditor({ draft, products, customers, settings, onClose, onPreview, onSend }) {
  const isEdit = !!draft.id
  const [form, setForm] = useState(draft)
  const [showLost, setShowLost] = useState(false)
  const [moreOpen, setMoreOpen] = useState(Boolean(draft.shipTo || draft.notes))
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const interState = isInterState(settings.company.stateCode, form.shipTo?.stateCode || form.customer.stateCode)
  const hasState = Boolean(form.shipTo?.stateCode || form.customer.stateCode)
  const status = isEdit ? displayStatus(form) : form.status
  const partyLabel = form.customer?.company || form.customer?.name

  // Live document: what the customer will receive, computed from the form as
  // it is right now (valid-until follows issue date + validity like createQuotation).
  const liveDoc = useMemo(() => {
    const validUntil = form.issueDate && form.validityDays ? new Date(new Date(form.issueDate).getTime() + form.validityDays * 86400000).toISOString() : form.validUntil
    return { ...form, validUntil, totals: computeDocument(form.lines, { interState, extraDiscountPercent: form.extraDiscountPercent }) }
  }, [form, interState])
  const validDays = liveDoc.validUntil ? daysUntil(liveDoc.validUntil) : null

  const save = async () => {
    if (!form.customer.name.trim() && !form.customer.company?.trim()) return toast.error("Choose or add a customer")
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

  const changeStatus = async (next) => {
    if (next === "rejected") {
      setShowLost(true)
      return
    }
    set({ status: next })
    if (isEdit) await repo.update("quotations", form.id, { status: next })
  }

  const confirmReject = async (reason) => {
    set({ status: "rejected", lostReason: reason })
    setShowLost(false)
    if (isEdit) await repo.update("quotations", form.id, { status: "rejected", lostReason: reason })
  }

  // Persist any pending edits so the email carries what's on screen, then send.
  const send = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    const saved = await updateQuotation(form.id, form)
    const ok = await onSend(saved || form)
    if (ok && ["draft", "expired", "sent"].includes(form.status)) set({ status: "sent" })
  }

  const convert = async () => {
    if (!isEdit) return toast.error("Save the quotation first")
    const inv = await convertQuotationToInvoice(form.id)
    if (!inv) return toast.error("Could not convert this quotation to an invoice.")
    toast.success(`Invoice ${inv.number} generated`)
    const m = notifyMessage(inv._notify)
    if (m) toast[m.tone === "error" ? "error" : "message"](m.text)
    onClose()
  }

  const remove = async () => {
    if (!window.confirm("Delete this quotation?")) return
    await repo.remove("quotations", form.id)
    toast.success("Quotation deleted")
    onClose()
  }

  const validityTone = status === "invoiced" || status === "accepted" ? "success" : validDays != null && validDays < 0 ? "danger" : validDays != null && validDays <= 3 ? "warning" : "info"
  const validitySub = validDays == null ? undefined : validDays < 0 ? `Expired ${-validDays}d ago` : validDays === 0 ? "Expires today" : `${validDays} day${validDays === 1 ? "" : "s"} left`
  const lineCount = form.lines.length
  const summary = `${lineCount} line${lineCount === 1 ? "" : "s"} · ${formatCurrency(liveDoc.totals.grandTotal)}`

  return (
    <div>
      <EditorHeader
        onBack={onClose}
        backLabel="Back to quotations"
        title={isEdit ? `Quotation ${draft.number}` : "New quotation"}
        trail={["Sales", "Quotations", isEdit ? "Details" : "New"]}
        badge={<StatusBadge list={QUOTATION_STATUS} status={status} />}
        meta={isEdit ? `${partyLabel || "No customer"} · issued ${formatDate(form.issueDate)}` : `Draft · ${summary}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => onPreview(liveDoc)}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            {isEdit && ["draft", "sent", "expired"].includes(form.status) && (
              <Button variant="outline" size="sm" onClick={send}>
                <Send className="h-4 w-4" /> {form.status === "sent" ? "Resend" : "Send"}
              </Button>
            )}
            {isEdit && form.status !== "invoiced" && (
              <Button variant="success" size="sm" onClick={convert}>
                <FileCheck2 className="h-4 w-4" /> Convert to invoice
              </Button>
            )}
            <Button size="sm" onClick={save}>
              {isEdit ? "Save changes" : "Create quotation"}
            </Button>
          </>
        }
      />

      {isEdit && (
        <Tiles className="xl:grid-cols-3">
          <Tile icon={FileText} label="Quote value" value={formatCurrency(liveDoc.totals.grandTotal)} sub={`${summary.split(" · ")[0]} · ${interState ? "IGST" : "CGST + SGST"}`} />
          <Tile icon={CalendarClock} tone={validityTone} label="Valid until" value={liveDoc.validUntil ? formatDate(liveDoc.validUntil) : "—"} sub={validitySub} />
          <Tile
            icon={status === "invoiced" ? FileCheck2 : status === "rejected" ? AlertTriangle : Send}
            tone={status === "invoiced" || status === "accepted" ? "success" : status === "rejected" ? "danger" : status === "sent" ? "info" : "slate"}
            label="Status"
            value={QUOTATION_STATUS.find((s) => s.id === status)?.label || status}
            sub={status === "rejected" && form.lostReason ? `Lost: ${form.lostReason}` : form.invoiceId ? "Invoice generated" : undefined}
          />
        </Tiles>
      )}

      {/* Form left · live document right (Acctual / Mercury / Airwallex) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          {/* 1. Who */}
          <Section title="Customer" description="Who this quotation is for">
            <CustomerPicker value={form.customer} onChange={(customer) => set({ customer })} customers={customers} />
            {hasState && (
              <p className={cn("mt-3 text-xs font-medium", interState ? "text-primary" : "text-success-text")}>
                {interState ? "Inter-state supply — IGST will be applied." : "Intra-state supply — CGST + SGST will be applied."}
              </p>
            )}
          </Section>

          {/* 2. When / how — one compact row (Xero header row) */}
          <Section title="Details">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Issue date">
                <Input type="date" value={toDateInput(form.issueDate)} onChange={(e) => set({ issueDate: new Date(e.target.value).toISOString() })} />
              </Field>
              <Field label="Validity (days)">
                <Input type="number" min="1" value={form.validityDays} onChange={(e) => set({ validityDays: Number(e.target.value) })} />
              </Field>
              <Field label="Valid until" hint="From issue date + validity">
                <Input readOnly value={liveDoc.validUntil ? formatDate(liveDoc.validUntil) : ""} />
              </Field>
              <Field label="Payment terms">
                <Input value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="70% advance, 30% before dispatch" />
              </Field>
            </div>
            {isEdit && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground">Mark as</span>
                {QUOTATION_STATUS.filter((s) => !["invoiced", "expired"].includes(s.id)).map((s) => (
                  <Chip key={s.id} active={form.status === s.id} onClick={() => changeStatus(s.id)}>
                    {s.label}
                  </Chip>
                ))}
                <span className="text-xs text-subtle-foreground">· expired and invoiced are automatic</span>
              </div>
            )}
          </Section>

          {/* 3. What — the quote itself */}
          <Section title="Line items" description="Pick a product to auto-fill HSN, rate and GST, or enter a custom item.">
            <LineItemsEditor
              lines={form.lines}
              onChange={(lines) => set({ lines })}
              products={products}
              extraDiscountPercent={form.extraDiscountPercent}
              onExtraDiscountChange={(v) => set({ extraDiscountPercent: v })}
              interState={interState}
            />
          </Section>

          {/* 4. Terms — always present, rarely edited */}
          <Section title="Terms & conditions" description="Printed at the foot of the quotation">
            <Textarea value={form.terms} onChange={(e) => set({ terms: e.target.value })} className="min-h-[110px]" />
          </Section>

          {/* 5. Optional extras, collapsed until needed */}
          <div className="rounded-card bg-card shadow-card">
            <button type="button" onClick={() => setMoreOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left" aria-expanded={moreOpen}>
              <div>
                <h3 className="text-[15px] font-semibold leading-5 text-foreground">Ship to & notes</h3>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {form.shipTo ? `Ships to ${form.shipTo.company || form.shipTo.name || "a different address"}` : "Ships to the customer address"}
                  {form.notes ? " · note added" : ""}
                </p>
              </div>
              <span className="text-[13px] font-medium text-primary">{moreOpen ? "Hide" : "Edit"}</span>
            </button>
            {moreOpen && (
              <div className="space-y-5 border-t border-border px-5 py-5">
                <ShipToFields value={form.shipTo} onChange={(shipTo) => set({ shipTo })} customers={customers} />
                <Field label="Notes" hint="Printed under the totals">
                  <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Internal or customer-facing note" className="min-h-[80px]" />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 xl:sticky xl:top-[72px] xl:self-start">
          <LivePreview doc={liveDoc} settings={settings} type="quotation" onOpen={() => onPreview(liveDoc)} />
        </div>
      </div>

      <EditorFooter
        left={
          isEdit && (
            <Button variant="dangerGhost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )
        }
        right={
          <>
            <span className="mr-2 hidden text-[13px] text-muted-foreground sm:inline">{summary}</span>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              {isEdit ? "Save changes" : "Create quotation"}
            </Button>
          </>
        }
      />

      <Modal open={showLost} onClose={() => setShowLost(false)} title="Reason for losing this quote" width="max-w-sm">
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Chip key={r} onClick={() => confirmReject(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </Modal>
    </div>
  )
}
