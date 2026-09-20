import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarClock, Lock } from "../../components/ui/Icons"
import {
  Avatar,
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  Chip,
  ChipGroup,
  EmptyState,
  ExportButton,
  Field,
  Modal,
  PageLoader,
  Textarea,
  ToolbarButton,
} from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { canAccess } from "../../data/domain/modules"
import { isAdmin, isSuperAdmin, roleLabel, ROLE_TONE } from "../../lib/roles"
import { currentUserId } from "../../lib/auth"
import { repo } from "../../data/store/repository"
import { exportCsv } from "../../lib/csv"
import { durationWords, effectiveStatus, STATUS_LABEL } from "../../lib/attendance"
import {
  getSettings,
  listDays,
  listHolidays,
  lockedMonths,
  lockMonth,
  monthSummary,
  todayIST,
  unlockMonth,
} from "../../services/attendance"
import { cn } from "../../lib/cn"
import { dayHead, dayLabel, daysOf, monthLabel, toneFor } from "./format"
import { MonthSwitcher, StatusLegend } from "./status"
import StatusDayDrawer from "./StatusDayDrawer"

// Attendance → Register: the month payroll reads. A summary per person
// (attendance_month_summary, the same formula the phone and lib/attendance.js
// use), the people × days grid behind it, the lock that freezes the month for
// payroll, and the exports for Tally. Admins, and anyone granted
// "attendance-register" (lock + export) or "attendance-team" (read).

const FILTERS = [
  { value: "all", label: "All" },
  { value: "absent", label: "With absences" },
  { value: "missed", label: "With missed punches" },
]

