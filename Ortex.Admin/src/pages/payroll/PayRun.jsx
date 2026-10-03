import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, CheckCircle2, IndianRupee, Plus, Wallet } from "../../components/ui/Icons"
import { Badge, Banner, Button, Card, CardHeader, Delta, EmptyState, Field, Input, Modal, PageLoader, Select, Textarea } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { loadDirectory } from "../../hooks/useRecordHistory"
import { isSuperAdmin } from "../../lib/roles"
import { PAY_TYPES, hoursWords, varianceFlags } from "../../lib/payroll"
import { computeRun, getPayrollSettings, getRun, listLoans, listRuns, releaseWithheld, saveRun, transitionRun } from "../../services/payroll"
import { lockedMonths } from "../../services/attendance"
import { downloadPayslipPdf } from "../../components/documents/payslipPdf"
import { cn } from "../../lib/cn"
import { LoadError } from "./setup/common"
import OneTimeModal from "./run/OneTimeModal"
import AdvanceModal from "./run/AdvanceModal"
import { NewAdvance } from "./Loans"
import PayslipPreview from "./run/PayslipPreview"
import RunFiles from "./run/RunFiles"
import SlipDrawer from "./run/SlipDrawer"
import { KIND_LABEL, ROW_LINK, RUN_STATUS, SLIP_STATUS, dayWords, flatSlip, monthWords, pctChange, previousPaidRegular, rowOpens, rupees, runName, todayISTDay } from "./run/shared"

// One pay run. A draft is where the work is: Calculate builds every payslip
// from the pay in force (a monthly salary prorated by paid days, or a daily
// wage x days worked), this month's attendance and overtime, one-time items
// and advance recovery, and saves them. Days, overtime (worked out, or an
// amount typed after seeing the hours), one-time items, this month's advance
// recovery and each person's status can be changed and are applied at the
// next Calculate, and kept for the one after. Then it is submitted, approved
// by someone else (or the Super Admin), and paid, which releases the payslips.
// The database enforces every step (payroll_run_transition, migrations 0040
// and 0065); this page shows its answer when it refuses.

const MODES = ["Bank transfer", "NEFT", "IMPS", "RTGS", "Cheque", "Cash"]

