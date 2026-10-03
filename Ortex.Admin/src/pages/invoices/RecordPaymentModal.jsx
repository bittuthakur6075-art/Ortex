import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Sparkles } from "../../components/ui/Icons"
import { recordPayment, outstandingBalance, paymentDateIso } from "../../data/domain/domain"
import { PAYMENT_METHODS } from "../../data/domain/schema"
import { formatCurrency, formatDate, toDateInput } from "../../lib/format"
import { cn } from "../../lib/cn"
import { normalizeReading, findDuplicate, matchInvoice, paymentDirection } from "../../lib/paymentReader"
import { useSettings } from "../../hooks/useCollection"
import ScreenshotReader from "./ScreenshotReader"
import { Button, Input, Select, Field, Textarea, Drawer, Switch } from "../../components/ui/Ui"

// Today's date in India, yyyy-mm-dd: the latest a payment can be dated.
const todayIst = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)
// Above this a typo (an extra zero) is likelier than a real receipt: ask.
const CONFIRM_ABOVE = 1e7

// One payment form for both entry points:
//  - Invoice editor: pass `invoice` (+ `balance`, + `payments` for the
//    duplicate check). The receipt is pinned to it.
//  - Payments page: pass `invoices` + `payments`, the user picks an open
//    invoice (optional) and the receipt reconciles against it; or `type`
//    "payout" for a vendor payment with no invoice at all.
// Order on the page follows the decision: how much, who, when and how, the
// proof (reference), then what it settles.
export default function RecordPaymentModal({ type: initialType = "inflow", invoice, balance, invoices = [], payments = [], onClose, onDone }) {
  // Which way the money went. Starts as the button that opened the drawer; a
  // screenshot that clearly says otherwise offers to switch it.
  const [type, setType] = useState(initialType)
  const isPayout = type === "payout"
  const settings = useSettings()
  const lastRaw = useRef(null)
  const pinned = !!invoice

  const openInvoices = useMemo(() => {
    if (pinned || isPayout) return []
    return invoices
      .map((inv) => ({ inv, balance: outstandingBalance(inv, payments) }))
      .filter((r) => r.balance > 0)
      .sort((a, b) => (a.inv.number || "").localeCompare(b.inv.number || ""))
  }, [invoices, payments, pinned, isPayout])

  const [invoiceId, setInvoiceId] = useState(invoice?.id || "")
  const linked = pinned ? invoice : openInvoices.find((r) => r.inv.id === invoiceId)?.inv || null
  const due = pinned ? balance : linked ? outstandingBalance(linked, payments) : null

  const blank = { amount: pinned ? balance : "", method: PAYMENT_METHODS[0], date: todayIst(), reference: "", party: "", note: "", invoiceId: invoice?.id || "" }
  const [amount, setAmount] = useState(blank.amount)
  const [method, setMethod] = useState(blank.method)
  const [date, setDate] = useState(blank.date)
  const [reference, setReference] = useState(blank.reference)
  const [party, setParty] = useState(blank.party)
  const [note, setNote] = useState(blank.note)
  const [advance, setAdvance] = useState(false)
  // What the last screenshot said: its warnings, and the values it put in.
  const [reading, setReading] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const current = { amount, method, date, reference, party, note, invoiceId }
  const setters = { amount: setAmount, method: setMethod, date: setDate, reference: setReference, party: setParty, note: setNote, invoiceId: setInvoiceId }

  // Undo what the previous screenshot filled, but keep any field the person
  // has since typed over.
  const clearReading = () => {
    for (const [k, v] of Object.entries(reading?.values || {})) {
      if (String(current[k]) === String(v)) setters[k](blank[k])
    }
    setReading(null)
  }

  const applyReading = (raw, kind = type) => {
    clearReading()
    lastRaw.current = raw
    const d = normalizeReading(raw, { type: kind })
    const values = {}
    const put = (k, v) => {
      setters[k](v)
      values[k] = v
    }
    if (d.amount) put("amount", d.amount)
    if (d.date) put("date", toDateInput(d.date))
    if (d.method !== "Other") put("method", d.method)
    if (d.reference) put("reference", d.reference)
    if (d.party && !pinned) put("party", d.party)
    if (d.note && !pinned) put("note", d.note)
    // A confident invoice match links it, unless one was chosen by hand.
    const handPicked = invoiceId && invoiceId !== reading?.values?.invoiceId
    const match = !pinned && kind !== "payout" && !handPicked ? matchInvoice(d, openInvoices) : null
    if (match) put("invoiceId", match.inv.id)
    const filled = Object.keys(values).filter((k) => k !== "note").map((k) => (k === "invoiceId" ? "invoice" : k))
    // Paid to us, or by us, according to the company's own name, UPI ID and account.
    const direction = paymentDirection(raw, settings?.company)
    setReading({ ...d, filled, values, match, direction, text: raw.text || "" })
  }

  const duplicate = useMemo(
    () => findDuplicate({ type, amount: Number(amount) || null, date: date ? paymentDateIso(date) : null, reference, party: party || linked?.customer?.name }, payments),
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
  const maxDate = todayIst()

  // The screenshot says the money went the other way from what is being recorded.
  const wrongWay = !!reading?.direction && reading.direction !== type
  const wrongWayWords = reading?.direction === "payout"
    ? `This screenshot shows money paid BY ${settings?.company?.name || "the company"}: it looks like a payout.`
    : `This screenshot shows money paid TO ${settings?.company?.name || "the company"}: it looks like a payment received.`
  const switchWay = () => {
    const kind = reading.direction
    setType(kind)
    if (kind === "payout") setInvoiceId("")
    if (lastRaw.current) applyReading(lastRaw.current, kind)
  }

  // `close` is the drawer's animated close: the panel slides out, then onDone runs.
  const submit = async (close) => {
    if (savingRef.current) return
    if (amt <= 0) return toast.error("Enter the amount")
    if (!date) return toast.error("Enter the date")
    if (date > maxDate) return toast.error("The date cannot be after today")
    const partyName = party.trim()
    if (!pinned && !linked && !partyName) return toast.error(isPayout ? "Enter who was paid" : "Enter who paid")
    if (amt > CONFIRM_ABOVE && !window.confirm(`Is ${formatCurrency(amt)} correct?`)) return
    if (duplicate?.sure && !window.confirm(`${duplicate.payment.number || "A payment"} already has this reference. Record it again?`)) return
    if (reading?.serious && !window.confirm(reading.status === "failed" ? "This payment failed. Record it anyway?" : "This is not a payment screenshot. Record it anyway?")) return
    if (reading?.status === "pending" && !window.confirm("This payment is still pending. Record it anyway?")) return
    if (wrongWay && !window.confirm(wrongWayWords + " Record it as " + (isPayout ? "a payout" : "money received") + " anyway?")) return
    savingRef.current = true
    setSaving(true)
    try {
      await recordPayment({
        type,
        amount: amt,
        method,
        date,
        reference,
        note,
        party: partyName,
        invoiceId: linked?.id,
        invoiceNumber: linked?.number,
        customer: linked?.customer,
        ...(advance && !isPayout && !linked ? { advance: true } : {}),
      })
      toast.success(isPayout ? "Payout recorded" : "Payment recorded")
      close(onDone)
    } catch (e) {
      // The database's own words (migration 0066 refuses bad amounts, unknown invoices, ...).
      toast.error(e?.message || "Could not save the payment")
      savingRef.current = false
      setSaving(false)
    }
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
          <Button size="sm" disabled={saving} onClick={() => submit(close)}>
            {saving ? "Saving…" : amt > 0 ? `Save ${formatCurrency(amt).replace(/\.00$/, "")}` : "Save"}
          </Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <ScreenshotReader onRead={applyReading} onClear={clearReading} />

        {reading && <ReadingNotes reading={reading} amount={amt} onUseAlt={() => setAmount(reading.amountAlt)} />}

        {wrongWay && (
          <Notice tone="danger">
            {wrongWayWords}{" "}
            {pinned ? (
              "A payment against this invoice is always money received."
            ) : (
              <button type="button" className="font-medium underline" onClick={switchWay}>
                Record it as {reading.direction === "payout" ? "a payout" : "money received"}
              </button>
            )}
          </Notice>
        )}

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
          <Field label={label("Date", "date")} required>
            <Input type="date" required max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
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
                // Never the UTR: the writer's free tier may keep prompts.
                context: () => ({ type, invoiceNumber: linked?.number || undefined }),
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

        {!isPayout && !linked && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-foreground">
              Advance against an order
              <span className="block text-xs text-muted-foreground">Its receipt prints as a Receipt Voucher</span>
            </span>
            <Switch checked={advance} onChange={setAdvance} label="Advance against an order" />
          </div>
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