export default function Register() {
  const viewer = useProfile()
  const selfId = currentUserId()
  const canLock = isAdmin(viewer) || canAccess(viewer, "attendance-register")
  const superAdmin = isSuperAdmin(viewer)
  const thisMonth = todayIST().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [filter, setFilter] = useState("all")
  const [state, setState] = useState({ loading: true })
  const [cell, setCell] = useState(null) // { userId, day }
  const [locking, setLocking] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  const load = useCallback(async () => {
    const days = daysOf(month)
    const [summary, dayRows, locks, holidays, settings, directory] = await Promise.all([
      monthSummary(month),
      listDays({ from: days[0], to: days[days.length - 1] }),
      lockedMonths(),
      listHolidays({ from: days[0], to: days[days.length - 1] }),
      getSettings(),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
    ])
    setState({
      loading: false,
      missing: summary.missing || dayRows.missing || locks.missing,
      error: summary.error || dayRows.error || locks.error,
      summary: summary.rows,
      days: dayRows.rows,
      lock: (locks.rows || []).find((r) => String(r.month).slice(0, 7) === month) || null,
      holidays: new Set((holidays.rows || []).filter((h) => h.active && h.kind !== "optional").map((h) => h.day)),
      weeklyOff: new Set(settings.doc?.weeklyOff || [0]),
      directory: directory || {},
    })
  }, [month])

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    void load()
  }, [load])

  useEffect(() => {
    if (!repo.subscribe) return undefined
    let t = null
    const off = repo.subscribe(() => {
      clearTimeout(t)
      t = setTimeout(() => void load(), 600)
    })
    return () => {
      clearTimeout(t)
      off?.()
    }
  }, [load])

  const dayList = useMemo(() => daysOf(month), [month])
  const byCell = useMemo(() => {
    const m = new Map()
    for (const d of state.days || []) m.set(`${d.user_id}|${d.day}`, d)
    return m
  }, [state.days])

  const rows = useMemo(() => {
    const all = state.summary || []
    if (filter === "absent") return all.filter((r) => r.absent > 0)
    if (filter === "missed") return all.filter((r) => r.missed > 0)
    return all
  }, [state.summary, filter])

  const counts = useMemo(() => {
    const all = state.summary || []
    return { all: all.length, absent: all.filter((r) => r.absent > 0).length, missed: all.filter((r) => r.missed > 0).length }
  }, [state.summary])

  if (state.loading && !state.summary) return <PageLoader />
  if (state.missing) {
    return <Banner tone="warning">The attendance register is not set up on this database yet (migration 0034).</Banner>
  }

  const locked = Boolean(state.lock)
  const past = month < thisMonth
  const lockerName = state.lock?.locked_by ? state.directory[state.lock.locked_by]?.name || "an admin" : "an admin"

  const exportSummary = () =>
    exportCsv(`attendance-summary-${month}.csv`, [
      { header: "Name", value: (r) => r.name },
      { header: "Role", value: (r) => roleLabel(r.role) },
      { header: "Present", value: (r) => r.present },
      { header: "On duty (field)", value: (r) => r.field },
      { header: "Half days", value: (r) => r.half_days },
      { header: "Absent", value: (r) => r.absent },
      { header: "Missed punches", value: (r) => r.missed },
      { header: "Weekly offs", value: (r) => r.weekly_off },
      { header: "Holidays", value: (r) => r.holidays },
      { header: "Leave", value: (r) => r.leave },
      { header: "Loss of pay", value: (r) => r.lop },
      { header: "Lates", value: (r) => r.lates },
      { header: "Late penalty (days)", value: (r) => Number(r.late_penalty) },
      { header: "Hours worked", value: (r) => (Number(r.worked_min) / 60).toFixed(2) },
      { header: "Payable days", value: (r) => Number(r.payable) },
      { header: "Month locked", value: () => (locked ? "Yes" : "No") },
    ], state.summary || [])

  const exportGrid = () =>
    exportCsv(
      `attendance-days-${month}.csv`,
      [
        { header: "Name", value: (r) => r.name },
        ...dayList.map((d) => ({
          header: d,
          value: (r) => {
            const e = byCell.get(`${r.user_id}|${d}`)
            return e ? effectiveStatus(e) + (e.late ? " (late)" : "") : ""
          },
        })),
      ],
      state.summary || [],
    )

  const open = cell ? byCell.get(`${cell.userId}|${cell.day}`) || null : null
  const openPerson = cell ? (state.summary || []).find((r) => r.user_id === cell.userId) : null

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} onChange={setMonth} max={thisMonth} />
        <div className="flex flex-wrap items-center gap-2">
          {locked ? (
            <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Lock className="h-4 w-4" />
              Locked on {dayLabel(String(state.lock.locked_at).slice(0, 10))} by {lockerName}
            </span>
          ) : past ? (
            <span className="text-[13px] text-muted-foreground">Not locked yet</span>
          ) : (
            <span className="text-[13px] text-muted-foreground">This month is still running</span>
          )}
          {canLock && !locked && past && (
            <Button size="sm" onClick={() => setLocking(true)}>
              <Lock className="h-4 w-4" /> Lock for payroll
            </Button>
          )}
          {superAdmin && locked && (
            <Button size="sm" variant="outline" onClick={() => setUnlocking(true)}>
              Unlock
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={`Summary · ${monthLabel(month)}`} description="Payable days = P + OD + WO + H + L, half of each HD and MP, less the late penalty" />
        <div className="flex flex-wrap items-center gap-[10px] px-5 pb-4">
          <ChipGroup>
            {FILTERS.map((f) => (
              <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label} <span className="tabular text-muted-foreground">{counts[f.value]}</span>
              </Chip>
            ))}
          </ChipGroup>
          <div className="ml-auto flex items-center gap-[10px]">
            <ToolbarButton onClick={exportGrid} disabled={!(state.summary || []).length}>Day grid CSV</ToolbarButton>
            <ExportButton label="Export summary CSV" onClick={exportSummary} disabled={!(state.summary || []).length} />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={CalendarClock} title="Nobody to show" description="No attendance for this month matches the filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Person</th>
                  <th>Role</th>
                  <th className="text-right">P</th>
                  <th className="text-right">OD</th>
                  <th className="text-right">HD</th>
                  <th className="text-right">A</th>
                  <th className="text-right">MP</th>
                  <th className="text-right">WO</th>
                  <th className="text-right">H</th>
                  <th className="text-right">Lates</th>
                  <th className="text-right">Penalty</th>
                  <th className="text-right">Worked</th>
                  <th className="text-right">Payable</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((r) => {
                  const d = state.directory[r.user_id] || {}
                  return (
                    <tr key={r.user_id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={r.name} src={d.avatarUrl} className="h-7 w-7" />
                          <span className="font-medium text-foreground">{r.name}</span>
                        </div>
                      </td>
                      <td><Badge tone={ROLE_TONE[r.role] || "slate"}>{roleLabel(r.role)}</Badge></td>
                      <td className="text-right tabular">{r.present}</td>
                      <td className="text-right tabular">{r.field}</td>
                      <td className="text-right tabular">{r.half_days}</td>
                      <td className={cn("text-right tabular", r.absent > 0 && "font-semibold text-destructive-text")}>{r.absent}</td>
                      <td className={cn("text-right tabular", r.missed > 0 && "font-semibold text-warning-text")}>{r.missed}</td>
                      <td className="text-right tabular">{r.weekly_off}</td>
                      <td className="text-right tabular">{r.holidays}</td>
                      <td className={cn("text-right tabular", r.lates > 0 && "text-warning-text")}>{r.lates}</td>
                      <td className="text-right tabular">{Number(r.late_penalty) || "-"}</td>
                      <td className="text-right tabular">{durationWords(Number(r.worked_min))}</td>
                      <td className="text-right font-semibold text-foreground tabular">{Number(r.payable)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Day by day" description="Click a day to see its clock-ins" />
        <div className="px-5 pb-4">
          <StatusLegend />
        </div>
        {rows.length > 0 && (
          <div className="overflow-x-auto pb-2">
            <table className="border-separate border-spacing-0 text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[180px] bg-card px-5 py-2 text-left text-[12px] font-medium text-muted-foreground">
                    Person
                  </th>
                  {dayList.map((day) => {
                    const h = dayHead(day)
                    const off = state.weeklyOff.has(h.dow) || state.holidays.has(day)
                    return (
                      <th
                        key={day}
                        className={cn("min-w-9 px-0.5 py-1 text-center font-medium", off ? "text-subtle-foreground" : "text-muted-foreground")}
                        title={dayLabel(day, true)}
                      >
                        <div>{h.wd}</div>
                        <div className="tabular text-foreground">{h.date}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="sticky left-0 z-10 max-w-[180px] truncate border-t border-border bg-card px-5 py-1.5 font-medium text-foreground">
                      {r.name}
                    </td>
                    {dayList.map((day) => {
                      const e = byCell.get(`${r.user_id}|${day}`)
                      const s = e ? effectiveStatus(e) : null
                      const h = dayHead(day)
                      const off = state.weeklyOff.has(h.dow) || state.holidays.has(day)
                      return (
                        <td key={day} className={cn("border-t border-border p-0.5", off && "bg-subtle")}>
                          <button
                            type="button"
                            onClick={() => setCell({ userId: r.user_id, day })}
                            title={`${r.name}, ${dayLabel(day, true)}: ${s ? STATUS_LABEL[s] : "no record"}${e?.late ? `, late by ${e.late_min} min` : ""}`}
                            className={cn(
                              "relative grid h-8 w-8 place-items-center rounded text-[11px] font-semibold transition-opacity hover:opacity-80",
                              s ? toneFor(s) : "text-subtle-foreground",
                            )}
                          >
                            {s || "·"}
                            {e?.late && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-warning" />}
                            {e?.override_status && <span className="absolute bottom-0.5 left-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <StatusDayDrawer
        open={Boolean(cell)}
        onClose={() => setCell(null)}
        person={{ name: openPerson?.name, avatarUrl: state.directory[cell?.userId]?.avatarUrl }}
        userId={cell?.userId}
        day={cell?.day}
        entry={open}
        selfId={selfId}
        canOverride={superAdmin}
        locked={locked}
        onChanged={load}
      />

      <LockModal open={locking} month={month} onClose={() => setLocking(false)} onDone={() => { setLocking(false); void load() }} />
      <UnlockModal open={unlocking} month={month} onClose={() => setUnlocking(false)} onDone={() => { setUnlocking(false); void load() }} />
    </div>
  )
}

function LockModal({ open, month, onClose, onDone }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await lockMonth(month, note.trim())
      toast.success(`${monthLabel(month)} is locked for payroll`)
      setNote("")
      onDone()
    } catch (e) {
      toast.error(e.message || "Could not lock the month")
    }
    setBusy(false)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-md"
      title={`Lock ${monthLabel(month)}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={go} disabled={busy}>{busy ? "Locking…" : "Lock month"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Every day of the month is recalculated one last time, then frozen. No clock-in, correction or override can change it
          afterwards; only the Super Admin can unlock it, with a reason.
        </p>
        <Field label="Note (optional)">
          <Textarea id="lock-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: sent to payroll on 2 October" />
        </Field>
      </div>
    </Modal>
  )
}

function UnlockModal({ open, month, onClose, onDone }) {
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await unlockMonth(month, reason.trim())
      toast.success(`${monthLabel(month)} is unlocked`)
      setReason("")
      onDone()
    } catch (e) {
      toast.error(e.message || "Could not unlock the month")
    }
    setBusy(false)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-md"
      title={`Unlock ${monthLabel(month)}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={go} disabled={busy || reason.trim().length < 3}>{busy ? "Unlocking…" : "Unlock"}</Button>
        </div>
      }
    >
      <Field label="Reason" required hint="Unlocking lets the month change again after payroll may have used it.">
        <Textarea id="unlock-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: correct a missed punch found after payroll" />
      </Field>
    </Modal>
  )
}
