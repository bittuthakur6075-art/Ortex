import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ArrowUp, Trash2 } from "../../components/ui/Icons"
import { Banner, Button, Card, CardHeader, Field, Input, PageLoader, Select, Textarea } from "../../components/ui/Ui"
import { DEFAULT_PAYROLL_SETTINGS } from "../../lib/payroll"
import { getPayrollSettings, savePayrollSettings } from "../../services/payroll"
import { useReportUnsaved } from "../../hooks/useUnsaved"
import { Check, LoadError } from "./setup/common"

// Payroll → Settings, the Super Admin's: the name and address on payslips,
// the pay schedule (salary basis, pay day, overtime) and the bank file. Every
// card saves on its own; the database refuses these writes from anyone but the
// Super Admin (payroll_settings).

const BANK_COLUMNS = {
  mode: "Mode (NEFT / IFT)",
  debit_account: "Debit account",
  beneficiary_name: "Beneficiary name",
  account_number: "Account number",
  ifsc: "IFSC",
  amount: "Amount",
  date: "Date",
  narration: "Narration",
  email: "Email",
}

export default function PayrollSettings() {
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setSettings(await getPayrollSettings())
      setError(null)
    } catch (e) {
      setError(e)
      setSettings(DEFAULT_PAYROLL_SETTINGS)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const save = async (patch, label) => {
    try {
      setSettings(await savePayrollSettings(patch))
      toast.success(`${label} saved`)
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (!settings) return <Card className="p-6"><PageLoader /></Card>

  return (
    <div className="space-y-5">
      <LoadError error={error} />
      <Banner tone="info">Only a Super Admin can change these. A change applies to pay runs calculated after it.</Banner>
      <Organisation settings={settings} onSave={save} />
      <Schedule settings={settings} onSave={save} />
      <BankFile settings={settings} onSave={save} />
    </div>
  )
}

function useDraft(value) {
  // Keyed on the content: a fallback `{}` is a new object on every render.
  const sig = JSON.stringify(value)
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(JSON.parse(sig)), [sig])
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }))
  const dirty = JSON.stringify(draft) !== sig
  useReportUnsaved(dirty)
  return [draft, set, dirty, setDraft]
}

function SaveButton({ dirty, onClick, busy }) {
  return (
    <Button size="sm" onClick={onClick} disabled={!dirty || busy}>
      {busy ? "Saving…" : dirty ? "Save" : "Saved"}
    </Button>
  )
}

// ---- organisation -----------------------------------------------------------------------------

function Organisation({ settings, onSave }) {
  const [d, set, dirty] = useDraft(settings.organisation || {})
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    await onSave({ organisation: d }, "Organisation")
    setBusy(false)
  }
  return (
    <Card>
      <CardHeader
        title="Organisation"
        description="Printed on payslips."
        action={<SaveButton dirty={dirty} busy={busy} onClick={submit} />}
      />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2">
        <Field label="Legal name">
          <Input id="org-name" value={d.name || ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Address" className="md:col-span-2">
          <Textarea id="org-address" value={d.address || ""} onChange={(e) => set("address", e.target.value)} rows={2} />
        </Field>
      </div>
    </Card>
  )
}

// ---- schedule ---------------------------------------------------------------------------------

