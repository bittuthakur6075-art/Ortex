import { useState, useMemo } from "react"
import { ReceiptIndianRupee, Plus, Search, Eye, Trash2, Download, IndianRupee, AlertTriangle, ReceiptText, Mail } from "../components/icons"
import { toast } from "sonner"
import { repo } from "../data/repository"
import { useCollection, useSettings } from "../data/hooks"
import {
  createInvoice,
  updateInvoice,
  recordPayment,
  paidForInvoice,
  invoiceBalance,
  resolveInvoiceStatus,
  emailInvoice,
  isInterState,
} from "../data/domain"
import { notifyMessage } from "../data/notify"
import { INVOICE_STATUS, PAYMENT_METHODS, newCustomer, newLine, statusMeta } from "../data/schema"
import { formatDate, toDateInput, formatCurrency } from "../lib/format"
import { exportCsv } from "../lib/csv"
import PageHeader from "../components/PageHeader"
import CustomerFields from "../components/CustomerFields"
import ShipToFields from "../components/ShipToFields"
import LineItemsEditor from "../components/LineItemsEditor"
import DocumentView from "../components/DocumentView"
import ReceiptView from "../components/ReceiptView"
import {
  Button,
  Card,
  Input,
  Select,
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
  shipTo: null,
  lines: [newLine()],
  extraDiscountPercent: 0,
  paymentTerms: "",
  issueDate: new Date().toISOString(),
  dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
  notes: "",
  terms: settings?.quotation?.terms ?? "",
  status: "draft",
})

