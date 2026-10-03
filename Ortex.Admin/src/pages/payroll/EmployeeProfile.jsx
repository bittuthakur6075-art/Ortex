import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, Eye, EyeOff, IndianRupee, Plus, Trash2, Wallet } from "../../components/ui/Icons"
import { EditorHeader, Section, Tile, Tiles } from "../../components/editors/DocumentEditorShell"
import { Avatar, Badge, Banner, Button, Card, Field, Input, Modal, PageLoader, Select, Textarea } from "../../components/ui/Ui"
import { PAY_TYPES, payTermsOf } from "../../lib/payroll"
import { addRevision, deleteRevision, getEmployee, listLoans, revealSecrets, revisionFor, saveEmployee } from "../../services/payroll"
import { LoadError } from "./setup/common"
import { IFSC_RE, dateLabel, fromMonthInput, missingFor, money, monthLabel, payWords, thisMonthIST, toMonthInput } from "./setup/helpers"
import { NewAdvance } from "./Loans"

// A person's pay profile: basic details, how they are paid (a monthly salary
// or a daily wage, with an effective month), bank details for the bank file,
// exit, and their advances. Each section saves on its own and sends only the
// fields that changed; the account number goes only when typed, and the
// database encrypts it (payroll_employee_save, migration 0040).

const BASIC = ["employee_code", "doj", "designation", "department", "work_location", "notes"]
const PERSONAL = ["dob", "gender"]
const PAYMENT = ["pay_mode", "bank_name", "ifsc", "account_holder"]
const EXIT = ["status", "exit_date", "exit_reason"]

const EMPTY = { pay_mode: "bank", status: "active" }

const norm = (v) => (v === null || v === undefined ? "" : v)

export default function EmployeeProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [person, setPerson] = useState(undefined)
  const [loans, setLoans] = useState([])
  const [error, setError] = useState(null)
  const [revising, setRevising] = useState(Boolean(location.state?.revise))
  const [advancing, setAdvancing] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([getEmployee(id), listLoans()])
      setPerson(p)
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
  const terms = payTermsOf(current)
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
            <IndianRupee className="h-4 w-4" /> {current || person.revisions.length ? "Change pay" : "Set pay"}
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
        <Tile icon={IndianRupee} label="Pay type" value={terms ? PAY_TYPES[terms.type] : "Not set"} sub={current ? `Since ${monthLabel(current.effective_from)}` : undefined} />
        <Tile icon={IndianRupee} tone="success" label={terms?.type === "daily" ? "Daily rate" : "Monthly salary"} value={terms ? money(terms.rate) : "Not set"} />
        <Tile icon={Wallet} tone="warning" label="Advance balance" value={money(loanBalance)} sub={`${loans.filter((l) => l.status !== "closed").length} open`} />
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
          <PaymentSection e={e} userId={id} onSave={save} />
        </div>
        <div className="space-y-5">
          <PersonalSection e={e} onSave={save} />
          <LoansSection loans={loans} onAdd={() => setAdvancing(true)} />
          <ExitSection e={e} onSave={save} />
        </div>
      </div>

      {advancing && (
        <NewAdvance
          people={[person]}
          userId={person.id}
          onClose={() => setAdvancing(false)}
          onSaved={async () => {
            setAdvancing(false)
            await load()
          }}
        />
      )}
      {revising && (
        <ReviseModal
          person={person}
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
        <Field label="Notes" className="md:col-span-2">
          <Textarea id="emp-notes" rows={2} value={d.notes} onChange={(x) => set("notes", x.target.value)} />
        </Field>
      </div>
    </Section>
  )
}

// ---- personal ---------------------------------------------------------------------------------------------

