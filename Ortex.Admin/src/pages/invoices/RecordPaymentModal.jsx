import { useMemo, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Sparkles } from "../../components/ui/Icons"
import { recordPayment, invoiceBalance } from "../../data/domain/domain"
import { PAYMENT_METHODS } from "../../data/domain/schema"
import { toDateInput, formatCurrency, formatDate } from "../../lib/format"
import { cn } from "../../lib/cn"
import { normalizeReading, findDuplicate, matchInvoice } from "../../lib/paymentReader"
import ScreenshotReader from "./ScreenshotReader"
import { Button, Input, Select, Field, Textarea, Drawer } from "../../components/ui/Ui"

// One payment form for both entry points:
//  - Invoice editor: pass `invoice` (+ `balance`). The receipt is pinned to it.
//  - Payments page: pass `invoices` + `payments`, the user picks an open
//    invoice (optional) and the receipt reconciles against it; or `type`
//    "payout" for a vendor payment with no invoice at all.
// Order on the page follows the decision: how much, who, when and how, the
// proof (reference), then what it settles.
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
    if (match) { setInvoiceId(match.inv.id); filled.push("invoice") }
    setReading({ ...d, filled, match, text: raw.text || "" })
  }

  const duplicate = useMemo(
    () => findDuplicate({ type, amount: Number(amount) || null, date: date ? new Date(date).toISOString() : null, reference, party: party || linked?.customer?.name }, payments),
    [type, amount, date, reference, party, linked, payments],
  )

  // Picking an invoice fills only what is still empty: an amount read from the
  // screenshot is what was actually paid, and must not become the balance.
  const pickInvoice = (id) => {
    setInvoiceId(id)
    const row = openInvoices.find((r) => r.inv.id === id)
    if (!row) return
    if (!party.trim()) setParty(row.inv.customer?.name || "")
    if (!Number(amount)) setAmount(row.balance)
  }

  // A small mark on every label the screenshot filled.
  const label = (text, key) => (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {reading?.filled.includes(key) && <Sparkles className="h-3 w-3 text-primary" aria-label="From the screenshot" />}
    </span>
  )

  const amt = Number(amount) || 0
  const over = due !== null && amt > due

  // `close` is the drawer's animated close: the panel slides out, then onDone runs.
  const submit = async (close) => {
    if (amt <= 0) return toast.error("Enter the amount")
    const partyName = party.trim()
    if (!pinned && !linked && !partyName) return toast.error(isPayout ? "Enter who was paid" : "Enter who paid")
    if (duplicate?.sure && !window.confirm(`${duplicate.payment.number || "A payment"} already has this reference. Record it again?`)) return
    if (reading?.serious && !window.confirm(reading.status === "failed" ? "This payment failed. Record it anyway?" : "This is not a payment screenshot. Record it anyway?")) return
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
      subtitle={pinned ? `${invoice.number} · ${formatCurrency(balance)} due` : undefined}
      width="max-w-md"
      footer={(close) => (
        <div className="flex items-center justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => close()}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => submit(close)}>
            {amt > 0 ? `Save ${formatCurrency(amt).replace(/\.00$/, "")}` : "Save"}
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <ScreenshotReader onRead={applyReading} />

        {reading && <ReadingNotes reading={reading} amount={amt} onUseAlt={() => setAmount(reading.amountAlt)} />}

        {duplicate && (
          <Notice tone="danger">
            {duplicate.sure ? "Already recorded" : "Maybe already recorded"}: {duplicate.payment.number || "a payment"}, {formatCurrency(duplicate.payment.amount)} on {formatDate(duplicate.payment.date)}.
          </Notice>
        )}

        <Field
          label={label("Amount", "amount")}
          required
          error={over ? `More than the ${formatCurrency(due)} due` : undefined}
          hint={due !== null && !over && amt !== due ? (
            <button type="button" className="text-primary hover:underline" onClick={() => setAmount(due)}>
              {formatCurrency(due)} due. Use it
            </button>
          ) : undefined}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">₹</span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="pl-9 text-lg font-semibold tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              autoFocus
            />
          </div>
        </Field>

        {!pinned && (
          <Field label={label(isPayout ? "Paid to" : "Received from", "party")} required={!linked}>
            <Input value={party} onChange={(e) => setParty(e.target.value)} placeholder={isPayout ? "Vendor name" : "Customer name"} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={label("Date", "date")}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={label("Method", "method")}>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={label("Reference", "reference")}>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR or transaction ID" className="tabular" />
        </Field>

        {openInvoices.length > 0 && (
          <Field label={label("Invoice", "invoice")} hint={reading?.match ? `Matched: ${reading.match.why.join(", ")}` : undefined}>
            <Select value={invoiceId} onChange={(e) => pickInvoice(e.target.value)}>
              <option value="">None</option>
              {openInvoices.map(({ inv, balance: b }) => (
                <option key={inv.id} value={inv.id}>
                  {inv.number} · {inv.customer?.name || "-"} · {formatCurrency(b)}
                </option>
              ))}
            </Select>
          </Field>
        )}

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
              placeholder="Optional"
              rows={2}
            />
          </Field>
        )}
      </div>
    </Drawer>
  )
}

function Notice({ tone = "warning", action, children }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-[13px]",
        tone === "danger" ? "bg-destructive/8 text-destructive-text" : "bg-warning/10 text-warning-text",
      )}
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  )
}

// What the screenshot told us: one line when it is clean, the problems when not.
function ReadingNotes({ reading, amount, onUseAlt }) {
  const { warnings, filled, serious, amountAlt, text } = reading
  return (
    <div className="space-y-2">
      {!warnings.length ? (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {filled.length ? "Filled from the screenshot. Check, then save." : "Nothing could be read."}
        </p>
      ) : (
        warnings.map((w, i) => (
          <Notice
            key={w}
            tone={serious && i === 0 ? "danger" : "warning"}
            action={amountAlt && amount !== amountAlt && w.startsWith("Check the amount") && (
              <button type="button" className="shrink-0 font-semibold underline-offset-2 hover:underline" onClick={onUseAlt}>
                Use {formatCurrency(amountAlt).replace(/\.00$/, "")}
              </button>
            )}
          >
            {w}
          </Notice>
        ))
      )}
      <div className="text-xs">
        {text && (
          <details className="text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground">Show text read</summary>
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-2.5 font-sans text-[11px] leading-relaxed">{text.trim()}</pre>
          </details>
        )}
      </div>
    </div>
  )
}