function Schedule({ settings, onSave }) {
  const [d, set, dirty] = useDraft(settings.schedule || DEFAULT_PAYROLL_SETTINGS.schedule)
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const payDay = Math.min(28, Math.max(1, Number(d.payDay) || 7))
    setBusy(true)
    await onSave({ schedule: { ...d, payDay, fixedDays: Number(d.fixedDays) || 26 } }, "Pay schedule")
    setBusy(false)
  }
  return (
    <Card>
      <CardHeader title="Pay schedule" action={<SaveButton dirty={dirty} busy={busy} onClick={submit} />} />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-3">
        <Field label="Calculate salary on">
          <Select value={d.basis} onChange={(e) => set("basis", e.target.value)}>
            <option value="actual">Actual days in the month</option>
            <option value="fixed">A fixed number of days</option>
          </Select>
        </Field>
        {d.basis === "fixed" && (
          <Field label="Days in a pay month">
            <Select value={String(d.fixedDays)} onChange={(e) => set("fixedDays", Number(e.target.value))}>
              <option value="26">26 days</option>
              <option value="30">30 days</option>
            </Select>
          </Field>
        )}
        <Field label="Pay day" hint="Day of the following month. The Code on Wages requires pay by the 7th.">
          <Input id="sched-payday" type="number" min={1} max={28} value={d.payDay} onChange={(e) => set("payDay", e.target.value)} />
        </Field>
        <p className="text-[13px] text-muted-foreground md:col-span-3">
          {d.basis === "fixed"
            ? `A month's pay covers ${d.fixedDays} days; each unpaid day costs 1/${d.fixedDays} of the monthly salary. Common in factories.`
            : "A month's pay covers every day of that month; each unpaid day costs 1/30 of September, 1/31 of October. The easiest to defend, because pay is exactly in proportion."}{" "}
          Daily wages are paid per day worked either way.
        </p>
        <div className="md:col-span-3">
          <Check
            id="sched-overtime"
            checked={d.payOvertime !== false}
            onChange={(v) => set("payOvertime", v)}
            label="Pay overtime automatically"
            hint="Each overtime hour from attendance is paid at the normal rate: one day's pay (a monthly salary over the basis days, or the daily rate) divided by the shift's hours, on holidays and weekly offs too. On a pay run, payroll can enter an amount instead for anyone."
          />
        </div>
      </div>
    </Card>
  )
}

// ---- bank file -------------------------------------------------------------------------------------------

function BankFile({ settings, onSave }) {
  const [d, set, dirty] = useDraft(settings.bank || DEFAULT_PAYROLL_SETTINGS.bank || {})
  const [busy, setBusy] = useState(false)
  const cols = d.columns?.length ? d.columns : Object.keys(BANK_COLUMNS)
  const unused = Object.keys(BANK_COLUMNS).filter((k) => !cols.includes(k))

  const move = (i, dir) => {
    const next = [...cols]
    const j = i + dir
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    set("columns", next)
  }

  const submit = async () => {
    if (d.debitIfsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.debitIfsc)) return toast.error("That IFSC is not valid (like HDFC0001234)")
    setBusy(true)
    await onSave({ bank: { ...d, columns: cols } }, "Bank file")
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader
        title="Bank file"
        description="The bulk-transfer CSV for your bank's NEFT upload. Match the column order to your bank's format."
        action={<SaveButton dirty={dirty} busy={busy} onClick={submit} />}
      />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2">
        <Field label="Debit account number">
          <Input id="bank-debit" value={d.debitAccount || ""} onChange={(e) => set("debitAccount", e.target.value.replace(/\s/g, ""))} />
        </Field>
        <Field label="Debit account IFSC">
          <Input id="bank-ifsc" value={d.debitIfsc || ""} onChange={(e) => set("debitIfsc", e.target.value.toUpperCase())} placeholder="HDFC0001234" />
        </Field>
        <Field label="Bank">
          <Input id="bank-name" value={d.bankName || ""} onChange={(e) => set("bankName", e.target.value)} />
        </Field>
        <Field label="Narration" hint="The month is added, e.g. Salary Sep 2026.">
          <Input id="bank-narration" value={d.narration || ""} onChange={(e) => set("narration", e.target.value)} />
        </Field>
        <div className="md:col-span-2">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Column order</span>
          <ol className="divide-y divide-border rounded-lg border border-border">
            {cols.map((c, i) => (
              <li key={c} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-foreground">
                  <span className="mr-2 text-xs text-muted-foreground">{i + 1}</span>
                  {BANK_COLUMNS[c] || c}
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon aria-label={`Move ${BANK_COLUMNS[c]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" icon aria-label={`Move ${BANK_COLUMNS[c]} down`} disabled={i === cols.length - 1} onClick={() => move(i, 1)}>
                    <ArrowUp className="h-4 w-4 rotate-180" />
                  </Button>
                  <Button size="sm" variant="ghost" icon aria-label={`Remove ${BANK_COLUMNS[c]}`} onClick={() => set("columns", cols.filter((x) => x !== c))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          {unused.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {unused.map((c) => (
                <button key={c} type="button" onClick={() => set("columns", [...cols, c])} className="rounded-btn border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-subtle">
                  + {BANK_COLUMNS[c]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
