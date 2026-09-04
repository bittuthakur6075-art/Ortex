import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangle } from "../../components/ui/Icons"
import { recordPayment } from "../../data/domain/domain"
import { PAYMENT_METHODS } from "../../data/domain/schema"
import { toDateInput, formatCurrency } from "../../lib/format"
import { Button, Input, Select, Field, Modal } from "../../components/ui/Ui"

export default function RecordPaymentModal({ invoice, balance, onClose, onDone }) {
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
