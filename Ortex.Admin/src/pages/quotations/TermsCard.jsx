import { useState } from "react"
import { CheckCircle2, Calendar } from "../../components/ui/Icons"
import { Chip, Field, Input, Switch, Tabs } from "../../components/ui/Ui"
import ListTextarea from "../../components/ui/ListTextarea"
import { toDateInput } from "../../lib/format"
import { cn } from "../../lib/cn"

const VALIDITY = [7, 15, 30]
const PAYMENT = ["100% advance", "50% advance, rest before dispatch", "30 days credit"]

const longDate = (iso) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
const count = (text) => (text || "").split("\n").filter((l) => l.trim()).length

// A chip in a row of choices, outlined so it reads as a button on a white card.
function Choice({ active, onClick, children }) {
  return (
    <Chip active={active} onClick={onClick} className={cn("h-9 rounded-xl border px-3.5 text-[13px]", active ? "border-primary/50" : "border-line")}>
      {children}
    </Chip>
  )
}

// "Terms and validity" in the quotation builder (V3): issue date, how long the
// prices hold, payment terms, the seller, then the terms and the note that
// print on the PDF. Presets are one click; Custom takes anything. `defaults`
// is what a new quotation would start with (company, then the person's own
// Quotation defaults); "Reset to my defaults" puts those back.
export default function TermsCard({ form, set, v, validUntil, left, defaults }) {
  const [customDays, setCustomDays] = useState(() => !VALIDITY.includes(Number(form.validityDays)))
  const presets = [...new Set([defaults?.paymentTerms, ...PAYMENT].filter(Boolean))]
  const [customPay, setCustomPay] = useState(() => Boolean(form.paymentTerms) && !presets.includes(form.paymentTerms))
  const [tab, setTab] = useState("terms")

  const changed = defaults && ["paymentTerms", "terms", "notes", "validityDays"].some((k) => (form[k] ?? "") !== (defaults[k] ?? ""))
  const reset = () => {
    set({ paymentTerms: defaults.paymentTerms || "", terms: defaults.terms || "", notes: defaults.notes || "", validityDays: defaults.validityDays })
    setCustomDays(!VALIDITY.includes(Number(defaults.validityDays)))
    setCustomPay(false)
  }

  const items = (form.lines || []).map((l) => l.description).filter(Boolean).slice(0, 10)

  return (
    <section className="squircle rounded-card bg-card p-5">
      <header className="mb-5 flex items-start gap-3">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-success/12 text-success-text">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-5 text-foreground">Terms and validity</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Filled from your Quotation defaults. Change anything for this customer.</p>
        </div>
        {changed && (
          <button type="button" onClick={reset} className="flex-none text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
            Reset to my defaults
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 gap-x-5 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Issue date" data-path="issueDate" error={v.shown.issueDate}>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" value={toDateInput(form.issueDate)} onChange={(e) => set({ issueDate: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="pl-10" />
          </div>
        </Field>
        <Field
          label="Valid for"
          data-path="validityDays"
          error={v.shown.validityDays}
          warning={v.shownWarnings.validityDays}
          hint={validUntil ? (left != null && left < 0 ? `Lapsed ${-left} days ago` : `Until ${longDate(validUntil)} · the customer sees this date`) : undefined}
        >
          <div className="flex flex-wrap items-center gap-2">
            {VALIDITY.map((d) => (
              <Choice key={d} active={!customDays && Number(form.validityDays) === d} onClick={() => (setCustomDays(false), set({ validityDays: d }))}>
                {d} days
              </Choice>
            ))}
            <Choice active={customDays} onClick={() => setCustomDays(true)}>
              Custom
            </Choice>
            {customDays && (
              <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Input type="number" min="1" autoFocus value={form.validityDays} onChange={(e) => set({ validityDays: Number(e.target.value) })} aria-label="Validity in days" className="h-9 w-20 text-right" />
                days
              </span>
            )}
          </div>
        </Field>
      </div>

      <Field label="Payment terms" data-path="paymentTerms" error={v.shown.paymentTerms} className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <Choice key={p} active={!customPay && form.paymentTerms === p} onClick={() => (setCustomPay(false), set({ paymentTerms: p }))}>
              {p}
            </Choice>
          ))}
          <Choice active={customPay} onClick={() => setCustomPay(true)}>
            Custom
          </Choice>
        </div>
        {customPay && <Input autoFocus value={form.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder="e.g. 40% advance, 60% within 15 days of delivery" className="mt-2" />}
      </Field>

      {/* WHO QUOTED IT, on the sheet the customer keeps. Prefilled with the
          signed-in user's name on a new quotation, never re-stamped on edit,
          and editable either way. */}
      <div className="mt-4 grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <Field label="Seller on the quotation">
          <Input value={form.sellerName || ""} onChange={(e) => set({ sellerName: e.target.value })} placeholder="Enter seller name" />
        </Field>
        <label className="squircle flex h-[45px] items-center gap-3 rounded-[16px] bg-muted px-4 text-[13px] font-medium text-foreground">
          <Switch checked={form.showSeller !== false} onChange={(on) => set({ showSeller: on })} label="Print seller name on the PDF" />
          Print seller name on the PDF
        </label>
      </div>

      <div className="mt-5 border-t border-border pt-1">
        <Tabs
          items={[
            { value: "terms", label: "Terms and conditions", count: count(form.terms) },
            { value: "notes", label: "Note under totals", count: count(form.notes) },
          ]}
          value={tab}
          onChange={setTab}
          className="mb-3"
        />
        {tab === "terms" ? (
          <Field data-path="terms" warning={v.shownWarnings.terms} hint="One clause per line, printed at the foot of the PDF">
            <ListTextarea
              ai={{
                purpose: "Terms and conditions printed at the foot of a sales quotation from Ortex Industries: validity, payment, artwork approval, production and delivery, one term per line",
                context: () => ({ validityDays: form.validityDays, validUntil, paymentTerms: form.paymentTerms, items }),
                format: "lines",
                maxChars: 900,
              }}
              value={form.terms}
              onChange={(e) => set({ terms: e.target.value })}
              placeholder="Enter terms and conditions"
              className="min-h-[150px]"
            />
          </Field>
        ) : (
          <Field data-path="notes" warning={v.shownWarnings.notes} hint="Printed under the totals">
            <ListTextarea
              ai={{
                format: "paragraph",
                purpose: "Short note printed under the totals of a sales quotation, for example what is included, a free mockup offer or a thank you",
                context: () => ({ validUntil, paymentTerms: form.paymentTerms, items }),
                maxChars: 300,
              }}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Enter notes"
              className="min-h-[100px]"
            />
          </Field>
        )}
      </div>
    </section>
  )
}
