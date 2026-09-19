import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { IndianRupee, ReceiptIndianRupee, Users } from "../../components/ui/Icons"
import { Badge, Button, Card, CardHeader, EmptyState, PageLoader } from "../../components/ui/Ui"
import { ColumnChart } from "../../components/ui/Chart"
import { createRun, getPayrollSettings, listClaims, listEmployees, listRuns } from "../../services/payroll"
import { dueWords, shortDate, upcomingDeadlines } from "../../lib/payrollDeadlines"
import { cn } from "../../lib/cn"
import { LoadError } from "./setup/common"
import { RUN_STATUS, dayWords, defaultRunMonth, monthShort, monthWords, nextAction, rupees, thisMonthIST, todayISTDay } from "./run/shared"

// Payroll → Dashboard (Zoho Payroll's home): this month's pay run and what it
// needs next, the statutory deadlines coming up, the cost of the last six paid
// months, how many people are on payroll and the claims waiting for a decision.

export default function PayrollDashboard() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const [runs, settings, people, claims] = await Promise.all([listRuns(), getPayrollSettings(), listEmployees(), listClaims({ status: "pending" })])
      setState({ loading: false, runs, settings, people, claims })
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
    const paid = state.runs
      .filter((r) => r.status === "paid" && r.kind === "regular")
      .sort((a, b) => (a.month < b.month ? -1 : 1))
      .slice(-6)
    const onPayroll = state.people.filter((p) => p.active && p.employee && p.employee.status === "active")
    return {
      current,
      paid,
      onPayroll: onPayroll.length,
      noSalary: onPayroll.filter((p) => !p.revisions.length).length,
      noProfile: state.people.filter((p) => p.active && !p.employee).length,
      deadlines: upcomingDeadlines(todayISTDay(), { payDay: state.settings?.schedule?.payDay || 7, days: 45 }),
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
    <div className="space-y-5">
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
              <Fact label="Period">{monthWords(current.month)}</Fact>
              <Fact label="Pay day">{dayWords(current.pay_date) || "Not set"}</Fact>
              <Fact label="Payroll cost">{t.payrollCost != null ? rupees(t.payrollCost) : "Not calculated"}</Fact>
              <Fact label="Net pay">{t.netPay != null ? rupees(t.netPay) : "Not calculated"}</Fact>
              <Fact label="Employees">{t.employees ?? "-"}</Fact>
            </div>
          ) : (
            <div className="px-5 pb-5">
              <EmptyState
                icon={IndianRupee}
                title="Nothing to pay yet"
                description={`Create the run for ${monthWords(defaultRunMonth(state.runs))}; its payslips come from salaries and attendance.`}
              />
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader title="Deadlines" description="Statutory dues in the next 45 days" />
          {view.deadlines.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-muted-foreground">Nothing due in the next 45 days.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {view.deadlines.map((d) => (
                <li key={d.key} className="flex items-start gap-3 px-5 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 inline-grid h-10 w-11 flex-none place-items-center rounded-lg text-center text-[11px] font-semibold leading-tight",
                      d.daysLeft <= 3 ? "bg-destructive/10 text-destructive-text" : d.daysLeft <= 7 ? "bg-warning/12 text-warning-text" : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    {shortDate(d.due)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{d.title}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {dueWords(d.daysLeft)} · {d.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Payroll cost" description="The last six paid months: salary, employer PF and ESI, and reimbursements" />
          {view.paid.length === 0 ? (
            <p className="px-5 pb-5 text-[13px] text-muted-foreground">The chart fills in once a pay run is paid.</p>
          ) : (
            <div className="px-3 pb-3">
              <ColumnChart
                height={260}
                categories={view.paid.map((r) => monthShort(r.month))}
                series={[
                  { name: "Payroll cost", data: view.paid.map((r) => Math.round(Number(r.totals?.payrollCost) || 0)) },
                  { name: "Net pay", data: view.paid.map((r) => Math.round(Number(r.totals?.netPay) || 0)) },
                ]}
                valueFormatter={(v) => rupees(v)}
              />
            </div>
          )}
        </Card>

        <div className="grid gap-5">
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
            {(view.noSalary > 0 || view.noProfile > 0) && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                {[view.noSalary > 0 && `${view.noSalary} without a salary`, view.noProfile > 0 && `${view.noProfile} active logins without a pay profile`]
                  .filter(Boolean)
                  .join(", ")}
                . They are left out of pay runs.
              </p>
            )}
            <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/payroll?tab=employees")}>
              Employees
            </Button>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <span className="inline-grid h-11 w-11 flex-none place-items-center rounded-full bg-warning/12 text-warning-text">
                <ReceiptIndianRupee className="h-5 w-5" />
              </span>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Claims waiting</div>
                <div className="text-xl font-semibold text-foreground tabular">{state.claims.length}</div>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">
              {state.claims.length
                ? `${rupees(state.claims.reduce((s, c) => s + Number(c.amount), 0))} of reimbursements to decide. Approved claims are paid in the next run.`
                : "No reimbursement claims are waiting."}
            </p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/payroll?tab=approvals")}>
              Approvals
            </Button>
          </Card>
        </div>
      </div>
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
