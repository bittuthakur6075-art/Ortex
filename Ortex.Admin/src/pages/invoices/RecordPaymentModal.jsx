import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Sparkles } from "../../components/ui/Icons"
import { recordPayment, invoiceBalance } from "../../data/domain/domain"
import { PAYMENT_METHODS } from "../../data/domain/schema"
import { toDateInput, formatCurrency, formatDate } from "../../lib/format"
import { normalizeReading, findDuplicate, matchInvoice } from "../../lib/paymentReader"
import ScreenshotReader from "./ScreenshotReader"
import { Button, Input, Select, Field, Textarea, Drawer } from "../../components/ui/Ui"

// One payment form for both entry points:
//  - Invoice editor: pass `invoice` (+ `balance`). The receipt is pinned to it.
//  - Payments page: pass `invoices` + `payments`, the user picks an open
//    invoice (optional) and the receipt reconciles against it; or `type`
//    "payout" for a vendor payment with no invoice at all.
export default function RecordPaymentModal({ type = "inflow", invoice, balance, invoices = [], payments = [], onClose, onDone }) {
  const isPayout = type === "payout"
  const pinned = !!invoice

  const openInvoices = useMemo(() => {
    if (pinned || isPayout) return []
    return invoices
      .filter((inv) => !["draft", "cancelled"].includes(inv.status))
      .map((inv) => ({ inv, balance: invoiceBalance(inv, payments) }))
      .filter((r) => r.balance > 0)
      .sort((a, b) => (a.inv.number || "").localeCompare(b.inv.number || ""))
  }, [invoices, payments, pinned, isPayout])

  const [invoiceId, setInvoiceId] = useState(invoice?.id || "")
  const linked = pinned ? invoice : openInvoices.find((r) => r.inv.id === invoiceId)?.inv || null
  const due = pinned ? balance : linked ? invoiceBalance(linked, payments) : null

  const [amount, setAmount] = useState(pinned ? balance : "")
  const [method, setMethod] = useState(PAYMENT_METHODS[0])
  const [date, setDate] = useState(toDateInput(new Date().toISOString()))
  const [reference, setReference] = useState("")
  const [party, setParty] = useState("")
  const [note, setNote] = useState("")
  // What the last screenshot said: its warnings, and the fields it filled.
  const [reading, setReading] = useState(null)

  const applyReading = (raw) => {
    const d = normalizeReading(raw, { type })
    const filled = []
    if (d.amount) { setAmount(d.amount); filled.push("amount") }
    if (d.date) { setDate(toDateInput(d.date)); filled.push("date") }
    if (d.method !== "Other") { setMethod(d.method); filled.push("method") }
    if (d.reference) { setReference(d.reference); filled.push("reference") }
    if (d.party && !pinned) { setParty(d.party); filled.push("party") }
    if (d.note && !pinned) setNote(d.note)
    // A confident invoice match links it, unless one was already chosen.
    const match = !pinned && !isPayout && !invoiceId ? matchInvoice(d, openInvoices) : null
    if (match) setInvoiceId(match.inv.id)
    setReading({ ...d, filled, match })
  }

  const duplicate = useMemo(
    () => findDuplicate({ type, amount: Number(amount) || null, date: date ? new Date(date).toISOString() : null, reference, party: party || linked?.customer?.name }, payments),
    [type, amount, date, reference, party, linked, payments],
  )
  const wasFilled = (f) => reading?.filled.includes(f) ? "Read from the screenshot. Check it." : undefined

  const pickInvoice = (id) => {
    setInvoiceId(id)
    const row = openInvoices.find((r) => r.inv.id === id)
    if (row) {
      setParty(row.inv.customer?.name || "")
      setAmount(row.balance)
    }
  }

  // `close` is the drawer's animated close: the panel slides out, then onDone runs.
  const submit = async (close) => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount")
    const partyName = party.trim()
    if (!pinned && !linked && !partyName) return toast.error(isPayout ? "Enter the payee" : "Enter the payer")
    if (duplicate?.sure && !window.confirm(`${duplicate.payment.number || "A payment"} already has this reference. Record it again?`)) return
    if (reading?.status === "failed" && !window.confirm("The screenshot shows a failed payment. Record it anyway?")) return
    await recordPayment({
      type,
      amount: amt,
      method,
      date: new Date(date).toISOString(),
      reference,
      note,
      party: partyName,
      invoiceId: linked?.id,
      invoiceNumber: linked?.number,
      customer: linked?.customer,
    })
    toast.success(isPayout ? "Payout recorded" : "Payment recorded")
    close(onDone)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={isPayout ? "Record payout" : "Record payment"}
      subtitle={pinned ? `Against ${invoice.number}` : "Fill it from a screenshot, or type it in"}
      width="max-w-md"
      footer={(close) => (
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => close()}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => submit(close)}>
            {isPayout ? "Save" : "Save payment"}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <ScreenshotReader onRead={applyReading} />
        {reading && (
          <div className="space-y-1 rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              {reading.filled.length ? "Filled from the screenshot. Check every value before saving." : "Nothing usable could be read."}
            </p>
            {reading.match && (
              <p className="text-muted-foreground">
                Linked to {reading.match.inv.number}: {reading.match.why.join(", ")}.
              </p>
            )}
            {reading.warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 text-warning-text">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {w}
              </p>
            ))}
            {reading.amountAlt && Number(amount) !== reading.amountAlt && (
              <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => setAmount(reading.amountAlt)}>
                Use {formatCurrency(reading.amountAlt)} instead
              </Button>
            )}
          </div>
        )}
        {duplicate && (
          <p className="flex items-start gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive-text">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {duplicate.sure ? "Already recorded" : "Possibly already recorded"}: {duplicate.payment.number || "a payment"}, {formatCurrency(duplicate.payment.amount)} on {formatDate(duplicate.payment.date)}.
          </p>
        )}
        {!pinned && !isPayout && (
          <Field label="Invoice" hint={openInvoices.length ? undefined : "No open invoices"}>
            <Select value={invoiceId} onChange={(e) => pickInvoice(e.target.value)} autoFocus>
              <option value="">Not linked to an invoice</option>
              {openInvoices.map(({ inv, balance: b }) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} · {inv.customer?.name || "-"} · {formatCurrency(b)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!pinned && (
          <Field label={isPayout ? "Paid To (Vendor / Party)" : "Received From"} required={!linked} hint={wasFilled("party")}>
            <Input
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder={isPayout ? "Vendor name" : "Customer name"}
              autoFocus={isPayout}
            />
          </Field>
        )}
        {due !== null && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Balance due</span>
            <span className="font-semibold text-foreground">{formatCurrency(due)}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (₹)" required hint={wasFilled("amount")}>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={pinned} />
          </Field>
          <Field label="Date" hint={wasFilled("date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference / Txn ID" hint={wasFilled("reference")}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter reference or transaction ID" />
        </Field>
        {!pinned && (
          <Field label="Note">
            <Textarea
              ai={{
                purpose: isPayout
                  ? "Short internal note on a vendor payout: what it was for"
                  : "Short internal note on a received customer payment: what it covers",
                context: () => ({ type, reference, invoiceId: invoiceId || undefined }),
                format: "short",
                maxChars: 200,
              }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter note"
            />
          </Field>
        )}
        {due !== null && Number(amount) > due && (
          <p className="flex items-center gap-1.5 text-xs text-warning-text">
            <AlertTriangle className="h-3.5 w-3.5" /> Amount exceeds the balance due.
          </p>
        )}
        {isPayout && (
          <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Vendor payouts are recorded manually here. Automated bank payouts (RazorpayX, etc.) require a backend integration.
          </p>
        )}
      </div>
    </Drawer>
  )
}