export default function Invoices() {
  const { items, loading } = useCollection("invoices")
  const { items: products } = useCollection("products")
  const { items: customers } = useCollection("customers")
  const { items: payments } = useCollection("payments")
  const settings = useSettings()

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [editing, setEditing] = useState(null)
  const [preview, setPreview] = useState(null)

  const rows = useMemo(() => {
    return items.map((inv) => ({
      ...inv,
      _paid: paidForInvoice(inv.id, payments),
      _balance: invoiceBalance(inv, payments),
      _status: resolveInvoiceStatus(inv, payments),
    }))
  }, [items, payments])

  const filtered = useMemo(() => {
    let list = rows
    if (statusFilter !== "all") list = list.filter((i) => i._status === statusFilter)
    const s = query.trim().toLowerCase()
    if (s) {
      list = list.filter((i) =>
        [i.number, i.customer?.name, i.customer?.company].filter(Boolean).some((v) => v.toLowerCase().includes(s)),
      )
    }
    return [...list].sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
  }, [rows, query, statusFilter])

  const handleExport = () => {
    exportCsv(
      `ortex-invoices-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Number", value: (i) => i.number },
        { header: "Date", value: (i) => formatDate(i.issueDate) },
        { header: "Customer", value: (i) => i.customer?.company || i.customer?.name },
        { header: "Status", value: (i) => i._status },
        { header: "Taxable", value: (i) => i.totals?.taxable },
        { header: "Grand total", value: (i) => i.totals?.grandTotal },
        { header: "Paid", value: (i) => i._paid },
        { header: "Balance", value: (i) => i._balance },
        { header: "Due", value: (i) => formatDate(i.dueDate) },
      ],
      filtered,
    )
  }

  if (!settings) return <PageLoader />

  const editingRow = editing && editing.id ? rows.find((r) => r.id === editing.id) || editing : editing

  return (
    <div>
      <PageHeader title="Invoices" subtitle={`${items.length} invoices · GST tax invoices & collections`}>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={!filtered.length}>
          <Download className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" onClick={() => setEditing(emptyDraft(settings))}>
          <Plus className="h-4 w-4" /> New invoice
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
          {INVOICE_STATUS.map((s) => (
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
          icon={ReceiptIndianRupee}
          title="No invoices yet"
          description="Generate an invoice from an accepted quotation, or create one directly."
          action={
            <Button onClick={() => setEditing(emptyDraft(settings))}>
              <Plus className="h-4 w-4" /> New invoice
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
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((i) => {
                  const overdue = i._status === "overdue"
                  return (
                    <tr key={i.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setEditing({ ...i })}>
                      <td className="px-4 py-3 font-medium tabular text-foreground">{i.number}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{i.customer?.company || i.customer?.name}</div>
                        <div className="text-xs text-muted-foreground">{i.customer?.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        <Money value={i.totals?.grandTotal} />
                      </td>
                      <td className="px-4 py-3 text-right tabular">
                        {i._balance > 0.5 ? <span className="font-medium text-amber-600 dark:text-amber-400">{formatCurrency(i._balance)}</span> : <span className="text-[hsl(var(--success))]">Settled</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge list={INVOICE_STATUS} status={i._status} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {overdue ? <span className="text-destructive">{formatDate(i.dueDate)}</span> : formatDate(i.dueDate)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(ev) => {
                            ev.stopPropagation()
                            setPreview(i)
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
        <InvoiceEditor
          draft={editingRow}
          products={products}
          customers={customers}
          payments={payments}
          settings={settings}
          onClose={() => setEditing(null)}
          onPreview={(inv) => setPreview(inv)}
        />
      )}

      <DocumentView open={!!preview} onClose={() => setPreview(null)} doc={preview} settings={settings} type="invoice" />
    </div>
  )
}

function InvoiceEditor({ draft, products, customers, payments, settings, onClose, onPreview }) {
  const isEdit = !!draft.id
  const [form, setForm] = useState(draft)
  const [payOpen, setPayOpen] = useState(false)
  const [receiptFor, setReceiptFor] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const interState = isInterState(settings.company.stateCode, form.shipTo?.stateCode || form.customer.stateCode)

  const linkedPayments = isEdit ? payments.filter((p) => p.invoiceId === form.id && p.type === "inflow") : []
  const paid = isEdit ? paidForInvoice(form.id, payments) : 0
  const balance = isEdit ? invoiceBalance(form, payments) : form.totals?.grandTotal || 0
  const derivedStatus = isEdit ? resolveInvoiceStatus(form, payments) : form.status

  const save = async () => {
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    if (!form.lines.length) return toast.error("Add at least one line item")
    if (isEdit) {
      await updateInvoice(form.id, form)
      toast.success("Invoice updated")
    } else {
      const created = await createInvoice(form)
      toast.success(`Invoice ${created.number} created`)
      const m = notifyMessage(created._notify)
      if (m) toast[m.tone === "error" ? "error" : "message"](m.text)
    }
    onClose()
  }

  const emailCopy = async () => {
    const m = notifyMessage(await emailInvoice(form.id))
    if (m) toast[m.tone === "error" ? "error" : "message"](m.text)
  }

  const setStatus = async (status) => {
    set({ status })
    if (isEdit) await repo.update("invoices", form.id, { status })
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={
        <div className="flex items-center gap-3">
          <span>{isEdit ? `Invoice ${draft.number}` : "New invoice"}</span>
          {isEdit && <StatusBadge list={INVOICE_STATUS} status={derivedStatus} />}
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
                <Button variant="outline" size="sm" onClick={emailCopy}>
                  <Mail className="h-4 w-4" /> Email copy
                </Button>
                {balance > 0.5 && derivedStatus !== "cancelled" && (
                  <Button variant="success" size="sm" onClick={() => setPayOpen(true)}>
                    <IndianRupee className="h-4 w-4" /> Record payment
                  </Button>
                )}
                <Button
                  variant="dangerGhost"
                  size="sm"
                  onClick={async () => {
                    if (window.confirm("Delete this invoice? Linked payments are kept.")) {
                      await repo.remove("invoices", form.id)
                      toast.success("Invoice deleted")
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
              {isEdit ? "Save changes" : "Create invoice"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Payment summary */}
        {isEdit && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Invoice total</div>
              <div className="text-lg font-bold text-foreground">{formatCurrency(form.totals?.grandTotal)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Paid</div>
              <div className="text-lg font-bold text-[hsl(var(--success))]">{formatCurrency(paid)}</div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Balance</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400">{formatCurrency(balance)}</div>
            </div>
          </div>
        )}

        {isEdit && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mark:</span>
            {["draft", "sent", "cancelled"].map((s) => (
              <Chip key={s} active={form.status === s} onClick={() => setStatus(s)}>
                {statusMeta(INVOICE_STATUS, s).label}
              </Chip>
            ))}
            <span className="text-xs text-muted-foreground">(paid / overdue are automatic)</span>
          </div>
        )}

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Customer (Bill to)</h3>
          <CustomerFields value={form.customer} onChange={(customer) => set({ customer })} customers={customers} />
        </section>

        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Ship to (Consignee)</h3>
          <ShipToFields value={form.shipTo} onChange={(shipTo) => set({ shipTo })} customers={customers} />
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
          <Field label="Due date">
            <Input type="date" value={toDateInput(form.dueDate)} onChange={(e) => set({ dueDate: new Date(e.target.value).toISOString() })} />
          </Field>
          <Field label="Payment terms" className="sm:col-span-2">
            <Input value={form.paymentTerms || ""} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="e.g. 70% Advance & 30% Before dispatch" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </section>

        {/* Payment history */}
        {isEdit && linkedPayments.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">Payments received</h3>
            <div className="divide-y divide-border rounded-xl border border-border">
              {linkedPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
                    <span className="text-muted-foreground"> · {p.method}</span>
                    {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <span className="text-xs text-muted-foreground">{formatDate(p.date)}</span>
                    <button onClick={() => setReceiptFor(p)} className="text-muted-foreground hover:text-primary" title="Print receipt">
                      <ReceiptText className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {payOpen && (
        <RecordPaymentModal
          invoice={form}
          balance={balance}
          onClose={() => setPayOpen(false)}
          onDone={() => setPayOpen(false)}
        />
      )}

      {receiptFor && (
        <ReceiptView
          open
          onClose={() => setReceiptFor(null)}
          payment={receiptFor}
          settings={settings}
          invoice={form}
          allocation={{ cumulative: paid, balance }}
        />
      )}
    </Modal>
  )
}

function RecordPaymentModal({ invoice, balance, onClose, onDone }) {
  const [amount, setAmount] = useState(balance)
  const [method, setMethod] = useState(PAYMENT_METHODS[0])
  const [date, setDate] = useState(toDateInput(new Date().toISOString()))
  const [reference, setReference] = useState("")

  const submit = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount")
    await recordPayment({
      type: "inflow",
      amount: amt,
      method,
      date: new Date(date).toISOString(),
      reference,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      customer: invoice.customer,
    })
    toast.success("Payment recorded")
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record payment"
      width="max-w-sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Balance due</span>
          <span className="font-semibold text-foreground">{formatCurrency(balance)}</span>
        </div>
        <Field label="Amount (₹)" required>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Reference / txn ID">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ref, cheque no.…" />
        </Field>
        {Number(amount) > balance && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Amount exceeds the balance due.
          </p>
        )}
      </div>
    </Modal>
  )
}
