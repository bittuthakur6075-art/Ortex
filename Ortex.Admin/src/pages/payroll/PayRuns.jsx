import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { IndianRupee, Plus } from "../../components/ui/Icons"
import { Badge, Button, Card, CardHeader, Chip, ChipGroup, EmptyState, Field, Input, Modal, PageLoader } from "../../components/ui/Ui"
import { loadDirectory } from "../../hooks/useRecordHistory"
import { createRun, listRuns } from "../../services/payroll"
import { LoadError } from "./setup/common"
import { KIND_LABEL, RUN_STATUS, RUN_STATUS_ORDER, dayWords, defaultRunMonth, monthWords, rupees, thisMonthIST } from "./run/shared"

// Payroll → Pay runs: every run, newest month first, as Zoho Payroll lists
// them. A regular run per month (the database allows one that is not
// cancelled), and off-cycle runs for a bonus or a correction. Creating one
// opens it; the figures are calculated on the run's own page.

export default function PayRuns() {
  const navigate = useNavigate()
  const [state, setState] = useState({ loading: true, runs: [], directory: {} })
  const [filter, setFilter] = useState("all")
  const [dialog, setDialog] = useState(null) // { kind: "regular" | "off_cycle", month, title }
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [runs, directory] = await Promise.all([listRuns(), loadDirectory()])
      setState({ loading: false, runs, directory: directory || {} })
    } catch (error) {
      setState({ loading: false, runs: [], directory: {}, error })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c = { all: state.runs.length }
    for (const s of RUN_STATUS_ORDER) c[s] = state.runs.filter((r) => r.status === s).length
    return c
  }, [state.runs])

  const rows = useMemo(() => (filter === "all" ? state.runs : state.runs.filter((r) => r.status === filter)), [state.runs, filter])

  const open = (kind) => setDialog({ kind, month: kind === "regular" ? defaultRunMonth(state.runs) : thisMonthIST(), title: "" })

  const create = async () => {
    if (!dialog?.month) return toast.error("Choose the month")
    if (dialog.kind !== "regular" && !dialog.title.trim()) return toast.error("Give the off-cycle run a title, like Diwali bonus")
    setBusy(true)
    try {
      const id = await createRun(`${dialog.month}-01`, dialog.kind, dialog.kind === "regular" ? null : dialog.title.trim())
      toast.success(`Pay run for ${monthWords(dialog.month)} created`)
      navigate(`/payroll/runs/${id}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (state.loading) return <PageLoader />

  return (
    <div className="space-y-5">
      <LoadError error={state.error} />

      <div className="flex flex-wrap items-center gap-[10px]">
        <ChipGroup>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            All <span className="tabular text-muted-foreground">{counts.all}</span>
          </Chip>
          {RUN_STATUS_ORDER.map((s) => (
            <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>
              {RUN_STATUS[s].label} <span className="tabular text-muted-foreground">{counts[s]}</span>
            </Chip>
          ))}
        </ChipGroup>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Pay runs"
          description="Draft, then approval by a second person, then payment. Payslips reach people once a run is paid."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => open("off_cycle")} disabled={Boolean(state.error)}>
                Off-cycle run
              </Button>
              <Button onClick={() => open("regular")} disabled={Boolean(state.error)}>
                <Plus className="h-4 w-4" /> Create pay run
              </Button>
            </div>
          }
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pb-4 text-[12px] text-muted-foreground">
          {RUN_STATUS_ORDER.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <Badge tone={RUN_STATUS[s].tone}>{RUN_STATUS[s].label}</Badge>
              {LEGEND[s]}
            </span>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={IndianRupee}
              title={state.runs.length ? "No pay runs match" : "No pay runs yet"}
              description={state.runs.length ? "Choose another status above." : "Create the first pay run. Its payslips come from each person's salary and this month's attendance."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Pay run</th>
                  <th>Status</th>
                  <th className="text-right">Employees</th>
                  <th className="text-right">Net pay</th>
                  <th className="text-right">Payroll cost</th>
                  <th>Pay date</th>
                  <th>Created by</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((r) => {
                  const t = r.totals || {}
                  const meta = RUN_STATUS[r.status] || RUN_STATUS.draft
                  return (
                    <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/payroll/runs/${r.id}`)}>
                      <td>
                        <div className="font-medium text-foreground">{monthWords(r.month)}</div>
                        {r.kind !== "regular" && (
                          <div className="text-[12px] text-muted-foreground">
                            {KIND_LABEL[r.kind]}
                            {r.title ? `: ${r.title}` : ""}
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                      <td className="text-right tabular">{t.employees ?? "-"}</td>
                      <td className="text-right tabular">{t.netPay != null ? rupees(t.netPay) : "-"}</td>
                      <td className="text-right tabular">{t.payrollCost != null ? rupees(t.payrollCost) : "-"}</td>
                      <td className="tabular">{dayWords(r.pay_date) || "-"}</td>
                      <td>{state.directory[r.created_by]?.name || (r.created_by ? "Unknown" : "Not recorded")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(dialog)}
        onClose={() => !busy && setDialog(null)}
        title={dialog?.kind === "regular" ? "Create pay run" : "Off-cycle pay run"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create and open"}
            </Button>
          </>
        }
      >
        {dialog && (
          <div className="space-y-4">
            <Field label="Month" required hint={dialog.kind === "regular" ? "One regular run per month" : "The month this payment belongs to"}>
              <Input type="month" value={dialog.month} onChange={(e) => setDialog({ ...dialog, month: e.target.value })} />
            </Field>
            {dialog.kind !== "regular" && (
              <Field label="Title" required hint="What this payment is for, shown on the payslip">
                <Input value={dialog.title} maxLength={60} placeholder="Diwali bonus" onChange={(e) => setDialog({ ...dialog, title: e.target.value })} />
              </Field>
            )}
            <p className="text-[13px] text-muted-foreground">
              The run opens as a draft. Calculate it to build the payslips from salaries and attendance, then submit it for approval.
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

const LEGEND = {
  draft: "being prepared",
  pending_approval: "submitted, needs a second person",
  approved: "ready to pay",
  paid: "payslips released",
  cancelled: "not paid",
}
