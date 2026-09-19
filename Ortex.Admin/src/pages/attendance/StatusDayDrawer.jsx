import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button, Field, Select, Textarea } from "../../components/ui/Ui"
import { effectiveStatus, FLAG_LABEL, STATUS_LABEL, summarizeDay } from "../../lib/attendance"
import { listPunches, overrideDay } from "../../services/attendance"
import { cn } from "../../lib/cn"
import { DayDrawer } from "./parts"
import { STATUS_ORDER, toneFor } from "./format"

// The day drawer for the Register and the My attendance calendar: the day's
// punches (with selfies) under what the day COUNTS as. The Super Admin can
// override the status with a reason while the month is unlocked; that override
// is logged in the database and wins until cleared.

export default function StatusDayDrawer({ open, onClose, person, userId, day, entry, selfId, canOverride, locked, onChanged }) {
  const [punches, setPunches] = useState([])
  const [status, setStatus] = useState("")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !userId || !day) return undefined
    let alive = true
    setPunches([])
    listPunches({ from: day, to: day, userId }).then((r) => {
      if (alive) setPunches(r.rows || [])
    })
    setStatus(entry?.override_status || "")
    setReason(entry?.override_reason || "")
    return () => {
      alive = false
    }
  }, [open, userId, day, entry])

  const summary = day ? summarizeDay(day, punches) : null
  const shown = entry ? effectiveStatus(entry) : null

  const save = async (clear) => {
    if (!clear && !status) return toast.error("Choose what the day should count as")
    if (!clear && reason.trim().length < 3) return toast.error("Give a reason for the override")
    setBusy(true)
    try {
      await overrideDay(userId, day, clear ? null : status, clear ? null : reason.trim())
      toast.success(clear ? "Override cleared. The day is recalculated." : "Override saved")
      onChanged?.()
    } catch (e) {
      toast.error(e.message || "Could not save the override")
    }
    setBusy(false)
  }

  const extra = (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">Counts as</span>
        {shown ? (
          <span className={cn("inline-flex h-6 items-center rounded px-2 text-[12px] font-semibold", toneFor(shown))}>
            {shown} · {STATUS_LABEL[shown]}
          </span>
        ) : (
          <span className="text-[13px] text-muted-foreground">Not worked out yet</span>
        )}
      </div>
      {entry?.late && (
        <p className="text-[13px] text-warning-text">Late by {entry.late_min} min</p>
      )}
      {(entry?.flags || []).length > 0 && (
        <p className="text-[13px] text-muted-foreground">{entry.flags.map((f) => FLAG_LABEL[f] || f).join(", ")}</p>
      )}
      {entry?.override_status && (
        <p className="text-[13px] text-muted-foreground">
          Overridden from {entry.status}: {entry.override_reason}
        </p>
      )}

      {canOverride && !locked && (
        <div className="space-y-3 border-t border-border pt-3">
          <Field label="Override (Super Admin)" hint="Changes what the day counts as for payroll. Needs a reason and is logged.">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Choose a status">
              {STATUS_ORDER.map((c) => (
                <option key={c} value={c}>{`${c} · ${STATUS_LABEL[c]}`}</option>
              ))}
            </Select>
          </Field>
          <Field label="Reason" required>
            <Textarea
              id={`override-reason-${userId}-${day}`}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="For example: on an approved client visit all day"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {entry?.override_status && (
              <Button size="sm" variant="outline" onClick={() => save(true)} disabled={busy}>
                Clear override
              </Button>
            )}
            <Button size="sm" onClick={() => save(false)} disabled={busy}>
              {busy ? "Saving…" : "Save override"}
            </Button>
          </div>
        </div>
      )}
      {canOverride && locked && (
        <p className="border-t border-border pt-3 text-[13px] text-muted-foreground">This month is locked. Unlock it to change a day.</p>
      )}
    </div>
  )

  return (
    <DayDrawer
      open={open}
      onClose={onClose}
      person={person}
      summary={summary}
      selfId={selfId}
      canReview={false}
      extra={extra}
    />
  )
}
