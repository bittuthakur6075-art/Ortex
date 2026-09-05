import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, Trash2, IndianRupee, Mail, Upload, ReceiptText, Wallet, CheckCircle2, CalendarClock, Database } from "../../components/ui/Icons"
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
import { computeDocument } from "../../lib/pricing"
import { toDateInput, formatCurrency, formatDate, daysUntil } from "../../lib/format"
import CustomerPicker from "../../components/editors/CustomerPicker"
import ShipToFields from "../../components/editors/ShipToFields"
import LineItemsEditor from "../../components/editors/LineItemsEditor"
import LivePreview from "../../components/editors/LivePreview"
import { EditorHeader, Tiles, Tile, Section, EditorFooter } from "../../components/editors/DocumentEditorShell"
import ReceiptView from "../../components/documents/ReceiptView"
import { parseTallyInvoiceXml } from "../../components/editors/TallyInvoiceImport"
import { Button, Input, Textarea, Field, StatusBadge, Chip } from "../../components/ui/Ui"
import { cn } from "../../lib/cn"
import PaymentHistory from "./PaymentHistory"
import RecordPaymentModal from "./RecordPaymentModal"

// Full-page invoice editor: form on the left in the order people fill it in
// (customer → dates → line items → terms → extras), the live A4 document on
// the right, money tiles above when editing, and a sticky action footer.
export default function InvoiceEditor({ draft, products, customers, payments, settings, onClose, onPreview }) {
  const isEdit = !!draft.id
  const [form, setForm] = useState(draft)
  const [payOpen, setPayOpen] = useState(false)
  const [receiptFor, setReceiptFor] = useState(null)
  const [moreOpen, setMoreOpen] = useState(Boolean(draft.shipTo || draft.notes))
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
  const hasState = Boolean(form.shipTo?.stateCode || form.customer.stateCode)

  const linkedPayments = isEdit ? payments.filter((p) => p.invoiceId === form.id && p.type === "inflow") : []
  const paid = isEdit ? paidForInvoice(form.id, payments) : 0
  const derivedStatus = isEdit ? resolveInvoiceStatus(form, payments) : form.status
  const dueIn = form.dueDate ? daysUntil(form.dueDate) : null
  const tally = form.tally?.status

  // Live document from the form as it stands. Imported invoices may carry
  // aggregate totals without lines; keep those rather than recomputing to zero.
  const liveDoc = useMemo(() => {
    const totals = form.lines?.length ? computeDocument(form.lines, { interState, extraDiscountPercent: form.extraDiscountPercent }) : form.totals
    return { ...form, totals, amountPaid: paid, status: derivedStatus }
  }, [form, interState, paid, derivedStatus])
  const grand = liveDoc.totals?.grandTotal || 0
  const balance = isEdit ? invoiceBalance({ ...form, totals: liveDoc.totals }, payments) : grand
  const settled = isEdit && balance <= 0.5

  const save = async () => {
    if (!form.customer.name.trim() && !form.customer.company?.trim()) return toast.error("Choose or add a customer")
    if (!form.lines.length) return toast.error("Add at least one line item")
    // The editor's line items are the source of truth. Drop any aggregate
    // `totals` carried in from a Tally import so createInvoice recomputes them.
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

  const remove = async () => {
    if (!window.confirm("Delete this invoice? Linked payments are kept.")) return
    await repo.remove("invoices", form.id)
    toast.success("Invoice deleted")
    onClose()
  }

  const partyLabel = form.customer?.company || form.customer?.name
  const lineCount = form.lines?.length || 0
  const summary = `${lineCount} line${lineCount === 1 ? "" : "s"} · ${formatCurrency(grand)}`

  return (
    <div>
      <EditorHeader
        onBack={onClose}
        backLabel="Back to invoices"
        title={isEdit ? `Invoice ${draft.number}` : "New invoice"}
        trail={["Billing", "Invoices", isEdit ? "Details" : "New"]}
        badge={<StatusBadge list={INVOICE_STATUS} status={derivedStatus} />}
        meta={isEdit ? `${partyLabel || "No customer"} · issued ${formatDate(form.issueDate)}` : `Draft · ${summary}`}
        actions={
          <>
            <Button variant="outline" size="md" onClick={() => onPreview(liveDoc)}>
              <Eye className="h-4 w-4" /> Preview
            </Button>
            {isEdit && (
              <>
                <Button variant="outline" size="md" onClick={emailCopy}>
                  <Mail className="h-4 w-4" /> Email copy
                </Button>
                {balance > 0.5 && derivedStatus !== "cancelled" && (
                  <Button variant="success" size="md" onClick={() => setPayOpen(true)}>
                    <IndianRupee className="h-4 w-4" /> Record payment
                  </Button>
                )}
              </>
            )}
            <Button size="md" onClick={save}>
              {isEdit ? "Save changes" : "Create invoice"}
            </Button>
          </>
        }
      />

      {isEdit && (
        <Tiles className={tally ? "xl:grid-cols-4" : "xl:grid-cols-3"}>
          <Tile icon={ReceiptText} label="Invoice total" value={formatCurrency(grand)} />
          <Tile
            icon={settled ? CheckCircle2 : Wallet}
            tone={settled ? "success" : "warning"}
            label="Paid"
            value={formatCurrency(paid)}
            sub={settled ? "Settled" : `${formatCurrency(balance)} outstanding`}
          />
          <Tile
            icon={CalendarClock}
            tone={dueIn != null && dueIn < 0 && !settled ? "danger" : "info"}
            label="Issued"
            value={formatDate(form.issueDate)}
            sub={form.dueDate ? `Due ${formatDate(form.dueDate)}${dueIn != null && !settled ? (dueIn < 0 ? ` · ${-dueIn}d overdue` : dueIn === 0 ? " · today" : ` · in ${dueIn}d`) : ""}` : undefined}
          />
          {tally && <Tile icon={Database} tone={tally === "synced" ? "success" : "slate"} label="Tally" value={tally === "synced" ? "Synced" : tally} sub={form.tally?.voucherNumber ? `Voucher ${form.tally.voucherNumber}` : undefined} />}
        </Tiles>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <div className="min-w-0 space-y-4">
          <Section title="Customer" description="Who this invoice bills">
            <CustomerPicker value={form.customer} onChange={(customer) => set({ customer })} customers={customers} />
            {hasState && (
              <p className={cn("mt-3 text-xs font-medium", interState ? "text-primary" : "text-success-text")}>
                {interState ? "Inter-state supply - IGST will be applied." : "Intra-state supply - CGST + SGST will be applied."}
              </p>
            )}
          </Section>

          <Section title="Details">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Issue date">
                <Input type="date" value={toDateInput(form.issueDate)} onChange={(e) => set({ issueDate: new Date(e.target.value).toISOString() })} />
              </Field>
              <Field label="Due date">
                <Input type="date" value={toDateInput(form.dueDate)} onChange={(e) => set({ dueDate: new Date(e.target.value).toISOString() })} />
              </Field>
              <Field label="Payment terms" className="col-span-2">
                <Input value={form.paymentTerms || ""} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="70% advance, 30% before dispatch" />
              </Field>
            </div>
            {isEdit && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-4">
                <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-subtle-foreground">Mark as</span>
                {["draft", "sent", "cancelled"].map((s) => (
                  <Chip key={s} active={form.status === s} onClick={() => setStatus(s)}>
                    {statusMeta(INVOICE_STATUS, s).label}
                  </Chip>
                ))}
                <span className="text-xs text-subtle-foreground">· paid and overdue are automatic</span>
              </div>
            )}
          </Section>

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

          <Section title="Terms & conditions" description="Printed at the foot of the invoice">
            <Textarea value={form.terms || ""} onChange={(e) => set({ terms: e.target.value })} className="min-h-[110px]" />
          </Section>

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
                  <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-[80px]" />
                </Field>
              </div>
            )}
          </div>

          {isEdit && linkedPayments.length > 0 && (
            <Section title="Payments" description="Money received against this invoice" bodyClassName="p-0">
              <PaymentHistory payments={linkedPayments} onReceipt={setReceiptFor} />
            </Section>
          )}
        </div>

        <div className="min-w-0 xl:sticky xl:top-[72px] xl:self-start">
          <LivePreview doc={liveDoc} settings={settings} type="invoice" onOpen={() => onPreview(liveDoc)} />
        </div>
      </div>

      <EditorFooter
        left={
          <>
            {isEdit && (
              <Button variant="dangerGhost" size="sm" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            )}
            {!isEdit && (
              <label className="cursor-pointer">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-btn border border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-subtle">
                  <Upload className="h-4 w-4" /> Import Tally XML
                </span>
                <input type="file" accept=".xml,text/xml" onChange={handleTallyEditorImport} className="hidden" />
              </label>
            )}
          </>
        }
        right={
          <>
            <span className="mr-2 hidden text-[13px] text-muted-foreground sm:inline">{summary}</span>
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              {isEdit ? "Save changes" : "Create invoice"}
            </Button>
          </>
        }
      />

      {payOpen && <RecordPaymentModal invoice={form} balance={balance} onClose={() => setPayOpen(false)} onDone={() => setPayOpen(false)} />}

      {receiptFor && (
        <ReceiptView open onClose={() => setReceiptFor(null)} payment={receiptFor} settings={settings} invoice={form} allocation={{ cumulative: paid, balance }} />
      )}
    </div>
  )
}
