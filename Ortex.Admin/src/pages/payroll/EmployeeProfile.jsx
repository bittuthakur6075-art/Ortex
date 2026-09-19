import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, Eye, EyeOff, IndianRupee, Plus, Trash2, Wallet } from "../../components/ui/Icons"
import { EditorHeader, Section, Tile, Tiles } from "../../components/editors/DocumentEditorShell"
import { Avatar, Badge, Banner, Button, Card, Field, Input, Modal, PageLoader, Select, Textarea } from "../../components/ui/Ui"
import { structureFromCtc } from "../../lib/payroll"
import {
  addRevision,
  deleteRevision,
  getEmployee,
  getPayrollSettings,
  listLoans,
  listTemplates,
  revealSecrets,
  revisionFor,
  saveEmployee,
} from "../../services/payroll"
import { Check, LoadError } from "./setup/common"
import { IFSC_RE, PAN_RE, dateLabel, fromMonthInput, missingFor, money, monthLabel, thisMonthIST, toMonthInput } from "./setup/helpers"

// A person's pay profile (Zoho Payroll's employee page): basic details,
// statutory flags, personal and payment details, salary with its revisions,
// exit, and their loans. Each section saves on its own and sends only the
// fields that changed; PAN and the account number go only when typed, and the
// database encrypts them (payroll_employee_save, migration 0040).

const BASIC = ["employee_code", "doj", "designation", "department", "work_location", "employment_type", "notes"]
const STATUTORY = ["pf_enabled", "uan", "esi_enabled", "esi_ip", "lwf_enabled", "tds_enabled", "tax_regime", "tax_deductions"]
const PERSONAL = ["dob", "gender", "father_name"]
const PAYMENT = ["pay_mode", "bank_name", "ifsc", "account_holder"]
const EXIT = ["status", "exit_date", "exit_reason"]

const EMPTY = {
  employment_type: "monthly",
  pay_mode: "bank",
  pf_enabled: true,
  esi_enabled: false,
  lwf_enabled: true,
  tds_enabled: true,
  tax_regime: "new",
  tax_deductions: 0,
  status: "active",
}

const norm = (v) => (v === null || v === undefined ? "" : v)

