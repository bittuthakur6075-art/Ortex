import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowUp, Pencil, Plus, Trash2 } from "../../components/ui/Icons"
import { Badge, Banner, Button, Card, CardHeader, Field, Input, Modal, PageLoader, Select, Textarea } from "../../components/ui/Ui"
import { DEFAULT_PAYROLL_SETTINGS, structureFromCtc } from "../../lib/payroll"
import {
  deleteTemplate,
  getPayrollSettings,
  listComponents,
  listTemplates,
  saveComponent,
  savePayrollSettings,
  saveTemplate,
} from "../../services/payroll"
import { Check, LoadError } from "./setup/common"
import { money, thisMonthIST } from "./setup/helpers"

// Payroll → Settings, the Super Admin's (Zoho Payroll's Settings): the
// organisation's statutory IDs, the pay schedule, EPF / ESI / LWF / PT / TDS,
// the deduction cap, salary components and templates, and the bank file.
// Every card saves on its own; the database refuses these writes from anyone
// but the Super Admin (payroll_settings, salary_components, salary_templates).

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

const CALC_LABEL = {
  pct_ctc: "% of CTC",
  pct_basic: "% of Basic",
  flat: "Flat amount (monthly)",
  balance: "Balance (whatever is left of the CTC)",
  variable: "Variable (entered in the pay run)",
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
      <Banner tone="info">Only you, the Super Admin, can change these. A change applies to pay runs calculated after it.</Banner>
      <Organisation settings={settings} onSave={save} />
      <Schedule settings={settings} onSave={save} />
      <Statutory settings={settings} onSave={save} />
      <Components />
      <Templates settings={settings} />
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
    await onSave({ organisation: { ...d, pan: (d.pan || "").toUpperCase(), tan: (d.tan || "").toUpperCase() } }, "Organisation")
    setBusy(false)
  }
  return (
    <Card>
      <CardHeader
        title="Organisation"
        description="Printed on payslips and statutory files."
        action={<SaveButton dirty={dirty} busy={busy} onClick={submit} />}
      />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 md:grid-cols-2">
        <Field label="Legal name">
          <Input id="org-name" value={d.name || ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="PAN" hint="The company's PAN, 10 characters.">
          <Input id="org-pan" value={d.pan || ""} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
        </Field>
        <Field label="TAN" hint="Tax deduction account number, for TDS.">
          <Input id="org-tan" value={d.tan || ""} onChange={(e) => set("tan", e.target.value.toUpperCase())} placeholder="DELA12345B" />
        </Field>
        <Field label="PF establishment code">
          <Input id="org-pf" value={d.pfCode || ""} onChange={(e) => set("pfCode", e.target.value)} placeholder="DLCPM0012345000" />
        </Field>
        <Field label="ESI employer code">
          <Input id="org-esi" value={d.esiCode || ""} onChange={(e) => set("esiCode", e.target.value)} />
        </Field>
        <Field label="LWF registration">
          <Input id="org-lwf" value={d.lwfReg || ""} onChange={(e) => set("lwfReg", e.target.value)} />
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
            : "A month's pay covers every day of that month; each unpaid day costs 1/30 of September, 1/31 of October. The easiest to defend, because pay is exactly in proportion."}
        </p>
      </div>
    </Card>
  )
}

// ---- statutory ----------------------------------------------------------------------------------