export default function PayRun() {
  const { id } = useParams()
  const navigate = useNavigate()
  const profile = useProfile()
  const [state, setState] = useState({ loading: true })
  const [edits, setEdits] = useState({}) // { [user_id]: { status, paidDays, daysWorked, oneTime, overtime, recover } }
  const [busy, setBusy] = useState(null)
  const [refusal, setRefusal] = useState(null)
  const [dialog, setDialog] = useState(null) // "pay" | "recall" | "cancel"
  const [form, setForm] = useState({})
  const [openRow, setOpenRow] = useState(null)
  const [preview, setPreview] = useState(null)
  const [oneTimeFor, setOneTimeFor] = useState(null)
  const [advanceFor, setAdvanceFor] = useState(null)
  const [recording, setRecording] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [run, runs, settings, directory, locks, loans] = await Promise.all([
        getRun(id),
        listRuns(),
        getPayrollSettings(),
        loadDirectory(),
        lockedMonths().catch(() => ({ rows: [], error: true })),
        listLoans(),
      ])
      if (!run) {
        setState({ loading: false, notFound: true })
        return
      }
      const prevMeta = previousPaidRegular(runs, run)
      const prev = prevMeta ? await getRun(prevMeta.id) : null
      const month = String(run.month).slice(0, 7)
      setState({
        loading: false,
        run,
        prev,
        settings,
        directory: directory || {},
        loans,
        // null = the lock list could not be read: let the server decide.
        locked: locks.error ? null : (locks.rows || []).some((r) => String(r.month).slice(0, 7) === month),
      })
    } catch (error) {
      setState({ loading: false, error })
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const run = state.run
  const rows = useMemo(
    () => [...(run?.payslips || [])].sort((a, b) => String(a.data?.employee?.name || "").localeCompare(String(b.data?.employee?.name || ""))),
    [run],
  )
  // Paid a full month only because attendance had no row for them, and still
  // being paid in this run on that guess (not skipped, not set by hand).
  const fullMonthGuess = rows.filter((r) => r.status === "included" && r.data?.attendanceMissing && r.data?.paidDaysOverride == null)
  const slips = useMemo(() => rows.map((r) => flatSlip(r, run)), [rows, run])
  const prevSlips = useMemo(() => (state.prev?.payslips || []).map((r) => flatSlip(r, state.prev)), [state.prev])

  const flags = useMemo(() => {
    if (!state.prev || !slips.length) return []
    const names = new Map([...prevSlips, ...slips].map((s) => [s.user_id, s.employee?.name || "Someone"]))
    return varianceFlags(
      slips.filter((s) => s.status === "included"),
      prevSlips.filter((s) => s.status === "included"),
    ).map((f) => ({ ...f, name: names.get(f.user_id) || "Someone" }))
  }, [slips, prevSlips, state.prev])

  if (state.loading) return <PageLoader />
  if (state.notFound) {
    return (
      <EmptyState
        icon={IndianRupee}
        title="Pay run not found"
        description="It may have been removed, or you may not have payroll access."
        action={<Button onClick={() => navigate("/payroll?tab=runs")}>Back to pay runs</Button>}
      />
    )
  }
  if (state.error) return <LoadError error={state.error} />

  const org = state.settings?.organisation || {}
  const status = run.status
  const meta = RUN_STATUS[status] || RUN_STATUS.draft
  const draft = status === "draft"
  const t = run.totals || {}
  const pt = state.prev?.totals || {}
  const dirty = Object.keys(edits).length > 0
  const submittedByMe = run.submitted_by && run.submitted_by === profile?.id
  const nameOf = (uid) => state.directory[uid]?.name || "someone"

  const counts = {
    included: rows.filter((r) => r.status === "included").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    withheld: rows.filter((r) => r.status === "withheld").length,
  }
  const prevIncluded = (state.prev?.payslips || []).filter((r) => r.status !== "skipped").length

  const act = async (key, fn, success) => {
    setBusy(key)
    setRefusal(null)
    try {
      await fn()
      if (success) toast.success(success)
      await load()
      return true
    } catch (e) {
      setRefusal(e.message)
      toast.error(e.message)
      return false
    } finally {
      setBusy(null)
    }
  }

  const calculate = () =>
    act(
      "calculate",
      async () => {
        const out = await computeRun(run, { edits })
        await saveRun(run.id, out.slips, out.totals)
        setEdits({})
        if (!out.slips.length) toast.warning("Nobody to pay: add pay profiles and salaries under Employees first.")
      },
      "Payslips calculated and saved",
    )

  // A regular run is paid on locked attendance: submitting or approving it is
  // refused until the month is locked (read again here, not from page load).
  const needsLock = run.kind === "regular"
  const transition = async (action, success, extra) => {
    const ok = await act(
      action,
      async () => {
        if (needsLock && (action === "submit" || action === "approve")) {
          const locks = await lockedMonths()
          if (locks.error) throw new Error(`Could not check the attendance lock: ${locks.error}`)
          if (!(locks.rows || []).some((r) => String(r.month).slice(0, 7) === String(run.month).slice(0, 7))) {
            throw new Error(`Attendance for ${monthWords(run.month)} is not locked. Lock it in the Register first.`)
          }
        }
        await transitionRun(run.id, action, extra)
      },
      success,
    )
    if (ok) setDialog(null)
  }

  const openDialog = (kind) => {
    setForm({ note: "" })
    setDialog(kind)
  }

  const edit = (uid, patch) => setEdits((e) => ({ ...e, [uid]: { ...(e[uid] || {}), ...patch } }))

  const release = (row) => act(`release-${row.id}`, () => releaseWithheld(row.id), `Salary for ${row.data?.employee?.name || "the employee"} released`)

  const downloadOne = async (row) => {
    setPdfBusy(true)
    try {
      await downloadPayslipPdf({ slip: row.data, status: row.status, title: run.kind === "regular" ? null : run.title, payDate: run.pay_date }, org)
    } catch (e) {
      toast.error(e.message || "Could not make the PDF")
    } finally {
      setPdfBusy(false)
    }
  }

  const tiles = [
    { label: "Gross", value: t.gross, before: pt.gross },
    { label: "Deductions", value: t.deductions, before: pt.deductions },
    { label: "Net pay", value: t.netPay, before: pt.netPay },
  ]
  const nextMonth = (() => {
    const [y, m] = String(run.month).split("-").map(Number)
    return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)
  })()
  const openLoansOf = (uid) => (state.loans || []).filter((l) => l.user_id === uid && l.status === "active" && l.balance > 0 && l.start_month <= run.month)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            to="/payroll?tab=runs"
            aria-label="Back to pay runs"
            className="mt-0.5 inline-grid h-10 w-10 flex-none place-items-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{runName(run)}</h1>
              <Badge tone={meta.tone}>{meta.label}</Badge>
              {run.kind !== "regular" && <Badge tone="violet">{KIND_LABEL[run.kind]}</Badge>}
            </div>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {status === "paid"
                ? `Paid on ${dayWords(run.pay_date)}${run.payment_mode ? ` by ${run.payment_mode}` : ""}${run.payment_ref ? `, reference ${run.payment_ref}` : ""}. Recorded by ${nameOf(run.paid_by)}.`
                : `Pay day ${dayWords(run.pay_date) || "not set"}.`}
              {run.submitted_by && status !== "paid" ? ` Submitted by ${nameOf(run.submitted_by)}.` : ""}
              {run.approved_by && status !== "paid" ? ` Approved by ${nameOf(run.approved_by)}.` : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draft && (
            <>
              <Button variant="dangerGhost" onClick={() => openDialog("cancel")} disabled={Boolean(busy)}>
                Cancel run
              </Button>
              <Button variant="outline" onClick={calculate} disabled={Boolean(busy)}>
                {busy === "calculate" ? "Calculating…" : rows.length ? "Recalculate" : "Calculate"}
              </Button>
              <Button
                onClick={() => transition("submit", "Submitted for approval")}
                disabled={Boolean(busy) || dirty || !rows.length || (needsLock && state.locked === false)}
                title={
                  dirty
                    ? "Calculate first to apply your changes"
                    : !rows.length
                      ? "Calculate the payslips first"
                      : needsLock && state.locked === false
                        ? "Lock this month's attendance first"
                        : undefined
                }
              >
                {busy === "submit" ? "Submitting…" : "Submit for approval"}
              </Button>
            </>
          )}
          {status === "pending_approval" && (
            <>
              <Button variant="outline" onClick={() => openDialog("recall")} disabled={Boolean(busy)}>
                Recall
              </Button>
              <Button variant="dangerGhost" onClick={() => openDialog("cancel")} disabled={Boolean(busy)}>
                Cancel run
              </Button>
              <Button
                onClick={() => {
                  const sure = window.confirm(
                    `Approve this pay run? ${counts.included} payslips, net pay ${rupees(t.netPay)}. Once approved it can be recalled or recorded as paid, not edited.`,
                  )
                  if (sure) void transition("approve", "Pay run approved")
                }}
                disabled={Boolean(busy) || (submittedByMe && !isSuperAdmin(profile)) || (needsLock && state.locked === false)}
                title={
                  submittedByMe && !isSuperAdmin(profile)
                    ? "You submitted this run, so someone else approves it"
                    : needsLock && state.locked === false
                      ? "Lock this month's attendance first"
                      : undefined
                }
              >
                <CheckCircle2 className="h-4 w-4" /> {busy === "approve" ? "Approving…" : "Approve"}
              </Button>
            </>
          )}
          {status === "approved" && (
            <>
              <Button variant="outline" onClick={() => openDialog("recall")} disabled={Boolean(busy)}>
                Recall
              </Button>
              <Button
                onClick={() => {
                  setForm({ payDate: run.pay_date || todayISTDay(), mode: "Bank transfer", ref: "" })
                  setDialog("pay")
                }}
                disabled={Boolean(busy)}
              >
                Record payment
              </Button>
            </>
          )}
        </div>
      </div>

      {refusal && (
        <Banner tone="danger">
          <span className="font-medium">The database refused: </span>
          {refusal}
        </Banner>
      )}
      {status === "pending_approval" && submittedByMe && !isSuperAdmin(profile) && (
        <Banner tone="info">You submitted this run, so someone else with payroll access, or a Super Admin, has to approve it.</Banner>
      )}
      {(draft || status === "pending_approval") && needsLock && state.locked === false && (
        <Banner tone="warning">
          Attendance for {monthWords(run.month)} is not locked; paid days may change.{" "}
          <Link to="/attendance?tab=register" className="font-medium underline">
            Lock it in the Register
          </Link>{" "}
          before this run is submitted or approved.
        </Banner>
      )}
      {fullMonthGuess.length > 0 && (
        <Banner tone="warning">
          {fullMonthGuess.length} {fullMonthGuess.length === 1 ? "person has" : "people have"} no
          attendance for {monthWords(run.month)}, so the full month was paid. Check their paid days.
        </Banner>
      )}
      {draft && run.kind !== "regular" && (
        <Banner tone="warning">
          An off-cycle run pays only the one-time items you add here: no salary, overtime or advance recovery. Add an item for each person, set
          them to Included, and Calculate.
        </Banner>
      )}
      {draft && dirty && (
        <Banner tone="brand">
          You have changes for {Object.keys(edits).length} {Object.keys(edits).length === 1 ? "person" : "people"}. Calculate to apply them.{" "}
          <button type="button" className="font-medium underline" onClick={() => setEdits({})}>
            Discard
          </button>
        </Banner>
      )}
      {run.note && <Banner tone="info">Note: {run.note}</Banner>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((x) => (
          <Tile key={x.label} label={x.label} value={rupees(x.value)} change={pctChange(x.value, x.before)} prevLabel={state.prev ? monthWords(state.prev.month) : null} />
        ))}
        <Tile
          label="Employees"
          value={String(counts.included + counts.withheld)}
          sub={`${counts.included} included · ${counts.skipped} skipped · ${counts.withheld} withheld`}
          change={pctChange(counts.included + counts.withheld, prevIncluded)}
          prevLabel={state.prev ? monthWords(state.prev.month) : null}
        />
      </div>

      {flags.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Check before approving"
            description={`Net pay changed by 10% or more against ${monthWords(state.prev.month)}, or someone joined or left the run`}
          />
          <ul className="divide-y divide-border border-t border-border">
            {flags.map((f) => (
              <li key={`${f.user_id}-${f.kind}`} className="flex items-start gap-2.5 px-5 py-2.5 text-[13px]">
                <AlertTriangle className={cn("mt-0.5 h-4 w-4 flex-none", f.kind === "down" || f.kind === "gone" ? "text-warning" : "text-primary")} />
                <span className="text-foreground">
                  <span className="font-medium">{f.name}</span>: {f.text.charAt(0).toLowerCase() + f.text.slice(1)}.
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="Employees"
          description={
            draft
              ? "Change days, overtime, advance recovery or one-time items, or skip someone, then Calculate. Click a row for the full payslip."
              : "Click a row for the full payslip and its PDF."
          }
        />
        {rows.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={IndianRupee}
              title="No payslips yet"
              description={draft ? "Calculate to build a payslip for everyone with a pay profile and a salary." : "This run has no payslips."}
              action={
                draft ? (
                  <Button onClick={calculate} disabled={Boolean(busy)}>
                    {busy === "calculate" ? "Calculating…" : "Calculate"}
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Employee</th>
                  <th className="text-right">Days</th>
                  <th>Overtime</th>
                  <th className="text-right">Gross</th>
                  <th className="text-right">Deductions</th>
                  <th className="text-right">Net pay</th>
                  <th>Status</th>
                  {draft && <th />}
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((r) => {
                  const d = r.data || {}
                  const e = edits[r.user_id] || {}
                  const daily = d.payType === "daily"
                  const offCycleSlip = !d.payType
                  const stored = Number(daily ? d.daysWorked : d.paidDays)
                  const shownDays = (daily ? e.daysWorked : e.paidDays) ?? stored
                  const changed = daily ? e.daysWorked != null : e.paidDays != null
                  const sStatus = e.status ?? r.status
                  const oneTime = e.oneTime ?? d.oneTimeInput ?? []
                  const ot = e.overtime ?? d.overtimeInput ?? (d.overtime ? { mode: d.overtime.mode, amount: d.overtime.mode === "manual" ? d.overtime.amount : "" } : null)
                  const advances = (d.deductions || []).filter((x) => x.code === "LOAN")
                  const hasLoans = advances.length > 0 || openLoansOf(r.user_id).length > 0
                  const stop = (ev) => ev.stopPropagation()
                  return (
                    <tr key={r.id} className={cn(ROW_LINK, sStatus === "skipped" && "text-muted-foreground")} {...rowOpens(() => setOpenRow(r))}>
                      <td>
                        <div className={cn("font-medium", sStatus === "skipped" ? "text-muted-foreground line-through" : "text-foreground")}>{d.employee?.name || "Unknown"}</div>
                        <div className="text-[12px] text-muted-foreground">
                          {d.payType ? `${PAY_TYPES[d.payType]}, ${rupees(d.rate)}${daily ? " a day" : " a month"}` : [d.employee?.employee_code, d.employee?.designation].filter(Boolean).join(" · ") || "-"}
                          {oneTime.length > 0 && ` · ${oneTime.length} one-time`}
                        </div>
                        {d.attendanceMissing && (
                          <div className="mt-0.5 flex items-center gap-1 text-[12px] font-medium text-warning-text">
                            <AlertTriangle className="h-3.5 w-3.5" /> No attendance this month: full month paid
                          </div>
                        )}
                      </td>
                      <td className="text-right tabular" onClick={draft && !offCycleSlip ? stop : undefined}>
                        {offCycleSlip ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {changed && Number(stored) !== Number(shownDays) && <span className="text-[12px] text-muted-foreground line-through">{stored}</span>}
                            {draft ? (
                              <Input
                                type="number"
                                min="0"
                                max={daily ? 31 : d.basisDays}
                                step="0.5"
                                aria-label={`${daily ? "Days worked" : "Paid days"} for ${d.employee?.name || "employee"}`}
                                className="w-20 text-right"
                                value={shownDays}
                                onChange={(ev) => {
                                  const max = daily ? 31 : Number(d.basisDays) || 31
                                  const v = ev.target.value === "" ? 0 : Math.max(0, Math.min(max, Number(ev.target.value)))
                                  edit(r.user_id, daily ? { daysWorked: v } : { paidDays: v })
                                }}
                              />
                            ) : (
                              <span>{shownDays}</span>
                            )}
                            <span className="text-[12px] text-muted-foreground">{daily ? "worked" : `/ ${d.basisDays}`}</span>
                          </div>
                        )}
                      </td>
                      <td onClick={draft && d.overtime ? stop : undefined}>
                        {!d.overtime ? (
                          <span className="text-muted-foreground">-</span>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="text-[12px] text-muted-foreground">Overtime worked: {hoursWords(d.overtime.minutes || 0)}</div>
                            {draft ? (
                              <div className="flex items-center gap-2">
                                <Select
                                  className="w-[150px]"
                                  aria-label={`Overtime for ${d.employee?.name || "employee"}`}
                                  value={ot?.mode || "auto"}
                                  onChange={(ev) => edit(r.user_id, { overtime: { mode: ev.target.value, amount: ev.target.value === "manual" ? (ot?.amount ?? "") : "" } })}
                                >
                                  <option value="auto">Auto-calculate</option>
                                  <option value="manual">Enter amount</option>
                                </Select>
                                {ot?.mode === "manual" ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    step="1"
                                    aria-label={`Overtime amount for ${d.employee?.name || "employee"}`}
                                    className="w-24 text-right"
                                    placeholder="0"
                                    value={ot.amount ?? ""}
                                    onChange={(ev) => edit(r.user_id, { overtime: { mode: "manual", amount: ev.target.value === "" ? "" : Math.max(0, Number(ev.target.value)) } })}
                                  />
                                ) : (
                                  <span className="tabular text-foreground">{rupees(d.overtime.mode === "auto" ? d.overtime.amount : 0)}</span>
                                )}
                              </div>
                            ) : (
                              <div className="tabular text-foreground">
                                {rupees(d.overtime.amount)}
                                <span className="ml-1 text-[12px] text-muted-foreground">{d.overtime.mode === "manual" ? "entered" : "auto"}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-right tabular">{rupees(d.gross)}</td>
                      <td className="text-right tabular" onClick={draft && hasLoans ? stop : undefined}>
                        <div>{rupees(d.totalDeductions)}</div>
                        {advances.map((x) => (
                          <div key={x.loanId} className="text-[12px] text-muted-foreground">
                            Advance recovered {rupees(x.amount)} (balance {rupees(x.balanceAfter)})
                          </div>
                        ))}
                        {draft && hasLoans && (
                          <Button size="sm" variant="ghost" onClick={() => setAdvanceFor({ user_id: r.user_id, name: d.employee?.name, loans: openLoansOf(r.user_id), recover: { ...(d.recoverInput || {}), ...(e.recover || {}) } })}>
                            Change recovery
                          </Button>
                        )}
                      </td>
                      <td className="text-right font-semibold text-foreground tabular">{rupees(d.netPay)}</td>
                      <td onClick={stop}>
                        {draft ? (
                          <Select className="w-[132px]" value={sStatus} onChange={(ev) => edit(r.user_id, { status: ev.target.value })}>
                            <option value="included">Included</option>
                            <option value="skipped">Skip</option>
                            <option value="withheld">Withhold</option>
                          </Select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Badge tone={(SLIP_STATUS[r.status] || SLIP_STATUS.included).tone}>{(SLIP_STATUS[r.status] || SLIP_STATUS.included).label}</Badge>
                            {status === "paid" && r.status === "withheld" && (
                              <Button size="sm" variant="outline" onClick={() => release(r)} disabled={Boolean(busy)}>
                                {busy === `release-${r.id}` ? "Releasing…" : "Release"}
                              </Button>
                            )}
                            {r.released_at && r.status === "included" && <span className="text-[12px] text-muted-foreground">Released</span>}
                          </div>
                        )}
                      </td>
                      {draft && (
                        <td onClick={stop} className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setOneTimeFor({ user_id: r.user_id, name: d.employee?.name, items: oneTime })}>
                              <Plus className="h-4 w-4" /> One-time item
                            </Button>
                            {run.kind === "regular" && (
                              <Button size="sm" variant="ghost" onClick={() => setRecording({ user_id: r.user_id, name: d.employee?.name })}>
                                <Wallet className="h-4 w-4" /> Record advance
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(status === "approved" || status === "paid") && rows.length > 0 && (
        <RunFiles run={run} rows={rows} settings={state.settings} org={org} title={run.kind === "regular" ? null : run.title} />
      )}

      <SlipDrawer
        row={openRow}
        onClose={() => setOpenRow(null)}
        downloading={pdfBusy}
        onDownload={() => downloadOne(openRow)}
        onPreview={() => setPreview({ slip: openRow.data, status: openRow.status, title: run.kind === "regular" ? null : run.title, payDate: run.pay_date })}
      />
      <PayslipPreview item={preview} org={org} onClose={() => setPreview(null)} />
      {advanceFor && (
        <AdvanceModal
          person={advanceFor}
          onClose={() => setAdvanceFor(null)}
          onSave={(recover) => {
            edit(advanceFor.user_id, { recover })
            setAdvanceFor(null)
          }}
        />
      )}
      {recording && (
        <NewAdvance
          people={[{ id: recording.user_id, name: recording.name }]}
          userId={recording.user_id}
          start={nextMonth}
          onClose={() => setRecording(null)}
          onSaved={async () => {
            setRecording(null)
            await load()
          }}
        />
      )}
      {oneTimeFor && (
        <OneTimeModal
          person={oneTimeFor}
          onClose={() => setOneTimeFor(null)}
          onSave={(items) => {
            edit(oneTimeFor.user_id, { oneTime: items })
            setOneTimeFor(null)
          }}
        />
      )}

      <Modal
        open={dialog === "pay"}
        onClose={() => !busy && setDialog(null)}
        title="Record payment"
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog(null)} disabled={Boolean(busy)}>
              Not yet
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!form.payDate) return toast.error("Enter the date the salaries were paid")
                void transition("pay", "Payment recorded. Payslips are released.", { payDate: form.payDate, mode: form.mode, ref: form.ref })
              }}
              disabled={Boolean(busy)}
            >
              {busy === "pay" ? "Recording…" : "Record payment and release payslips"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Banner tone="warning">
            Recording the payment releases every included payslip to its employee and records this month's advance recovery. A paid run
            cannot be recalled or changed afterwards, so check the bank has processed the transfer first.
          </Banner>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Paid on" required>
              <Input type="date" value={form.payDate || ""} onChange={(e) => setForm({ ...form, payDate: e.target.value })} />
            </Field>
            <Field label="Mode">
              <Select value={form.mode || ""} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="UTR or reference" hint="The bank's batch or transaction reference">
            <Input value={form.ref || ""} maxLength={60} onChange={(e) => setForm({ ...form, ref: e.target.value })} />
          </Field>
          <p className="text-[13px] text-muted-foreground">
            {counts.included} payslips, net pay {rupees(t.netPay)}.{counts.withheld ? ` ${counts.withheld} withheld stay unpaid until released.` : ""}
          </p>
        </div>
      </Modal>

      <Modal
        open={dialog === "recall" || dialog === "cancel"}
        onClose={() => !busy && setDialog(null)}
        title={dialog === "cancel" ? "Cancel this pay run?" : "Recall to draft?"}
        footer={
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog(null)} disabled={Boolean(busy)}>
              Keep it
            </Button>
            <Button
              size="sm"
              variant={dialog === "cancel" ? "danger" : "primary"}
              onClick={() => transition(dialog, dialog === "cancel" ? "Pay run cancelled" : "Recalled to draft", { note: form.note })}
              disabled={Boolean(busy)}
            >
              {busy ? "Working…" : dialog === "cancel" ? "Cancel run" : "Recall"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] text-muted-foreground">
            {dialog === "cancel"
              ? "Nobody is paid from a cancelled run and it cannot be reopened. A new regular run for this month can then be created."
              : "The run goes back to draft so it can be changed and submitted again. The approval is cleared."}
          </p>
          <Field label="Note (optional)">
            <Textarea rows={3} value={form.note || ""} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Tile({ label, value, sub, change, prevLabel }) {
  return (
    <Card className="gap-1.5 p-4">
      <span className="text-xs font-medium uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold leading-tight tracking-tight text-foreground tabular">{value}</span>
      {sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}
      {prevLabel && (
        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          {change == null ? "No figure" : <Delta value={change} />} vs {prevLabel}
        </span>
      )}
    </Card>
  )
}
