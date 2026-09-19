import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Calendar, Plus } from "../../../components/ui/Icons"
import { Banner, Button, Card, CardHeader, Drawer, EmptyState, PageLoader } from "../../../components/ui/Ui"
import { currentUserId } from "../../../lib/auth"
import { cn } from "../../../lib/cn"
import { LEDGER_REASON_LABEL } from "../../../lib/attendance"
import { relativeTime } from "../../../lib/format"
import { todayIST } from "../../../services/attendance"
import { cancelLeave, leaveBalances, listLeaveRequests, listLedger } from "../../../services/leave"
import { dayLabel } from "../format"
import ApplyLeaveModal from "./ApplyLeaveModal"
import { datesText, nameOf, num } from "./common"
import { LeaveStatusBadge, TypeChip } from "./leaveUi"

// Leave → My leave: my balances, my requests, and "Apply for leave". Everyone
// sees this, whatever their role. A tile opens that type's ledger, so a balance
// can be traced row by row to where it came from.

export default function MyLeave({ ctx }) {
  const selfId = currentUserId()
  const [state, setState] = useState({ loading: true })
  const [applying, setApplying] = useState(false)
  const [ledgerOf, setLedgerOf] = useState(null)

  const load = useCallback(async () => {
    const [bal, req] = await Promise.all([leaveBalances(null), listLeaveRequests({ userId: selfId })])
    setState({ loading: false, balances: bal.rows, requests: req.rows, missing: bal.missing || req.missing, error: bal.error || req.error })
  }, [selfId])

  useEffect(() => {
    void load()
  }, [load])

  const cancel = async (r) => {
    if (!window.confirm(r.status === "approved" ? "Cancel this leave? The days go back to your balance." : "Withdraw this request?")) return
    try {
      await cancelLeave(r.id, null)
      toast.success(r.status === "approved" ? "Leave cancelled. The days are back in your balance." : "Request withdrawn")
      void load()
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (state.loading) return <PageLoader />
  if (state.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  const today = todayIST()
  const balances = state.balances || []

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {balances
          .filter((b) => b.accrual !== "none")
          .map((b) => (
            <button
              key={b.code}
              type="button"
              onClick={() => setLedgerOf(b)}
              className="squircle flex flex-col gap-1 rounded-card border border-border bg-card p-5 text-left transition-colors hover:bg-subtle"
            >
              <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <TypeChip code={b.code} /> {b.name}
              </span>
              <span className="text-2xl font-semibold text-foreground tabular">
                {num(b.available)} <span className="text-sm font-normal text-muted-foreground">available</span>
              </span>
              <span className="text-[12px] text-muted-foreground">
                {num(b.taken_year)} taken this year{b.pending > 0 ? ` · ${num(b.pending)} waiting` : ""}
              </span>
            </button>
          ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="My leave requests"
          description="Applied here or in the phone app. An admin decides each one."
          action={
            <Button onClick={() => setApplying(true)}>
              <Plus className="h-4 w-4" /> Apply for leave
            </Button>
          }
        />
        {(state.requests || []).length === 0 ? (
          <EmptyState icon={Calendar} title="No leave requests yet" description="Apply for leave and it appears here with its status." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody className="mt-body">
                {state.requests.map((r) => {
                  const canCancel = r.status === "pending" || (r.status === "approved" && r.from_day > today)
                  return (
                    <tr key={r.id}>
                      <td><TypeChip code={r.type_code} /></td>
                      <td className="text-foreground">{datesText(r)}</td>
                      <td className="tabular">{num(r.days)}</td>
                      <td className="max-w-[260px] text-muted-foreground">
                        {r.reason}
                        {r.decision_note && <div className="mt-1 text-[12px]">Note: {r.decision_note}</div>}
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1">
                          <LeaveStatusBadge status={r.status} />
                          {r.decided_by && r.status !== "pending" && (
                            <span className="text-[12px] text-muted-foreground">
                              {nameOf(ctx, r.decided_by)} · {relativeTime(r.decided_at)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        {canCancel && (
                          <Button size="sm" variant="outline" onClick={() => cancel(r)}>
                            {r.status === "pending" ? "Withdraw" : "Cancel"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ApplyLeaveModal
        open={applying}
        onClose={() => setApplying(false)}
        ctx={ctx}
        balances={balances}
        onApplied={() => {
          setApplying(false)
          void load()
        }}
      />
      <LedgerDrawer balance={ledgerOf} userId={selfId} onClose={() => setLedgerOf(null)} />
    </div>
  )
}

/** Every row behind one balance, newest first, with a running total. */
export function LedgerDrawer({ balance, userId, onClose, personName }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!balance) return
    let alive = true
    setRows(null)
    void listLedger({ userId, type: balance.code }).then((r) => alive && setRows(r.rows || []))
    return () => {
      alive = false
    }
  }, [balance, userId])

  // Running balance, oldest to newest, shown newest first.
  let running = 0
  const withTotals = (rows || [])
    .slice()
    .reverse()
    .map((r) => {
      running += r.delta
      return { ...r, after: running }
    })
    .reverse()

  return (
    <Drawer
      open={Boolean(balance)}
      onClose={onClose}
      title={balance ? `${balance.name} ledger` : ""}
      subtitle={balance ? `${personName ? `${personName} · ` : ""}${num(balance.balance)} days in the balance` : ""}
    >
      {rows === null ? (
        <PageLoader />
      ) : withTotals.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet. Accruals, grants and leave taken appear here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {withTotals.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{LEDGER_REASON_LABEL[r.reason] || r.reason}</div>
                <div className="text-[12px] text-muted-foreground">
                  {dayLabel(new Date(new Date(r.at).getTime() + 330 * 60000).toISOString().slice(0, 10))}
                  {r.note ? ` · ${r.note}` : ""}
                </div>
              </div>
              <div className="text-right tabular">
                <div className={cn("text-sm font-semibold", r.delta < 0 ? "text-destructive-text" : "text-success-text")}>
                  {r.delta > 0 ? "+" : ""}
                  {num(r.delta)}
                </div>
                <div className="text-[12px] text-muted-foreground">{num(r.after)} after</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  )
}
