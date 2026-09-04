import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "../../components/ui/Icons"
import { recordPayment, invoiceBalance } from "../../data/domain/domain"
import { PAYMENT_METHODS } from "../../data/domain/schema"
import { toDateInput, formatCurrency } from "../../lib/format"
import { Button, Input, Select, Field, Textarea, Modal } from "../../components/ui/Ui"

// One payment form for both entry points:
//  - Invoice editor: pass `invoice` (+ `balance`) — the receipt is pinned to it.
//  - Payments page: pass `invoices` + `payments` — the user picks an open
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

  const pickInvoice = (id) => {
    setInvoiceId(id)
    const row = openInvoices.find((r) => r.inv.id === id)
    if (row) {
      setParty(row.inv.customer?.name || "")
      setAmount(row.balance)
    }
  }

  const submit = async () => {
    const amt = Number(amount)
    if (!amt || amt <= 0) return toast.error("Enter a valid amount")
    const partyName = party.trim()
    if (!pinned && !linked && !partyName) return toast.error(isPayout ? "Enter the payee" : "Enter the payer")
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
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isPayout ? "Record payout" : "Record payment"}
      width="max-w-sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit}>
            {isPayout ? "Save" : "Save payment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!pinned && !isPayout && (
          <Field label="Invoice" hint={openInvoices.length ? undefined : "No open invoices"}>
            <Select value={invoiceId} onChange={(e) => pickInvoice(e.target.value)} autoFocus>
              <option value="">Not linked to an invoice</option>
              {openInvoices.map(({ inv, balance: b }) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} · {inv.customer?.name || "—"} · {formatCurrency(b)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {!pinned && (
          <Field label={isPayout ? "Paid to (vendor / party)" : "Received from"} required={!linked}>
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
          <Field label="Amount (₹)" required>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={pinned} />
          </Field>
          <Field label="Date">
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
        <Field label="Reference / txn ID">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ref, cheque no.…" />
        </Field>
        {!pinned && (
          <Field label="Note">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is this for?" />
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
    </Modal>
  )
}
