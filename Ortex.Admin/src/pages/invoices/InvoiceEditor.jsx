import { useState } from "react"
import { toast } from "sonner"
import { Eye, Trash2, IndianRupee, Mail, Upload } from "../../components/ui/Icons"
import { repo } from "../../data/store/repository"
import {
  createInvoice,
  updateInvoice,
  paidForInvoice,
  invoiceBalance,
  resolveInvoiceStatus,
  emailInvoice,
  isInterState,
} from "../../data/domain/domain"
import { notifyMessage } from "../../services/notify"
import { INVOICE_STATUS, statusMeta } from "../../data/domain/schema"
import { toDateInput, formatCurrency } from "../../lib/format"
import CustomerFields from "../../components/editors/CustomerFields"
import ShipToFields from "../../components/editors/ShipToFields"
import LineItemsEditor from "../../components/editors/LineItemsEditor"
import ReceiptView from "../../components/documents/ReceiptView"
import { parseTallyInvoiceXml } from "../../components/editors/TallyInvoiceImport"
import { Button, Input, Textarea, Field, StatusBadge, Chip, Modal } from "../../components/ui/Ui"
import PaymentHistory from "./PaymentHistory"
import RecordPaymentModal from "./RecordPaymentModal"

export default function InvoiceEditor({ draft, products, customers, payments, settings, onClose, onPreview }) {
  const isEdit = !!draft.id
  const [form, setForm] = useState(draft)
  const [payOpen, setPayOpen] = useState(false)
  const [receiptFor, setReceiptFor] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const handleTallyEditorImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseTallyInvoiceXml(text)
      if (!parsed.length) {
        toast.error("No valid Tally Sales vouchers found in the XML file.")
        return
      }
      const inv = parsed[0]
      set(inv)
      toast.success(`Auto-filled invoice details from Tally (${inv.number})`)
    } catch (err) {
      console.error(err)
      toast.error(`Error parsing Tally XML: ${err.message}`)
    }
    e.target.value = ""
  }
  const interState = isInterState(settings.company.stateCode, form.shipTo?.stateCode || form.customer.stateCode)

  const linkedPayments = isEdit ? payments.filter((p) => p.invoiceId === form.id && p.type === "inflow") : []
  const paid = isEdit ? paidForInvoice(form.id, payments) : 0
  const balance = isEdit ? invoiceBalance(form, payments) : form.totals?.grandTotal || 0
  const derivedStatus = isEdit ? resolveInvoiceStatus(form, payments) : form.status

  const save = async () => {
    if (!form.customer.name.trim()) return toast.error("Customer name is required")
    if (!form.lines.length) return toast.error("Add at least one line item")
    // The editor's line items are the source of truth. Drop any aggregate
    // `totals` carried in from a Tally import (which has no per-line breakdown)
    // so createInvoice recomputes them from the current lines — otherwise an
    // imported/edited invoice would save stale totals. updateInvoice already
    // recomputes, so stripping here is a no-op for that path.
    const { totals: _staleTotals, ...payload } = form
    if (isEdit) {
      await updateInvoice(form.id, payload)
      toast.success("Invoice updated")
    } else {
      const created = await createInvoice(payload)
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
            {!isEdit && (
              <label className="cursor-pointer">
                <span className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors gap-1.5 h-9">
                  <Upload className="h-4 w-4" /> Import Tally XML
                </span>
                <input type="file" accept=".xml,text/xml" onChange={handleTallyEditorImport} className="hidden" />
              </label>
            )}
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
        {isEdit && linkedPayments.length > 0 && <PaymentHistory payments={linkedPayments} onReceipt={setReceiptFor} />}
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
