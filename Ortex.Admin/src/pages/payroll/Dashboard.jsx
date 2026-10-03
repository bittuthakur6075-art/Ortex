import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { IndianRupee, Users } from "../../components/ui/Icons"
import { Badge, Button, Card, CardHeader, EmptyState, PageLoader } from "../../components/ui/Ui"
import { payTermsOf } from "../../lib/payroll"
import { createRun, listEmployees, listRuns, revisionFor } from "../../services/payroll"
import { LoadError } from "./setup/common"
import { RUN_STATUS, dayWords, defaultRunMonth, monthWords, nextAction, rupees, thisMonthIST } from "./run/shared"

// Payroll → Overview: this month's pay run and what it needs next, its total
// net pay, and how many people are on payroll (monthly and daily wage).

export default function PayrollDashboard() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [runs, people] = await Promise.all([listRuns(), listEmployees()])
      setState({ loading: false, runs, people })
    } catch (error) {
      setState({ loading: false, error })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const view = useMemo(() => {
    if (!state.runs) return null
    const month = thisMonthIST()
    const live = state.runs.filter((r) => r.status !== "cancelled")
    // This month's regular run, else the latest one still open.
    const current =
      live.find((r) => r.kind === "regular" && String(r.month).slice(0, 7) === month) ||
      live.filter((r) => r.status !== "paid").sort((a, b) => (a.month < b.month ? 1 : -1))[0] ||
      null
    const onPayroll = state.people.filter((p) => p.active && p.employee && p.employee.status === "active")
    const types = onPayroll.map((p) => payTermsOf(revisionFor(p.revisions, `${month}-01`))?.type)
    return {
      current,
      onPayroll: onPayroll.length,
      monthly: types.filter((t) => t === "monthly").length,
      daily: types.filter((t) => t === "daily").length,
      noSalary: types.filter((t) => !t).length,
      noProfile: state.people.filter((p) => p.active && !p.employee).length,
    }
  }, [state])

  if (state.loading) return <PageLoader />
  if (state.error) return <LoadError error={state.error} />

  const create = async () => {
    const m = defaultRunMonth(state.runs)
    setCreating(true)
    try {
      const id = await createRun(`${m}-01`, "regular")
      navigate(`/payroll/runs/${id}`)
    } catch (e) {
      toast.error(e.message)
      setCreating(false)
    }
  }

  const { current } = view
  const t = current?.totals || {}
  const meta = current ? RUN_STATUS[current.status] || RUN_STATUS.draft : null

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <Card className="overflow-hidden xl:col-span-2">
        <CardHeader
          title={current ? `Pay run · ${monthWords(current.month)}` : `Pay run · ${monthWords(thisMonthIST())}`}
          description={current ? nextAction(current) : "No pay run for this month yet"}
          action={
            current ? (
              <Button onClick={() => navigate(`/payroll/runs/${current.id}`)}>Open pay run</Button>
            ) : (
              <Button onClick={create} disabled={creating}>
                {creating ? "Creating…" : "Create pay run"}
              </Button>
            )
          }
        />
        {current ? (
          <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-3">
            <Fact label="Status">
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </Fact>
            <Fact label="Net pay">{t.netPay != null ? rupees(t.netPay) : "Not calculated"}</Fact>
            <Fact label="People">{t.employees ?? "-"}</Fact>
            <Fact label="Period">{monthWords(current.month)}</Fact>
            <Fact label="Pay day">{dayWords(current.pay_date) || "Not set"}</Fact>
            <Fact label="Gross">{t.gross != null ? rupees(t.gross) : "Not calculated"}</Fact>
          </div>
        ) : (
          <div className="px-5 pb-5">
            <EmptyState
              icon={IndianRupee}
              title="Nothing to pay yet"
              description={`Create the run for ${monthWords(defaultRunMonth(state.runs))}; its payslips come from each person's pay and attendance.`}
            />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="inline-grid h-11 w-11 flex-none place-items-center rounded-full bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">On payroll</div>
            <div className="text-xl font-semibold text-foreground tabular">{view.onPayroll}</div>
          </div>
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground">
          {view.monthly} on a monthly salary, {view.daily} on a daily wage.
          {(view.noSalary > 0 || view.noProfile > 0) &&
            ` ${[view.noSalary > 0 && `${view.noSalary} without pay set`, view.noProfile > 0 && `${view.noProfile} active logins without a pay profile`].filter(Boolean).join(", ")}: they are left out of pay runs.`}
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/payroll?tab=employees")}>
          Employees
        </Button>
      </Card>
    </div>
  )
}

function Fact({ label, children }) {
  return (
    <div className="bg-card px-5 py-3.5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold text-foreground tabular">{children}</div>
    </div>
  )
}