export default function EmployeeProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [person, setPerson] = useState(undefined)
  const [settings, setSettings] = useState(null)
  const [templates, setTemplates] = useState([])
  const [loans, setLoans] = useState([])
  const [error, setError] = useState(null)
  const [revising, setRevising] = useState(Boolean(location.state?.revise))

  const load = useCallback(async () => {
    try {
      const [p, s, t, l] = await Promise.all([getEmployee(id), getPayrollSettings(), listTemplates(), listLoans()])
      setPerson(p)
      setSettings(s)
      setTemplates(t)
      setLoans(l.filter((x) => x.user_id === id))
      setError(null)
    } catch (e) {
      setError(e)
      setPerson(null)
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  const back = () => navigate("/payroll?tab=employees")

  if (person === undefined) return <Card className="p-6"><PageLoader /></Card>
  if (!person) {
    return (
      <div>
        <EditorHeader onBack={back} backLabel="Back to employees" title="Employee" />
        <LoadError error={error} />
        {!error && <Banner tone="warning">No one with that id has a login.</Banner>}
      </div>
    )
  }

  const e = { ...EMPTY, ...(person.employee || {}) }
  const month = `${thisMonthIST()}-01`
  const current = revisionFor(person.revisions, month)
  const upcoming = person.revisions.filter((r) => r.effective_from > month)
  const missing = missingFor(person)
  const loanBalance = loans.filter((l) => l.status !== "closed").reduce((s, l) => s + l.balance, 0)
  const save = async (fields, label) => {
    if (!Object.keys(fields).length) return true
    try {
      await saveEmployee(id, fields)
      toast.success(`${label} saved`)
      await load()
      return true
    } catch (err) {
      toast.error(err.message)
      return false
    }
  }

  const statusBadge =
    e.status === "active" ? <Badge tone="emerald">Active</Badge> : <Badge tone="slate">{e.status === "settled" ? "Settled" : "Exited"}</Badge>

  return (
    <div>
      <EditorHeader
        onBack={back}
        backLabel="Back to employees"
        title={
          <span className="flex items-center gap-3">
            <Avatar name={person.name || person.email} src={person.avatar_url} className="h-8 w-8" />
            {person.name || person.email}
          </span>
        }
        badge={statusBadge}
        meta={[e.designation, e.department, person.email].filter(Boolean).join(" · ")}
        actions={
          <Button size="md" onClick={() => setRevising(true)}>
            <IndianRupee className="h-4 w-4" /> {current || person.revisions.length ? "Revise salary" : "Add salary"}
          </Button>
        }
      />
      <LoadError error={error} />
      {missing.length > 0 && e.status === "active" && (
        <Banner tone="warning" className="mb-5">
          Missing before this person can be paid: {missing.join(", ")}.
        </Banner>
      )}

      <Tiles>
        <Tile icon={IndianRupee} label="Annual CTC" value={current ? money(current.annual_ctc) : "Not set"} sub={current ? `Since ${monthLabel(current.effective_from)}` : undefined} />
        <Tile icon={IndianRupee} tone="success" label="Monthly gross" value={current ? money(current.monthly_gross) : "Not set"} />
        <Tile icon={Wallet} tone="warning" label="Loan balance" value={money(loanBalance)} sub={`${loans.filter((l) => l.status !== "closed").length} open`} />
        <Tile icon={AlertTriangle} tone={missing.length ? "danger" : "slate"} label="Details" value={missing.length ? `${missing.length} missing` : "Complete"} />
      </Tiles>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <SalarySection
            person={person}
            current={current}
            upcoming={upcoming}
            onRevise={() => setRevising(true)}
            onChanged={load}
          />
          <BasicSection e={e} onSave={save} />
          <StatutorySection e={e} settings={settings} current={current} onSave={save} />
          <PaymentSection e={e} userId={id} onSave={save} />
        </div>
        <div className="space-y-5">
          <PersonalSection e={e} userId={id} onSave={save} />
          <LoansSection loans={loans} />
          <ExitSection e={e} onSave={save} />
        </div>
      </div>

      {revising && settings && (
        <ReviseModal
          person={person}
          employee={e}
          settings={settings}
          templates={templates.filter((t) => t.active)}
          onClose={() => setRevising(false)}
          onSaved={async () => {
            setRevising(false)
            await load()
          }}
        />
      )}
    </div>
  )
}

/** Draft of some employee fields, and the ones that differ from what is saved. */
function useFields(e, keys) {
  // Keyed on the values, not the object: `e` is rebuilt on every render.
  const sig = JSON.stringify(keys.map((k) => norm(e[k])))
  const base = useMemo(() => Object.fromEntries(keys.map((k, i) => [k, JSON.parse(sig)[i]])), [sig, keys])
  const [d, setD] = useState(base)
  useEffect(() => setD(base), [base])
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const changes = Object.fromEntries(keys.filter((k) => d[k] !== base[k]).map((k) => [k, d[k]]))
  return [d, set, changes, () => setD(base)]
}

function SaveBar({ changes, busy, onSave, onReset }) {
  const dirty = Object.keys(changes).length > 0
  return (
    <div className="flex gap-2">
      {dirty && <Button size="sm" variant="ghost" onClick={onReset}>Discard</Button>}
      <Button size="sm" disabled={!dirty || busy} onClick={onSave}>{busy ? "Saving…" : dirty ? "Save" : "Saved"}</Button>
    </div>
  )
}

function useSaver(onSave, label) {
  const [busy, setBusy] = useState(false)
  const run = async (fields) => {
    setBusy(true)
    const ok = await onSave(fields, label)
    setBusy(false)
    return ok
  }
  return [busy, run]
}

// ---- basic --------------------------------------------------------------------------------------------

function BasicSection({ e, onSave }) {
  const [d, set, changes, reset] = useFields(e, BASIC)
  const [busy, run] = useSaver(onSave, "Basic details")
  return (
    <Section
      title="Basic details"
      action={
        <SaveBar
          changes={changes}
          busy={busy}
          onSave={() => {
            // The database keeps the joining date once set; it cannot be blanked.
            const { doj, ...rest } = changes
            return run(doj ? changes : rest)
          }}
          onReset={reset}
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Employee code">
          <Input id="emp-code" value={d.employee_code} onChange={(x) => set("employee_code", x.target.value)} placeholder="ORT-014" />
        </Field>
        <Field label="Date of joining">
          <Input id="emp-doj" type="date" value={d.doj} onChange={(x) => set("doj", x.target.value)} />
        </Field>
        <Field label="Designation">
          <Input id="emp-desig" value={d.designation} onChange={(x) => set("designation", x.target.value)} />
        </Field>
        <Field label="Department">
          <Input id="emp-dept" value={d.department} onChange={(x) => set("department", x.target.value)} />
        </Field>
        <Field label="Work location">
          <Input id="emp-loc" value={d.work_location} onChange={(x) => set("work_location", x.target.value)} placeholder="Uttam Nagar factory" />
        </Field>
        <Field label="Paid">
          <Select value={d.employment_type} onChange={(x) => set("employment_type", x.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="daily">Daily wages</option>
          </Select>
        </Field>
        <Field label="Notes" className="md:col-span-2">
          <Textarea id="emp-notes" rows={2} value={d.notes} onChange={(x) => set("notes", x.target.value)} />
        </Field>
      </div>
    </Section>
  )
}

// ---- statutory ------------------------------------------------------------------------------------------

function StatutorySection({ e, settings, current, onSave }) {
  const [d, set, changes, reset] = useFields(e, STATUTORY)
  const [busy, run] = useSaver(onSave, "Statutory details")
  const esiCeiling = settings?.esi?.grossCeiling || 21000
  const gross = current ? Number(current.monthly_gross) : null

  const submit = () => {
    if (d.uan && !/^[0-9]{12}$/.test(d.uan)) return toast.error("A UAN is 12 digits")
    if (d.esi_ip && !/^[0-9]{10}$/.test(d.esi_ip)) return toast.error("An ESI IP number is 10 digits")
    const out = { ...changes }
    if ("tax_deductions" in out) out.tax_deductions = Number(out.tax_deductions) || 0
    return run(out)
  }

  return (
    <Section title="Statutory" description="PF, ESI, Labour Welfare Fund and income tax." action={<SaveBar changes={changes} busy={busy} onSave={submit} onReset={reset} />}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Check id="st-pf" checked={d.pf_enabled} onChange={(v) => set("pf_enabled", v)} label="Provident Fund" hint="12% of PF wages, matched by the company." />
          {d.pf_enabled && (
            <Field label="UAN" hint="Universal Account Number, 12 digits.">
              <Input id="st-uan" inputMode="numeric" value={d.uan} onChange={(x) => set("uan", x.target.value.replace(/\D/g, "").slice(0, 12))} />
            </Field>
          )}
        </div>
        <div className="space-y-3">
          <Check
            id="st-esi"
            checked={d.esi_enabled}
            onChange={(v) => set("esi_enabled", v)}
            label="ESI"
            hint={`For a monthly gross of ${money(esiCeiling)} or less at the start of the contribution period.${gross !== null ? ` Current gross: ${money(gross)}${gross > esiCeiling ? ", above the limit." : "."}` : ""}`}
          />
          {d.esi_enabled && (
            <Field label="ESI IP number" hint="Insurance number, 10 digits.">
              <Input id="st-ip" inputMode="numeric" value={d.esi_ip} onChange={(x) => set("esi_ip", x.target.value.replace(/\D/g, "").slice(0, 10))} />
            </Field>
          )}
        </div>
        <Check id="st-lwf" checked={d.lwf_enabled} onChange={(v) => set("lwf_enabled", v)} label="Labour Welfare Fund" hint="Delhi: deducted in June and December." />
        <Check id="st-tds" checked={d.tds_enabled} onChange={(v) => set("tds_enabled", v)} label="Deduct income tax (TDS)" />
        {d.tds_enabled && (
          <>
            <Field label="Tax regime">
              <Select value={d.tax_regime} onChange={(x) => set("tax_regime", x.target.value)}>
                <option value="new">New regime (default)</option>
                <option value="old">Old regime</option>
              </Select>
            </Field>
            {d.tax_regime === "old" && (
              <Field label="Declared deductions for the year (₹)" hint="80C, 80D, HRA exemption and the rest, as declared. Old regime only.">
                <Input id="st-ded" type="number" min={0} value={d.tax_deductions} onChange={(x) => set("tax_deductions", x.target.value)} />
              </Field>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

// ---- personal ---------------------------------------------------------------------------------------------

function PersonalSection({ e, userId, onSave }) {
  const [d, set, changes, reset] = useFields(e, PERSONAL)
  const [pan, setPan] = useState("")
  const [shown, setShown] = useState(null)
  const [busy, run] = useSaver(onSave, "Personal details")
  const all = pan ? { ...changes, pan } : changes

  const reveal = async () => {
    if (shown) return setShown(null)
    try {
      setShown(await revealSecrets(userId))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const submit = async () => {
    if (pan && !PAN_RE.test(pan)) return toast.error("That PAN is not valid (10 characters, like ABCDE1234F)")
    if (await run(all)) {
      setPan("")
      setShown(null)
    }
  }

  return (
    <Section title="Personal" action={<SaveBar changes={all} busy={busy} onSave={submit} onReset={() => { reset(); setPan("") }} />}>
      <div className="space-y-4">
        <Field label="Date of birth">
          <Input id="per-dob" type="date" value={d.dob} onChange={(x) => set("dob", x.target.value)} />
        </Field>
        <Field label="Gender">
          <Select value={d.gender} placeholder="Not set" onChange={(x) => set("gender", x.target.value)}>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Father's name" hint="Printed on the EPF and ESI forms.">
          <Input id="per-father" value={d.father_name} onChange={(x) => set("father_name", x.target.value)} />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">PAN</span>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2.5">
            <span className="tabular text-sm text-foreground">
              {shown?.pan || (e.pan_last4 ? `●●●●●●${e.pan_last4}` : "Not given")}
            </span>
            {e.pan_last4 && (
              <Button size="sm" variant="ghost" onClick={reveal}>
                {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {shown ? "Hide" : "Reveal"}
              </Button>
            )}
          </div>
          {e.pan_last4 && <p className="mt-1 text-xs text-muted-foreground">Revealing is recorded in the payroll history.</p>}
        </div>
        <Field label={e.pan_last4 ? "Replace PAN" : "Set PAN"} hint="Stored encrypted. Only the last four characters are kept in the clear.">
          <Input id="per-pan" value={pan} maxLength={10} autoComplete="off" onChange={(x) => setPan(x.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="ABCDE1234F" />
        </Field>
      </div>
    </Section>
  )
}

// ---- payment -------------------------------------------------------------------------------------------------

function PaymentSection({ e, userId, onSave }) {
  const [d, set, changes, reset] = useFields(e, PAYMENT)
  const [acc, setAcc] = useState("")
  const [acc2, setAcc2] = useState("")
  const [shown, setShown] = useState(null)
  const [busy, run] = useSaver(onSave, "Payment details")
  const all = acc ? { ...changes, account_number: acc } : changes

  const reveal = async () => {
    if (shown) return setShown(null)
    try {
      setShown(await revealSecrets(userId))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const submit = async () => {
    if (d.pay_mode === "bank" && d.ifsc && !IFSC_RE.test(d.ifsc)) return toast.error("That IFSC is not valid (11 characters, like HDFC0001234)")
    if (acc) {
      if (!/^[0-9]{6,18}$/.test(acc)) return toast.error("A bank account number is 6 to 18 digits")
      if (acc !== acc2) return toast.error("The two account numbers do not match")
    }
    if (await run(all)) {
      setAcc("")
      setAcc2("")
      setShown(null)
    }
  }

  const ifscBad = d.ifsc && !IFSC_RE.test(d.ifsc)

  return (
    <Section
      title="Payment"
      description="How the salary is paid. Bank transfers go into the bank file."
      action={<SaveBar changes={all} busy={busy} onSave={submit} onReset={() => { reset(); setAcc(""); setAcc2("") }} />}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Pay by">
          <Select value={d.pay_mode} onChange={(x) => set("pay_mode", x.target.value)}>
            <option value="bank">Bank transfer</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>
        {d.pay_mode === "bank" && (
          <>
            <Field label="Account holder's name" hint="As the bank has it.">
              <Input id="pay-holder" value={d.account_holder} onChange={(x) => set("account_holder", x.target.value)} />
            </Field>
            <Field label="Bank">
              <Input id="pay-bank" value={d.bank_name} onChange={(x) => set("bank_name", x.target.value)} />
            </Field>
            <Field label="IFSC" error={ifscBad ? "11 characters: 4 letters, 0, then 6 letters or digits." : undefined}>
              <Input id="pay-ifsc" value={d.ifsc} maxLength={11} aria-invalid={ifscBad || undefined} onChange={(x) => set("ifsc", x.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="HDFC0001234" />
            </Field>
            <div className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Account number</span>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2.5">
                <span className="tabular text-sm text-foreground">
                  {shown?.account_number || (e.account_last4 ? `●●●●●●${e.account_last4}` : "Not given")}
                </span>
                {e.account_last4 && (
                  <Button size="sm" variant="ghost" onClick={reveal}>
                    {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {shown ? "Hide" : "Reveal"}
                  </Button>
                )}
              </div>
              {e.account_last4 && <p className="mt-1 text-xs text-muted-foreground">Revealing is recorded in the payroll history.</p>}
            </div>
            <Field label={e.account_last4 ? "New account number" : "Account number"} hint="Stored encrypted.">
              <Input id="pay-acc" inputMode="numeric" autoComplete="off" value={acc} onChange={(x) => setAcc(x.target.value.replace(/\D/g, "").slice(0, 18))} />
            </Field>
            <Field label="Enter it again" error={acc2 && acc !== acc2 ? "Does not match." : undefined}>
              <Input id="pay-acc2" inputMode="numeric" autoComplete="off" value={acc2} onPaste={(x) => x.preventDefault()} onChange={(x) => setAcc2(x.target.value.replace(/\D/g, "").slice(0, 18))} />
            </Field>
          </>
        )}
      </div>
    </Section>
  )
}

// ---- salary ------------------------------------------------------------------------------------------------------

function Breakup({ earnings, employerPf }) {
  const gross = earnings.reduce((s, x) => s + Number(x.amount || 0), 0)
  const ctc = gross + Number(employerPf || 0)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead className="mt-head">
          <tr className="text-left">
            <th>Component</th>
            <th className="text-right">Monthly</th>
            <th className="text-right">Annual</th>
          </tr>
        </thead>
        <tbody className="mt-body">
          {earnings.map((x) => (
            <tr key={x.code}>
              <td className="text-foreground">{x.name}</td>
              <td className="tabular text-right text-foreground">{money(x.amount)}</td>
              <td className="tabular text-right text-muted-foreground">{money(x.amount * 12)}</td>
            </tr>
          ))}
          <tr>
            <td className="font-semibold text-foreground">Gross</td>
            <td className="tabular text-right font-semibold text-foreground">{money(gross)}</td>
            <td className="tabular text-right font-semibold text-foreground">{money(gross * 12)}</td>
          </tr>
          {Number(employerPf) > 0 && (
            <tr>
              <td className="text-muted-foreground">Employer's PF (part of CTC)</td>
              <td className="tabular text-right text-muted-foreground">{money(employerPf)}</td>
              <td className="tabular text-right text-muted-foreground">{money(employerPf * 12)}</td>
            </tr>
          )}
          <tr>
            <td className="font-semibold text-foreground">Cost to company</td>
            <td className="tabular text-right font-semibold text-foreground">{money(ctc)}</td>
            <td className="tabular text-right font-semibold text-foreground">{money(ctc * 12)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function SalarySection({ person, current, upcoming, onRevise, onChanged }) {
  const remove = async (r) => {
    if (!window.confirm(`Delete the revision effective ${monthLabel(r.effective_from)}? Pay runs not yet calculated will use the one before it.`)) return
    try {
      await deleteRevision(r.id)
      toast.success("Revision deleted")
      await onChanged()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Section
      title="Salary"
      description={current ? `${money(current.annual_ctc)} a year, in force since ${monthLabel(current.effective_from)}.` : "No salary in force this month."}
      action={<Button size="sm" variant="outline" onClick={onRevise}><Plus className="h-4 w-4" /> Revise</Button>}
      bodyClassName="p-0"
    >
      {current ? (
        <Breakup earnings={current.earnings || []} employerPf={current.employer_pf_in_ctc} />
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {upcoming.length ? `A salary starts in ${monthLabel(upcoming[upcoming.length - 1].effective_from)}.` : "Add a salary so this person can be included in a pay run."}
        </p>
      )}
      {person.revisions.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 pb-1 pt-4 text-[13px] font-semibold text-foreground">Revision history</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Effective from</th>
                  <th>Paid from</th>
                  <th className="text-right">Annual CTC</th>
                  <th className="text-right">Monthly gross</th>
                  <th>Reason</th>
                  <th className="w-14" />
                </tr>
              </thead>
              <tbody className="mt-body">
                {person.revisions.map((r) => (
                  <tr key={r.id}>
                    <td className="text-foreground">
                      {monthLabel(r.effective_from)}
                      {current?.id === r.id && <Badge tone="emerald" className="ml-2">Current</Badge>}
                      {r.effective_from > `${thisMonthIST()}-01` && <Badge tone="blue" className="ml-2">Upcoming</Badge>}
                    </td>
                    <td className="text-muted-foreground">
                      {monthLabel(r.payout_month)}
                      {r.payout_month > r.effective_from && (
                        <span className="ml-1 text-xs">{r.arrears_paid ? "(arrears paid)" : "(with arrears)"}</span>
                      )}
                    </td>
                    <td className="tabular text-right text-foreground">{money(r.annual_ctc)}</td>
                    <td className="tabular text-right text-foreground">{money(r.monthly_gross)}</td>
                    <td className="text-muted-foreground">{r.reason || ""}</td>
                    <td>
                      {!r.arrears_paid && (
                        <Button size="sm" variant="ghost" icon aria-label={`Delete the revision from ${monthLabel(r.effective_from)}`} onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Section>
  )
}

function monthsBetween(from, to) {
  const [y1, m1] = from.split("-").map(Number)
  const [y2, m2] = to.split("-").map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

function ReviseModal({ person, employee, settings, templates, onClose, onSaved }) {
  const latest = person.revisions[0]
  const thisMonth = thisMonthIST()
  const [ctc, setCtc] = useState(latest ? String(Number(latest.annual_ctc)) : "")
  const [templateId, setTemplateId] = useState(latest?.template_id && templates.some((t) => t.id === latest.template_id) ? latest.template_id : templates[0]?.id || "")
  const [effective, setEffective] = useState(thisMonth)
  const [payout, setPayout] = useState(thisMonth)
  const [payoutTouched, setPayoutTouched] = useState(false)
  const [reason, setReason] = useState(latest ? "" : "Joining salary")
  const [busy, setBusy] = useState(false)

  const template = templates.find((t) => t.id === templateId)
  const annualCtc = Number(ctc) || 0
  const pfEnabled = employee.pf_enabled ?? true

  const preview = useMemo(() => {
    if (!template || !(annualCtc > 0) || !effective) return null
    try {
      return structureFromCtc({ annualCtc, template: template.items, month: fromMonthInput(effective), settings, pfEnabled })
    } catch {
      return null
    }
  }, [template, annualCtc, effective, settings, pfEnabled])

  const setEff = (v) => {
    setEffective(v)
    if (!payoutTouched || payout < v) setPayout(v)
  }

  const arrearsMonths = effective && payout ? monthsBetween(effective, payout) : 0

  const submit = async () => {
    if (!(annualCtc > 0)) return toast.error("Enter the annual CTC")
    if (!template) return toast.error("Choose a salary template")
    if (!effective) return toast.error("Choose the month it takes effect")
    if (payout < effective) return toast.error("The payout month cannot be before the effective month")
    if (person.revisions.some((r) => toMonthInput(r.effective_from) === effective))
      return toast.error(`There is already a revision effective ${monthLabel(fromMonthInput(effective))}. Delete it first.`)
    setBusy(true)
    try {
      await addRevision({
        userId: person.id,
        annualCtc,
        templateItems: template.items,
        templateId: template.id,
        effectiveFrom: fromMonthInput(effective),
        payoutMonth: fromMonthInput(payout),
        reason: reason.trim(),
        settings,
        pfEnabled,
      })
      toast.success("Salary saved")
      await onSaved()
    } catch (err) {
      toast.error(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-2xl"
      title={latest ? `Revise salary: ${person.name || person.email}` : `Add salary: ${person.name || person.email}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save salary"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!templates.length && <Banner tone="warning">There is no active salary template. The Super Admin adds one under Payroll → Settings.</Banner>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Annual CTC (₹)" required hint={latest ? `Currently ${money(latest.annual_ctc)}.` : undefined}>
            <Input id="rev-ctc" type="number" min={0} value={ctc} onChange={(x) => setCtc(x.target.value)} placeholder="360000" />
          </Field>
          <Field label="Salary template" required>
            <Select value={templateId} onChange={(x) => setTemplateId(x.target.value)} placeholder="Choose a template">
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Effective from" required hint="The month the new salary applies to.">
            <Input id="rev-eff" type="month" value={effective} onChange={(x) => setEff(x.target.value)} />
          </Field>
          <Field label="Payout month" hint="The pay run that first pays it.">
            <Input
              id="rev-pay"
              type="month"
              min={effective}
              value={payout}
              onChange={(x) => {
                setPayoutTouched(true)
                setPayout(x.target.value)
              }}
            />
          </Field>
        </div>
        {arrearsMonths > 0 && (
          <Banner tone="info">
            Back-dated by {arrearsMonths} {arrearsMonths === 1 ? "month" : "months"}: the {monthLabel(fromMonthInput(payout))} pay run also pays the
            difference for {monthLabel(fromMonthInput(effective))}
            {arrearsMonths > 1 ? ` to ${monthLabel(prevMonth(payout))}` : ""} as arrears.
          </Banner>
        )}
        <Field label="Reason">
          <Input id="rev-reason" value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Annual increment" />
        </Field>
        {preview && (
          <div className="overflow-hidden rounded-lg border border-border">
            <Breakup earnings={preview.earnings} employerPf={preview.employerPfInCtc} />
          </div>
        )}
        {preview && !pfEnabled && <p className="text-xs text-muted-foreground">PF is off for this person, so there is no employer PF inside the CTC.</p>}
      </div>
    </Modal>
  )
}

function prevMonth(ym) {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 10)
}

// ---- loans and exit ----------------------------------------------------------------------------------------------

function LoansSection({ loans }) {
  return (
    <Section title="Loans and advances" action={<Link to="/payroll?tab=loans" className="text-[13px] font-medium text-primary hover:underline">Open loans</Link>}>
      {!loans.length ? (
        <p className="text-sm text-muted-foreground">None.</p>
      ) : (
        <ul className="space-y-3">
          {loans.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 text-sm">
              <div>
                <div className="font-medium text-foreground">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {money(l.amount)} · {money(l.instalment)} a month from {monthLabel(l.start_month)}
                </div>
              </div>
              <div className="text-right">
                <div className="tabular text-foreground">{money(l.balance)}</div>
                <div className="text-xs capitalize text-muted-foreground">{l.status}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function ExitSection({ e, onSave }) {
  const [d, set, changes, reset] = useFields(e, EXIT)
  const [busy, run] = useSaver(onSave, "Exit details")

  const submit = () => {
    if (d.status !== "active" && !d.exit_date) return toast.error("Give the last working day")
    if (d.status !== "active" && e.status === "active" && !window.confirm("Mark this person as left? They are paid up to the last working day in the next pay run and then left out of later runs.")) return
    return run(changes)
  }

  return (
    <Section title="Exit" action={<SaveBar changes={changes} busy={busy} onSave={submit} onReset={reset} />}>
      <div className="space-y-4">
        <Field label="Status">
          <Select value={d.status} onChange={(x) => set("status", x.target.value)}>
            <option value="active">Active</option>
            <option value="exited">Exited (final settlement pending)</option>
            <option value="settled">Settled</option>
          </Select>
        </Field>
        <Field label="Last working day">
          <Input id="exit-date" type="date" value={d.exit_date} onChange={(x) => set("exit_date", x.target.value)} />
        </Field>
        <Field label="Reason">
          <Input id="exit-reason" value={d.exit_reason} onChange={(x) => set("exit_reason", x.target.value)} placeholder="Resigned" />
        </Field>
        {e.exit_date && <p className="text-xs text-muted-foreground">Left on {dateLabel(e.exit_date)}.</p>}
      </div>
    </Section>
  )
}
