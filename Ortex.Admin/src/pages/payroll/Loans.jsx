import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Plus, Wallet } from "../../components/ui/Icons"
import { Avatar, Badge, Button, Card, CardHeader, Chip, ChipGroup, Drawer, EmptyState, ExportButton, Field, Input, Modal, PageLoader, SearchInput, Select, Textarea } from "../../components/ui/Ui"
import { exportCsv } from "../../lib/csv"
import { formatDateTime } from "../../lib/format"
import { listEmployees, listLoans, recordLoanRepayment, saveLoan } from "../../services/payroll"
import { LoadError } from "./setup/common"
import { dateLabel, fromMonthInput, money, monthLabel, thisMonthIST } from "./setup/helpers"

// Payroll → Loans (Zoho Payroll's Loans): salary advances and loans, each
// recovered by a fixed instalment in every pay run from its start month. A
// loan closes itself once fully recovered (a trigger in migration 0040); it
// can be paused for a month, and a repayment made outside payroll is recorded
// here.

const FILTERS = [
  { value: "open", label: "Open" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
]

const STATUS = {
  active: <Badge tone="blue">Recovering</Badge>,
  paused: <Badge tone="amber">Paused</Badge>,
  closed: <Badge tone="emerald">Closed</Badge>,
}

export default function Loans() {
  const [loans, setLoans] = useState(null)
  const [people, setPeople] = useState([])
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("open")
  const [query, setQuery] = useState("")
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [repaying, setRepaying] = useState(null)

  const load = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([listLoans(), listEmployees()])
      setLoans(l)
      setPeople(p)
      setError(null)
    } catch (e) {
      setError(e)
      setLoans([])
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const nameOf = useCallback((id) => byId.get(id)?.name || byId.get(id)?.email || "Former employee", [byId])

  const counts = useMemo(() => {
    const l = loans || []
    return { open: l.filter((x) => x.status !== "closed").length, paused: l.filter((x) => x.status === "paused").length, closed: l.filter((x) => x.status === "closed").length, all: l.length }
  }, [loans])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (loans || [])
      .filter((l) => (filter === "open" ? l.status !== "closed" : filter === "all" ? true : l.status === filter))
      .filter((l) => !q || `${nameOf(l.user_id)} ${l.name} ${l.note || ""}`.toLowerCase().includes(q))
  }, [loans, filter, query, nameOf])

  const outstanding = shown.filter((l) => l.status !== "closed").reduce((s, l) => s + l.balance, 0)
  const open = (loans || []).find((l) => l.id === openId) || null

  const setStatus = async (loan, status) => {
    try {
      await saveLoan({ id: loan.id, user_id: loan.user_id, amount: loan.amount, instalment: loan.instalment, start_month: loan.start_month, name: loan.name, status })
      toast.success(status === "paused" ? "Recovery paused. The next pay run will skip it." : "Recovery resumed")
      await load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  const exportRows = () =>
    exportCsv(`payroll-loans-${thisMonthIST()}.csv`, [
      { header: "Employee", value: (l) => nameOf(l.user_id) },
      { header: "Loan", value: (l) => l.name },
      { header: "Amount", value: (l) => Number(l.amount) },
      { header: "Instalment", value: (l) => Number(l.instalment) },
      { header: "Start month", value: (l) => monthLabel(l.start_month) },
      { header: "Disbursed on", value: (l) => l.disbursed_on || "" },
      { header: "Recovered", value: (l) => l.recovered },
      { header: "Balance", value: (l) => l.balance },
      { header: "Status", value: (l) => l.status },
      { header: "Note", value: (l) => l.note || "" },
    ], shown)

  return (
    <div>
      <LoadError error={error} />
      <div className="mb-4 flex flex-wrap items-center gap-[10px]">
        <ChipGroup>
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label} <span className="ml-1 text-subtle-foreground">{counts[f.value]}</span>
            </Chip>
          ))}
        </ChipGroup>
        <div className="ml-auto flex items-center gap-[10px]">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search person or loan" />
          <ExportButton onClick={exportRows} disabled={!shown.length} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Loans and advances"
          description={outstanding > 0 ? `${money(outstanding)} still to recover in this view.` : "Recovered through payroll, one instalment a month."}
          action={<Button size="sm" onClick={() => setCreating(true)} disabled={Boolean(error?.missing)}><Plus className="h-4 w-4" /> New loan</Button>}
        />
        {loans === null ? (
          <div className="p-6"><PageLoader /></div>
        ) : !shown.length ? (
          <EmptyState
            icon={Wallet}
            title={query ? "Nothing matches that search" : filter === "open" ? "No loans being recovered" : "Nothing here"}
            description={filter === "open" && !query ? "A salary advance or loan is recovered from pay, a fixed instalment each month." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Employee</th>
                  <th>Loan</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Instalment</th>
                  <th>From</th>
                  <th className="text-right">Recovered</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {shown.map((l) => {
                  const p = byId.get(l.user_id)
                  return (
                    <tr key={l.id} className="cursor-pointer" onClick={() => setOpenId(l.id)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={nameOf(l.user_id)} src={p?.avatar_url} className="h-8 w-8" />
                          <span className="font-medium text-foreground">{nameOf(l.user_id)}</span>
                        </div>
                      </td>
                      <td className="text-foreground">{l.name}</td>
                      <td className="tabular text-right text-foreground">{money(l.amount)}</td>
                      <td className="tabular text-right text-muted-foreground">{money(l.instalment)}</td>
                      <td className="text-muted-foreground">{monthLabel(l.start_month)}</td>
                      <td className="tabular text-right text-muted-foreground">{money(l.recovered)}</td>
                      <td className="tabular text-right font-medium text-foreground">{money(l.balance)}</td>
                      <td>{STATUS[l.status]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {creating && (
        <NewLoan
          people={people.filter((p) => p.active !== false && !["exited", "settled"].includes(p.employee?.status))}
          onClose={() => setCreating(false)}
          onSaved={async () => {
            setCreating(false)
            await load()
          }}
        />
      )}

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open ? `${open.name}: ${nameOf(open.user_id)}` : ""}
        subtitle={open ? `${money(open.amount)}, ${money(open.instalment)} a month from ${monthLabel(open.start_month)}` : ""}
        footer={
          open && open.status !== "closed" ? (
            <div className="flex w-full justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setStatus(open, open.status === "paused" ? "active" : "paused")}>
                {open.status === "paused" ? "Resume recovery" : "Pause recovery"}
              </Button>
              <Button size="sm" onClick={() => setRepaying(open)}>Record repayment</Button>
            </div>
          ) : null
        }
      >
        {open && <LoanDetail loan={open} person={byId.get(open.user_id)} />}
      </Drawer>

      {repaying && (
        <Repayment
          loan={repaying}
          onClose={() => setRepaying(null)}
          onSaved={async () => {
            setRepaying(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function LoanDetail({ loan, person }) {
  const recoveries = [...loan.recoveries].sort((a, b) => (a.at < b.at ? 1 : -1))
  const pct = Number(loan.amount) > 0 ? Math.min(100, (loan.recovered / Number(loan.amount)) * 100) : 0
  const monthsLeft = loan.balance > 0 ? Math.ceil(loan.balance / Number(loan.instalment)) : 0
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Recovered {money(loan.recovered)}</span>
          <span className="font-semibold text-foreground">{money(loan.balance)} left</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        {loan.status !== "closed" && monthsLeft > 0 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {monthsLeft} more {monthsLeft === 1 ? "instalment" : "instalments"} at this rate.
            {loan.status === "paused" && " Paused: pay runs skip it until it is resumed."}
          </p>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="mt-0.5">{STATUS[loan.status]}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Disbursed on</dt>
          <dd className="mt-0.5 text-foreground">{loan.disbursed_on ? dateLabel(loan.disbursed_on) : "Not recorded"}</dd>
        </div>
        {loan.note && (
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Note</dt>
            <dd className="mt-0.5 text-foreground">{loan.note}</dd>
          </div>
        )}
        {person && (
          <div className="col-span-2">
            <Link to={`/payroll/employees/${person.id}`} className="text-[13px] font-medium text-primary hover:underline">
              Open {person.name || person.email}'s pay profile
            </Link>
          </div>
        )}
      </dl>
      <div>
        <h4 className="mb-2 text-sm font-semibold text-foreground">Recoveries</h4>
        {!recoveries.length ? (
          <p className="text-sm text-muted-foreground">Nothing recovered yet. The first instalment comes out of the {monthLabel(loan.start_month)} pay run.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {recoveries.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <div>
                  <div className="text-foreground">{r.run_id ? "Pay run" : r.note || "Repayment"}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(r.at)}{r.run_id && r.note ? ` · ${r.note}` : ""}</div>
                </div>
                <span className="tabular font-medium text-foreground">{money(r.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function NewLoan({ people, onClose, onSaved }) {
  const [f, setF] = useState({ user_id: "", name: "Salary advance", amount: "", instalment: "", start: thisMonthIST(), disbursed_on: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), note: "" })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const amount = Number(f.amount) || 0
  const instalment = Number(f.instalment) || 0
  const months = amount > 0 && instalment > 0 ? Math.ceil(amount / instalment) : 0

  const submit = async () => {
    if (!f.user_id) return toast.error("Choose who the loan is for")
    if (!(amount > 0)) return toast.error("Enter the amount")
    if (!(instalment > 0)) return toast.error("Enter the monthly instalment")
    if (instalment > amount) return toast.error("The instalment cannot be more than the amount")
    if (!f.start) return toast.error("Choose the first month to recover it")
    setBusy(true)
    try {
      await saveLoan({
        user_id: f.user_id,
        name: f.name,
        amount,
        instalment,
        start_month: fromMonthInput(f.start),
        disbursed_on: f.disbursed_on || null,
        note: f.note.trim() || null,
        status: "active",
      })
      toast.success("Loan added")
      await onSaved()
    } catch (e) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New loan"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Add loan"}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Employee" required className="sm:col-span-2">
          <Select value={f.user_id} placeholder="Choose a person" onChange={(e) => set("user_id", e.target.value)}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name || p.email}</option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.name} onChange={(e) => set("name", e.target.value)}>
            <option value="Salary advance">Salary advance</option>
            <option value="Loan">Loan</option>
          </Select>
        </Field>
        <Field label="Amount (₹)" required>
          <Input id="loan-amount" type="number" min={1} value={f.amount} onChange={(e) => set("amount", e.target.value)} />
        </Field>
        <Field label="Monthly instalment (₹)" required hint={months ? `Recovered over ${months} ${months === 1 ? "month" : "months"}.` : undefined}>
          <Input id="loan-inst" type="number" min={1} value={f.instalment} onChange={(e) => set("instalment", e.target.value)} />
        </Field>
        <Field label="Recover from" required hint="The first pay run to deduct it.">
          <Input id="loan-start" type="month" value={f.start} onChange={(e) => set("start", e.target.value)} />
        </Field>
        <Field label="Disbursed on">
          <Input id="loan-disb" type="date" value={f.disbursed_on} onChange={(e) => set("disbursed_on", e.target.value)} />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Textarea id="loan-note" rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Medical emergency, paid by bank transfer" />
        </Field>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          An instalment gives way when deductions would pass half the month's wages (Code on Wages s.18); the shortfall carries forward.
        </p>
      </div>
    </Modal>
  )
}

function Repayment({ loan, onClose, onSaved }) {
  const [amount, setAmount] = useState(String(loan.balance))
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const n = Number(amount)
    if (!(n > 0)) return toast.error("Enter the amount repaid")
    if (n > loan.balance) return toast.error(`Only ${money(loan.balance)} is left`)
    setBusy(true)
    try {
      await recordLoanRepayment(loan.id, n, note.trim())
      toast.success(n === loan.balance ? "Repaid in full. The loan is closed." : "Repayment recorded")
      await onSaved()
    } catch (e) {
      toast.error(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Record repayment"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Record"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Money paid back outside payroll, in cash or by transfer. {money(loan.balance)} is left.</p>
        <Field label="Amount (₹)" required>
          <Input id="rep-amount" type="number" min={1} max={loan.balance} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Note">
          <Input id="rep-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Paid in cash" />
        </Field>
      </div>
    </Modal>
  )
}
