import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { AlertTriangle, Sparkles } from "../../components/ui/Icons"
import { recordPayment, outstandingBalance, paymentDateIso, syncInvoicePaid } from "../../data/domain/domain"
import { repo } from "../../data/store/repository"
import { PAYMENT_METHODS } from "../../data/domain/schema"
import { formatCurrency, formatDate, toDateInput, round2 } from "../../lib/format"
import { cn } from "../../lib/cn"
import { normalizeReading, findDuplicate, matchInvoice, paymentDirection, parseAmount } from "../../lib/paymentReader"
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
//  - Editing: pass `payment` (+ `invoices`, `payments`). The form starts from
//    it and saves a patch of what changed; its number never changes. Migration
//    0066 refuses a change to a payment already in Tally unless the caller is
//    the Super Admin, so the Payments page only opens those for them.
export default function RecordPaymentModal({ type: initialType = "inflow", invoice, balance, invoices = [], payments = [], payment, onClose, onDone }) {
  const editing = !!payment
  // Which way the money went. Starts as the button that opened the drawer; a
  // screenshot that clearly says otherwise offers to switch it.
  const [type, setType] = useState(payment?.type || initialType)
  const isPayout = type === "payout"
  const settings = useSettings()
  const lastRaw = useRef(null)
  const pinned = !!invoice
  // The ledger without the payment being edited: its own amount must not count
  // against its invoice's balance, nor flag itself as a duplicate.
  const others = useMemo(() => (editing ? payments.filter((p) => p.id !== payment.id) : payments), [editing, payments, payment])

  const openInvoices = useMemo(() => {
    if (pinned || isPayout) return []
    return invoices
      .map((inv) => ({ inv, balance: outstandingBalance(inv, others) }))
      .filter((r) => r.balance > 0 || r.inv.id === payment?.invoiceId)
      .sort((a, b) => (a.inv.number || "").localeCompare(b.inv.number || ""))
  }, [invoices, others, pinned, isPayout, payment])

  const [invoiceId, setInvoiceId] = useState(invoice?.id || payment?.invoiceId || "")
  const linked = pinned ? invoice : openInvoices.find((r) => r.inv.id === invoiceId)?.inv || null
  const due = pinned ? balance : linked ? outstandingBalance(linked, others) : null

  const blank = editing
    ? {
        amount: String(payment.amount ?? ""),
        method: payment.method || PAYMENT_METHODS[0],
        date: toDateInput(payment.date),
        reference: payment.reference || "",
        party: payment.party || "",
        note: payment.note || "",
        invoiceId: payment.invoiceId || "",
      }
    : { amount: pinned ? String(balance) : "", method: PAYMENT_METHODS[0], date: todayIst(), reference: "", party: "", note: "", invoiceId: invoice?.id || "" }
  const [amount, setAmount] = useState(blank.amount)
  const [method, setMethod] = useState(blank.method)
  const [date, setDate] = useState(blank.date)
  const [reference, setReference] = useState(blank.reference)
  const [party, setParty] = useState(blank.party)
  const [note, setNote] = useState(blank.note)
  const [advance, setAdvance] = useState(!!payment?.advance)
  // What the last screenshot said: its warnings, and the values it put in.
  const [reading, setReading] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [errors, setErrors] = useState({})
  // Warnings the person must read before the save goes through (one step,
  // in the drawer), or null.
  const [confirming, setConfirming] = useState(null)
  const [initial] = useState(() => ({ ...blank, type: payment?.type || initialType, advance: !!payment?.advance }))

  const current = { amount, method, date, reference, party, note, invoiceId }
  const dirty =
    type !== initial.type || advance !== initial.advance || Object.keys(current).some((k) => String(current[k]) !== String(initial[k]))
  const clearError = (k) => errors[k] && setErrors((e) => ({ ...e, [k]: undefined }))
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

  // Typed as text so a scroll wheel never changes it, and "1,00,000" reads.
  const amt = parseAmount(amount) || 0

  const duplicate = useMemo(
    () => findDuplicate({ type, amount: amt || null, date: date ? paymentDateIso(date) : null, reference, party: party || linked?.customer?.name }, others),
    [type, amt, date, reference, party, linked, others],
  )

  // Picking an invoice fills only what is still empty: an amount read from the
  // screenshot is what was actually paid, and must not become the balance.
  const pickInvoice = (id) => {
    setInvoiceId(id)
    const row = openInvoices.find((r) => r.inv.id === id)
    if (!row) return
    if (!party.trim()) setParty(row.inv.customer?.name || "")
    if (!amt) setAmount(String(row.balance))
  }

  // A small mark on every label the screenshot filled.
  const label = (text, key) => (
    <span className="inline-flex items-center gap-1.5">
      {text}
      {reading?.filled.includes(key) && <Sparkles className="h-3 w-3 text-primary" aria-label="From the screenshot" />}
    </span>
  )

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
  // Only what changed, so an untouched field (an imported date at midnight,
  // a frozen Tally field) is never rewritten.
  const saveEdit = async (partyName) => {
    const patch = {}
    if (type !== payment.type) patch.type = type
    if (amt !== Number(payment.amount)) patch.amount = round2(amt)
    if (date !== initial.date) patch.date = paymentDateIso(date)
    for (const [k, v] of Object.entries({ method, reference, note, party: partyName })) if (v !== initial[k]) patch[k] = v
    const nextInvoice = isPayout ? null : linked?.id || null
    if (nextInvoice !== (payment.invoiceId || null)) Object.assign(patch, { invoiceId: nextInvoice, invoiceNumber: linked?.number || "", customer: linked?.customer || null })
    const adv = advance && !isPayout && !linked
    if (adv !== !!payment.advance) patch.advance = adv
    if (!Object.keys(patch).length) return
    await repo.update("payments", payment.id, patch)
    // Demo mode only: on Supabase the 0066 trigger settles both invoices.
    for (const id of new Set([payment.invoiceId, nextInvoice])) if (id) await syncInvoicePaid(id)
  }

  const submit = async (close, confirmed = false) => {
    if (savingRef.current) return
    const partyName = party.trim()
    const errs = {}
    if (amt <= 0) errs.amount = "Enter the amount"
    if (!date) errs.date = "Enter the date"
    else if (date > maxDate) errs.date = "The date cannot be after today"
    if (!pinned && !linked && !partyName) errs.party = isPayout ? "Enter who was paid" : "Enter who paid"
    setErrors(errs)
    if (Object.keys(errs).length) return
    if (!confirmed) {
      const ask = [
        amt > CONFIRM_ABOVE && `${formatCurrency(amt).replace(/\.00$/, "")} is a large amount. Check it is not a typo.`,
        duplicate?.sure && `${duplicate.payment.number || "A payment"} already has this reference.`,
        reading?.serious && (reading.status === "failed" ? "The screenshot shows a failed payment." : "This is not a payment screenshot."),
        reading?.status === "pending" && "The screenshot shows the payment as still pending.",
        wrongWay && wrongWayWords,
      ].filter(Boolean)
      if (ask.length) return setConfirming(ask)
    }
    setConfirming(null)
    savingRef.current = true
    setSaving(true)
    try {
      if (editing) {
        await saveEdit(partyName)
        toast.success(isPayout ? "Payout updated" : "Payment updated")
        return close(onDone)
      }
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
      dirty={dirty}
      title={editing ? (isPayout ? "Edit payout" : "Edit payment") : isPayout ? "Record payout" : "Record payment"}
      subtitle={editing ? `${payment.number} · the number stays the same` : pinned ? `${invoice.number} · ${formatCurrency(balance)} due` : undefined}
      width="max-w-md"
      footer={(close) =>
        confirming ? (
          <div className="flex items-center justify-end gap-2.5">
            <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>
              Go back
            </Button>
            <Button size="sm" disabled={saving} onClick={() => submit(close, true)}>
              {saving ? "Saving…" : "Save anyway"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2.5">
            <Button variant="outline" size="sm" onClick={() => close()}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={() => submit(close)}>
              {saving ? "Saving…" : amt > 0 ? `Save ${formatCurrency(amt).replace(/\.00$/, "")}` : "Save"}
            </Button>
          </div>
        )
      }
    >
      {confirming ? (
        <div className="space-y-3" role="alert">
          <p className="text-sm font-medium text-foreground">Check before saving {formatCurrency(amt).replace(/\.00$/, "")}</p>
          {confirming.map((w) => (
            <Notice key={w} tone="danger">
              {w}
            </Notice>
          ))}
          <p className="text-[13px] text-muted-foreground">Save anyway, or go back and change it.</p>
        </div>
      ) : null}
      <div className={confirming ? "hidden" : "space-y-5"}>
        {editing && payment.tally?.status === "synced" && (
          <Notice tone="danger">This payment is already in Tally. Change it in Tally too, or the books will not match.</Notice>
        )}
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
          error={errors.amount || (over ? `More than the ${formatCurrency(due)} due` : undefined)}
          hint={due !== null && !over && amt !== due ? (
            <button type="button" className="text-primary hover:underline" onClick={() => setAmount(String(due))}>
              {formatCurrency(due)} due. Use it
            </button>
          ) : undefined}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">₹</span>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value.replace(/[^\d.,]/g, ""))
                clearError("amount")
              }}
              placeholder="0"
              aria-invalid={!!errors.amount}
              className="pl-9 text-lg font-semibold tabular"
              autoFocus
            />
          </div>
        </Field>

        {!pinned && (
          <Field label={label(isPayout ? "Paid to" : "Received from", "party")} required={!linked} error={errors.party}>
            <Input value={party} onChange={(e) => { setParty(e.target.value); clearError("party") }} placeholder={isPayout ? "Vendor name" : "Customer name"} />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label={label("Date", "date")} required error={errors.date}>
            <Input type="date" required max={maxDate} value={date} onChange={(e) => { setDate(e.target.value); clearError("date") }} />
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