function Statutory({ settings, onSave }) {
  const base = useMemo(
    () => ({
      epf: settings.epf,
      esi: settings.esi,
      lwf: settings.lwf,
      pt: settings.pt,
      tds: settings.tds,
      deductionCapPct: settings.deductionCapPct,
    }),
    [settings],
  )
  const [d, , dirty, setD] = useDraft(base)
  const [busy, setBusy] = useState(false)
  const setIn = (block, k, v) => setD((x) => ({ ...x, [block]: { ...x[block], [k]: v } }))
  const ceilings = [...(d.epf.ceilings || [])].sort((a, b) => (a.from < b.from ? -1 : 1))
  const [newCeiling, setNewCeiling] = useState({ from: "", amount: "" })

  const addCeiling = () => {
    const amount = Number(newCeiling.amount)
    if (!newCeiling.from || !(amount > 0)) return toast.error("Give the date it takes effect and the amount")
    if (ceilings.some((c) => c.from === newCeiling.from)) return toast.error("There is already a ceiling from that date")
    setIn("epf", "ceilings", [...ceilings, { from: newCeiling.from, amount }])
    setNewCeiling({ from: "", amount: "" })
  }

  const submit = async () => {
    if (!ceilings.length) return toast.error("Keep at least one PF ceiling")
    setBusy(true)
    await onSave(
      {
        ...d,
        epf: { ...d.epf, ceilings },
        deductionCapPct: Math.min(100, Math.max(1, Number(d.deductionCapPct) || 50)),
        esi: { ...d.esi, grossCeiling: Number(d.esi.grossCeiling) || 21000 },
        lwf: { ...d.lwf, employee: Number(d.lwf.employee) || 0, employer: Number(d.lwf.employer) || 0 },
      },
      "Statutory components",
    )
    setBusy(false)
  }

  const months = d.lwf.months || []
  const toggleMonth = (m) => setIn("lwf", "months", months.includes(m) ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b))
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

  return (
    <Card>
      <CardHeader
        title="Statutory components"
        description="EPF, ESI, Labour Welfare Fund, professional tax and TDS."
        action={<SaveButton dirty={dirty} busy={busy} onClick={submit} />}
      />
      <div className="space-y-6 px-5 pb-5">
        {/* EPF */}
        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Employees' Provident Fund</h4>
          <Check id="epf-on" checked={d.epf.enabled} onChange={(v) => setIn("epf", "enabled", v)} label="Deduct EPF" hint="Required once the establishment has 20 or more employees." />
          <p className="text-[13px] text-muted-foreground">
            Employee 12% and employer 12% of PF wages; 8.33% of the employer's share goes to the pension scheme (EPS) and
            is always on wages up to the ceiling. EDLI and admin charges are 0.5% each. These rates are set by law.
          </p>
          <Check
            id="epf-restrict"
            checked={d.epf.restrictToCeiling}
            onChange={(v) => setIn("epf", "restrictToCeiling", v)}
            label="Restrict PF wages to the ceiling"
            hint="Contribute on wages up to the ceiling only, not on the full basic."
          />
          <Check
            id="epf-ctc"
            checked={d.epf.includeEmployerInCtc}
            onChange={(v) => setIn("epf", "includeEmployerInCtc", v)}
            label="Include the employer's contribution in CTC"
            hint="The fixed allowance then balances the CTC after the employer's PF."
          />
          <Banner tone="warning">
            The Cabinet approved ₹25,000 on 16 Sep 2026. Add it here with its effective date once EPFO notifies it; until then ₹15,000 applies.
          </Banner>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>In force from</th>
                  <th>PF wage ceiling</th>
                  <th className="w-16" />
                </tr>
              </thead>
              <tbody className="mt-body">
                {ceilings.map((c) => (
                  <tr key={c.from}>
                    <td className="text-foreground">{c.from}</td>
                    <td className="tabular text-foreground">{money(c.amount)} a month</td>
                    <td>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        aria-label={`Remove the ceiling from ${c.from}`}
                        disabled={ceilings.length === 1}
                        onClick={() => setIn("epf", "ceilings", ceilings.filter((x) => x.from !== c.from))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From">
              <Input id="ceil-from" type="date" value={newCeiling.from} onChange={(e) => setNewCeiling((x) => ({ ...x, from: e.target.value }))} />
            </Field>
            <Field label="Ceiling (₹ a month)">
              <Input id="ceil-amount" type="number" min={1} value={newCeiling.amount} onChange={(e) => setNewCeiling((x) => ({ ...x, amount: e.target.value }))} placeholder="25000" />
            </Field>
            <Button size="md" variant="outline" onClick={addCeiling}>
              <Plus className="h-4 w-4" /> Add ceiling
            </Button>
          </div>
        </section>

        {/* ESI */}
        <section className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-semibold text-foreground">Employees' State Insurance</h4>
          <Check id="esi-on" checked={d.esi.enabled} onChange={(v) => setIn("esi", "enabled", v)} label="Deduct ESI" hint="Required once the establishment has 10 or more employees." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Employee rate">
              <Input id="esi-ee" value={`${d.esi.employeeRate}%`} disabled />
            </Field>
            <Field label="Employer rate">
              <Input id="esi-er" value={`${d.esi.employerRate}%`} disabled />
            </Field>
            <Field label="Applies up to a monthly gross of" hint="Checked at the start of each contribution period (April, October).">
              <Input id="esi-ceiling" type="number" value={d.esi.grossCeiling} onChange={(e) => setIn("esi", "grossCeiling", e.target.value)} />
            </Field>
          </div>
        </section>

        {/* LWF */}
        <section className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-semibold text-foreground">Labour Welfare Fund (Delhi)</h4>
          <Check id="lwf-on" checked={d.lwf.enabled} onChange={(v) => setIn("lwf", "enabled", v)} label="Deduct LWF" hint="Delhi Labour Welfare Board: paid twice a year, before 15 July and 15 January." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Employee (₹)">
              <Input id="lwf-ee" type="number" step="0.01" value={d.lwf.employee} onChange={(e) => setIn("lwf", "employee", e.target.value)} />
            </Field>
            <Field label="Employer (₹)">
              <Input id="lwf-er" type="number" step="0.01" value={d.lwf.employer} onChange={(e) => setIn("lwf", "employer", e.target.value)} />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Deducted in</span>
            <div className="flex flex-wrap gap-1.5">
              {MONTH_NAMES.map((n, i) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => toggleMonth(i + 1)}
                  className={`rounded-btn border px-2.5 py-1 text-xs font-medium ${months.includes(i + 1) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-subtle"}`}
                  aria-pressed={months.includes(i + 1)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* PT */}
        <section className="space-y-2 border-t border-border pt-5">
          <h4 className="text-sm font-semibold text-foreground">Professional tax</h4>
          <Check id="pt-on" checked={false} onChange={() => {}} disabled label="Deduct professional tax" hint="Delhi has no professional tax." />
        </section>

        {/* TDS + cap */}
        <section className="space-y-3 border-t border-border pt-5">
          <h4 className="text-sm font-semibold text-foreground">Income tax (TDS) and deductions</h4>
          <Check id="tds-on" checked={d.tds.enabled} onChange={(v) => setIn("tds", "enabled", v)} label="Deduct TDS on salary" hint="Projected over the financial year and recalculated every month." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Default tax regime" hint="The new regime is the default; an employee can choose the old one.">
              <Select value={d.tds.defaultRegime} onChange={(e) => setIn("tds", "defaultRegime", e.target.value)}>
                <option value="new">New regime</option>
                <option value="old">Old regime</option>
              </Select>
            </Field>
            <Field label="Deductions cap (% of wages)" hint="Code on Wages s.18: total deductions may not exceed half the wages. Loans and one-time recoveries carry forward.">
              <Input id="cap" type="number" min={1} max={100} value={d.deductionCapPct} onChange={(e) => setD((x) => ({ ...x, deductionCapPct: e.target.value }))} />
            </Field>
          </div>
        </section>
      </div>
    </Card>
  )
}

// ---- salary components ---------------------------------------------------------------------------

const LOCKED = new Set(["BASIC", "FIXED"])

function Components() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      setRows(await listComponents())
      setError(null)
    } catch (e) {
      setError(e)
      setRows([])
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Salary components"
        description="Earnings and deductions that can appear on a payslip."
        action={<Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add component</Button>}
      />
      <div className="px-5"><LoadError error={error} /></div>
      {rows === null ? (
        <div className="p-6"><PageLoader /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Name</th>
                <th>Code</th>
                <th>Type</th>
                <th>Calculation</th>
                <th>Taxable</th>
                <th>Counts as wages</th>
                <th>Status</th>
                <th className="w-14" />
              </tr>
            </thead>
            <tbody className="mt-body">
              {rows.map((c) => (
                <tr key={c.code}>
                  <td className="font-medium text-foreground">{c.name}</td>
                  <td className="text-muted-foreground">{c.code}</td>
                  <td className="capitalize text-muted-foreground">{c.kind}</td>
                  <td className="text-muted-foreground">
                    {CALC_LABEL[c.calc]}
                    {["pct_ctc", "pct_basic"].includes(c.calc) ? `: ${Number(c.value)}%` : c.calc === "flat" ? `: ${money(c.value)}` : ""}
                  </td>
                  <td>{c.taxable ? <Badge tone="amber">Taxable</Badge> : <Badge tone="slate">Not taxable</Badge>}</td>
                  <td>{c.in_wages ? <Badge tone="blue">Wages</Badge> : <Badge tone="outline">Excluded</Badge>}</td>
                  <td>{c.active ? <Badge tone="emerald">Active</Badge> : <Badge tone="slate">Off</Badge>}</td>
                  <td>
                    <Button size="sm" variant="ghost" icon aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ComponentEditor
          component={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </Card>
  )
}

function ComponentEditor({ component, onClose, onSaved }) {
  const isNew = !component
  const locked = !isNew && LOCKED.has(component.code)
  const [c, setC] = useState(
    component || { code: "", name: "", kind: "earning", calc: "flat", value: 0, taxable: true, in_wages: false, show_in_payslip: true, active: true, sort: 50 },
  )
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }))

  const save = async () => {
    const code = String(c.code || "").toUpperCase().trim()
    if (!/^[A-Z][A-Z0-9_]{1,15}$/.test(code)) return toast.error("A code is 2 to 16 capital letters, digits or _, starting with a letter")
    if (!c.name.trim()) return toast.error("Give the component a name")
    setBusy(true)
    try {
      await saveComponent({ ...c, code, value: Number(c.value) || 0, active: locked ? true : c.active })
      toast.success(isNew ? "Component added" : "Component saved")
      onSaved()
    } catch (e) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "Add salary component" : `Edit ${component.name}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save component"}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <Input id="comp-name" value={c.name} onChange={(e) => set("name", e.target.value)} placeholder="Medical allowance" />
        </Field>
        <Field label="Code" required hint={isNew ? "Short and permanent, e.g. MEDICAL." : "Codes cannot be changed."}>
          <Input id="comp-code" value={c.code} disabled={!isNew} onChange={(e) => set("code", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Type">
          <Select value={c.kind} onChange={(e) => set("kind", e.target.value)} disabled={locked}>
            <option value="earning">Earning</option>
            <option value="deduction">Deduction</option>
            <option value="reimbursement">Reimbursement</option>
          </Select>
        </Field>
        <Field label="Calculation">
          <Select value={c.calc} onChange={(e) => set("calc", e.target.value)} disabled={locked}>
            {Object.entries(CALC_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </Field>
        {["pct_ctc", "pct_basic", "flat"].includes(c.calc) && (
          <Field label={c.calc === "flat" ? "Amount (₹ a month)" : "Percentage"}>
            <Input id="comp-value" type="number" step="0.01" value={c.value} onChange={(e) => set("value", e.target.value)} />
          </Field>
        )}
        <div className="space-y-2.5 sm:col-span-2">
          <Check id="comp-taxable" checked={c.taxable} onChange={(v) => set("taxable", v)} label="Taxable" hint="Counts toward income for TDS." />
          <Check
            id="comp-wages"
            checked={c.in_wages}
            onChange={(v) => set("in_wages", v)}
            label="Counts as wages under the Code on Wages"
            hint="Basic, DA and allowances not on the excluded list (HRA, conveyance, bonus, overtime are excluded). Wages are the PF base."
          />
          <Check id="comp-show" checked={c.show_in_payslip} onChange={(v) => set("show_in_payslip", v)} label="Show on the payslip" />
          <Check
            id="comp-active"
            checked={locked ? true : c.active}
            disabled={locked}
            onChange={(v) => set("active", v)}
            label="Active"
            hint={locked ? "Basic and the fixed allowance are always on: every template needs them." : undefined}
          />
        </div>
      </div>
    </Modal>
  )
}

// ---- salary templates -------------------------------------------------------------------------------

function Templates({ settings }) {
  const [rows, setRows] = useState(null)
  const [components, setComponents] = useState([])
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      const [t, c] = await Promise.all([listTemplates(), listComponents()])
      setRows(t)
      setComponents(c)
      setError(null)
    } catch (e) {
      setError(e)
      setRows([])
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const remove = async (t) => {
    if (!window.confirm(`Delete the "${t.name}" template? Salaries already set from it keep their figures.`)) return
    try {
      await deleteTemplate(t.id)
      toast.success("Template deleted")
      void load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Salary templates"
        description="How an annual CTC is split into monthly components. The fixed allowance balances it."
        action={<Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New template</Button>}
      />
      <div className="px-5"><LoadError error={error} /></div>
      {rows === null ? (
        <div className="p-6"><PageLoader /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Template</th>
                <th>Components</th>
                <th>Status</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody className="mt-body">
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="font-medium text-foreground">{t.name}</div>
                    {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                  </td>
                  <td className="text-muted-foreground">{(t.items || []).map((i) => i.name).join(", ")}</td>
                  <td>{t.active ? <Badge tone="emerald">Active</Badge> : <Badge tone="slate">Off</Badge>}</td>
                  <td>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" icon aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" icon aria-label={`Delete ${t.name}`} onClick={() => remove(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <TemplateEditor
          template={editing === "new" ? null : editing}
          components={components}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load()
          }}
        />
      )}
    </Card>
  )
}

function TemplateEditor({ template, components, settings, onClose, onSaved }) {
  const earnings = components.filter((c) => c.kind === "earning" && c.active && c.calc !== "variable")
  const [name, setName] = useState(template?.name || "")
  const [description, setDescription] = useState(template?.description || "")
  const [active, setActive] = useState(template?.active ?? true)
  const [items, setItems] = useState(
    template?.items ||
      earnings
        .filter((c) => ["BASIC", "HRA", "CONV", "FIXED"].includes(c.code))
        .map(({ code, name: n, kind, calc, value, taxable, in_wages }) => ({ code, name: n, kind, calc, value: Number(value), taxable, in_wages })),
  )
  const [sample, setSample] = useState(360000)
  const [busy, setBusy] = useState(false)

  const balances = items.filter((i) => i.calc === "balance").length
  const preview = useMemo(() => {
    try {
      return structureFromCtc({ annualCtc: Number(sample) || 0, template: items, month: `${thisMonthIST()}-01`, settings })
    } catch {
      return null
    }
  }, [items, sample, settings])

  const add = (code) => {
    const c = earnings.find((x) => x.code === code)
    if (!c || items.some((i) => i.code === code)) return
    setItems((xs) => [...xs, { code: c.code, name: c.name, kind: c.kind, calc: c.calc, value: Number(c.value), taxable: c.taxable, in_wages: c.in_wages }])
  }
  const update = (code, k, v) => setItems((xs) => xs.map((i) => (i.code === code ? { ...i, [k]: v } : i)))
  const remove = (code) => setItems((xs) => xs.filter((i) => i.code !== code))

  const save = async () => {
    if (!name.trim()) return toast.error("Name the template")
    if (!items.some((i) => i.code === "BASIC")) return toast.error("A template needs Basic")
    if (balances !== 1) return toast.error("Exactly one component must be the balance (usually the fixed allowance)")
    setBusy(true)
    try {
      await saveTemplate({
        ...(template?.id ? { id: template.id } : {}),
        name: name.trim(),
        description: description.trim() || null,
        active,
        items: items.map((i) => ({ ...i, value: Number(i.value) || 0 })),
      })
      toast.success(template ? "Template saved" : "Template created")
      onSaved()
    } catch (e) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  const unused = earnings.filter((c) => !items.some((i) => i.code === c.code))
  const monthlyCtc = (Number(sample) || 0) / 12

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-3xl"
      title={template ? `Edit ${template.name}` : "New salary template"}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save template"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name" required>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard" />
          </Field>
          <Field label="Description">
            <Input id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <Check id="tpl-active" checked={active} onChange={setActive} label="Active" hint="Only active templates are offered when setting a salary." />

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Component</th>
                <th>Calculation</th>
                <th>Value</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="mt-body">
              {items.map((i) => (
                <tr key={i.code}>
                  <td className="font-medium text-foreground">{i.name}</td>
                  <td>
                    <Select value={i.calc} onChange={(e) => update(i.code, "calc", e.target.value)}>
                      {["pct_ctc", "pct_basic", "flat", "balance"].map((k) => (
                        <option key={k} value={k}>{CALC_LABEL[k]}</option>
                      ))}
                    </Select>
                  </td>
                  <td>
                    {i.calc === "balance" ? (
                      <span className="text-muted-foreground">Balance</span>
                    ) : (
                      <Input id={`tpl-val-${i.code}`} type="number" step="0.01" value={i.value} onChange={(e) => update(i.code, "value", e.target.value)} />
                    )}
                  </td>
                  <td>
                    <Button size="sm" variant="ghost" icon aria-label={`Remove ${i.name}`} disabled={i.code === "BASIC"} onClick={() => remove(i.code)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unused.length > 0 && (
          <Field label="Add a component">
            <Select value="" placeholder="Choose a component" onChange={(e) => add(e.target.value)}>
              {unused.map((c) => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {balances !== 1 && <Banner tone="warning">Exactly one component must be the balance. It absorbs whatever the CTC leaves.</Banner>}

        <div className="rounded-lg bg-subtle p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">Example breakup</span>
            <Field label="Annual CTC" className="w-48">
              <Input id="tpl-sample" type="number" value={sample} onChange={(e) => setSample(e.target.value)} />
            </Field>
          </div>
          {preview && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 font-medium">Component</th>
                  <th className="py-1 text-right font-medium">Monthly</th>
                  <th className="py-1 text-right font-medium">Annual</th>
                </tr>
              </thead>
              <tbody>
                {preview.earnings.map((e) => (
                  <tr key={e.code}>
                    <td className="py-1 text-foreground">{e.name}</td>
                    <td className="tabular py-1 text-right text-foreground">{money(e.amount)}</td>
                    <td className="tabular py-1 text-right text-muted-foreground">{money(e.amount * 12)}</td>
                  </tr>
                ))}
                {preview.employerPfInCtc > 0 && (
                  <tr>
                    <td className="py-1 text-muted-foreground">Employer PF (inside CTC)</td>
                    <td className="tabular py-1 text-right text-muted-foreground">{money(preview.employerPfInCtc)}</td>
                    <td className="tabular py-1 text-right text-muted-foreground">{money(preview.employerPfInCtc * 12)}</td>
                  </tr>
                )}
                <tr className="border-t border-border font-semibold">
                  <td className="py-1.5 text-foreground">Cost to company</td>
                  <td className="tabular py-1.5 text-right text-foreground">{money(preview.gross + preview.employerPfInCtc)}</td>
                  <td className="tabular py-1.5 text-right text-foreground">{money((preview.gross + preview.employerPfInCtc) * 12)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {preview && Math.abs(preview.gross + preview.employerPfInCtc - monthlyCtc) > 1 && (
            <p className="mt-2 text-xs text-warning-text">
              The components add up to more than the CTC: the fixed parts leave nothing for the balance. Lower a percentage or a flat amount.
            </p>
          )}
          {preview && Math.abs(preview.gross + preview.employerPfInCtc - monthlyCtc) <= 1 && (
            <p className="mt-2 text-xs text-success-text">= CTC {money(monthlyCtc)} a month.</p>
          )}
        </div>
      </div>
    </Modal>
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