function PersonalSection({ e, onSave }) {
  const [d, set, changes, reset] = useFields(e, PERSONAL)
  const [busy, run] = useSaver(onSave, "Personal details")
  return (
    <Section title="Personal" action={<SaveBar changes={changes} busy={busy} onSave={() => run(changes)} onReset={reset} />}>
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

// ---- pay ---------------------------------------------------------------------------------------------------------

function SalarySection({ person, current, upcoming, onRevise, onChanged }) {
  const remove = async (r) => {
    if (!window.confirm(`Delete the pay from ${monthLabel(r.effective_from)}? Pay runs not yet calculated will use the one before it.`)) return
    try {
      await deleteRevision(r.id)
      toast.success("Deleted")
      await onChanged()
    } catch (err) {
      toast.error(err.message)
    }
  }
  const terms = payTermsOf(current)

  return (
    <Section
      title="Pay"
      description={
        current
          ? `${PAY_TYPES[terms.type]}, ${payWords(current)}, since ${monthLabel(current.effective_from)}.`
          : upcoming.length
            ? `Pay starts in ${monthLabel(upcoming[upcoming.length - 1].effective_from)}.`
            : "No pay set. Set it so this person is included in pay runs."
      }
      action={<Button size="sm" variant="outline" onClick={onRevise}><Plus className="h-4 w-4" /> Change</Button>}
      bodyClassName="p-0"
    >
      {current && (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          {terms.type === "daily"
            ? "Paid for each day worked: present or on duty is a full day, a half day is half. Weekly offs, holidays and leave are not paid."
            : "Paid the full salary for a full month; each unpaid day in attendance costs one day's pay."}
        </p>
      )}
      {person.revisions.length > 0 && (
        <div className="border-t border-border">
          <div className="px-5 pb-1 pt-4 text-[13px] font-semibold text-foreground">History</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Effective from</th>
                  <th>Pay type</th>
                  <th className="text-right">Rate</th>
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
                    <td className="text-muted-foreground">{PAY_TYPES[payTermsOf(r).type]}</td>
                    <td className="tabular text-right text-foreground">{payWords(r)}</td>
                    <td className="text-muted-foreground">{r.reason || ""}</td>
                    <td>
                      {!r.arrears_paid && (
                        <Button size="sm" variant="ghost" icon aria-label={`Delete the pay from ${monthLabel(r.effective_from)}`} onClick={() => remove(r)}>
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

function ReviseModal({ person, onClose, onSaved }) {
  const latest = payTermsOf(person.revisions[0])
  const [type, setType] = useState(latest?.type || "monthly")
  const [rate, setRate] = useState(latest ? String(latest.rate) : "")
  const [effective, setEffective] = useState(thisMonthIST())
  const [reason, setReason] = useState(latest ? "" : "Joining pay")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const n = Number(rate)
    if (!(n > 0)) return toast.error(type === "daily" ? "Enter the daily rate" : "Enter the monthly salary")
    if (!effective) return toast.error("Choose the month it takes effect")
    if (person.revisions.some((r) => toMonthInput(r.effective_from) === effective))
      return toast.error(`Pay is already set from ${monthLabel(fromMonthInput(effective))}. Delete that first.`)
    setBusy(true)
    try {
      await addRevision({ userId: person.id, type, rate: n, effectiveFrom: fromMonthInput(effective), reason: reason.trim() })
      toast.success("Pay saved")
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
      title={latest ? `Change pay: ${person.name || person.email}` : `Set pay: ${person.name || person.email}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save pay"}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Pay type" required>
          <Select value={type} onChange={(x) => setType(x.target.value)}>
            <option value="monthly">{PAY_TYPES.monthly}</option>
            <option value="daily">{PAY_TYPES.daily}</option>
          </Select>
        </Field>
        <Field
          label={type === "daily" ? "Daily rate (₹)" : "Monthly salary (₹)"}
          required
          hint={latest ? `Currently ${money(latest.rate)} ${latest.type === "daily" ? "a day" : "a month"}.` : undefined}
        >
          <Input type="number" min={0} value={rate} onChange={(x) => setRate(x.target.value)} placeholder={type === "daily" ? "800" : "27000"} />
        </Field>
        <Field label="Effective from" required hint="The first month paid at this rate.">
          <Input type="month" value={effective} onChange={(x) => setEffective(x.target.value)} />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Annual increment" />
        </Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          {type === "daily"
            ? "Paid days worked x the daily rate, every month: present or on duty is a full day, a half day is half. Weekly offs, holidays and leave are not paid."
            : "Paid salary x paid days / days in the pay month, from attendance."}
        </p>
      </div>
    </Modal>
  )
}

// ---- advances and exit -------------------------------------------------------------------------------------------

function LoansSection({ loans, onAdd }) {
  return (
    <Section
      title="Advances"
      action={
        <span className="flex items-center gap-3">
          <Link to="/payroll?tab=loans" className="text-[13px] font-medium text-primary hover:underline">
            All advances
          </Link>
          <Button size="sm" variant="outline" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Record
          </Button>
        </span>
      }
    >
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
