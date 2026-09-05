import { useMemo, useState } from "react"
import { toast } from "sonner"
import { CalendarClock, Mic, Phone, Trash2, X } from "../../components/ui/Icons"
import { Avatar, Badge, Button, Card, Chip, EmptyState, Input, Modal, StatusBadge } from "../../components/ui/Ui"
import { TELECALL_JOB_STATUS, TELECALL_KINDS } from "../../data/domain/schema"
import { repo } from "../../data/store/repository"
import { formatDateTime, relativeTime } from "../../lib/format"
import { dialNow } from "../../services/telecaller"
import { kindMeta, prettyPhone, toLocalInput } from "./helpers"

// The work list: every job that has not finished yet, soonest first. Staff can
// dial one immediately, move it, or cancel it. Finished jobs live on the Calls
// tab through the call they produced.
export default function QueueTab({ jobs, onOpenCall, onPractice }) {
  const [kind, setKind] = useState("all")
  const [busy, setBusy] = useState(null)
  const [moving, setMoving] = useState(null) // job being rescheduled
  const [when, setWhen] = useState("")

  const visible = useMemo(() => (kind === "all" ? jobs : jobs.filter((j) => j.kind === kind)), [jobs, kind])
  const counts = useMemo(() => {
    const c = {}
    for (const j of jobs) c[j.kind] = (c[j.kind] || 0) + 1
    return c
  }, [jobs])

  const callNow = async (job) => {
    setBusy(job.id)
    const res = await dialNow({ jobId: job.id })
    setBusy(null)
    if (res.error) return toast.error(res.error)
    if (res.simulated) {
      toast.success(`Simulated call done — ${String(res.analysis?.outcome || "").replace(/_/g, " ")}`)
      if (res.callId) onOpenCall?.(res.callId)
    } else toast.success(`Ringing ${job.contactName || prettyPhone(job.phone)} — the outcome will appear under Calls`)
  }

  const cancel = async (job) => {
    await repo.update("telecaller_jobs", job.id, { status: "cancelled" })
    toast.success("Call cancelled")
  }

  const reschedule = async () => {
    if (!moving || !when) return
    await repo.update("telecaller_jobs", moving.id, { scheduledAt: new Date(when).toISOString(), status: "queued" })
    toast.success(`Moved to ${formatDateTime(new Date(when).toISOString())}`)
    setMoving(null)
  }

  if (!jobs.length) {
    return (
      <EmptyState
        icon={Phone}
        title="Nothing queued"
        description="New leads, voice leads, feedback and upsell calls land here automatically once the telecaller is enabled — or press New call to ring someone now."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip active={kind === "all"} onClick={() => setKind("all")}>All ({jobs.length})</Chip>
        {TELECALL_KINDS.filter((k) => counts[k.id]).map((k) => (
          <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>{k.label} ({counts[k.id]})</Chip>
        ))}
      </div>

      <Card className="overflow-hidden ring-1 ring-border/60">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="mt-head">
              <tr>
                <th className="px-4 py-3 font-semibold">Who</th>
                <th className="px-4 py-3 font-semibold">Call</th>
                <th className="px-4 py-3 font-semibold">Why</th>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="mt-body">
              {visible.map((j) => {
                const overdue = j.status === "queued" && new Date(j.scheduledAt) <= new Date()
                const k = kindMeta(j.kind)
                return (
                  <tr key={j.id} className="hover:bg-subtle">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={j.contactName || "?"} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">{j.contactName || "Unnamed"}</div>
                          <div className="text-xs text-muted-foreground">{prettyPhone(j.phone)}{j.company ? ` · ${j.company}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={k.tone}>{k.label}{j.round > 1 ? ` · round ${j.round}` : ""}</Badge>
                        {j.priority != null && <Badge tone={j.priority >= 75 ? "rose" : j.priority >= 55 ? "amber" : "slate"}>P{j.priority}</Badge>}
                      </div>
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-muted-foreground">
                      {j.reason && <div className="mb-0.5 line-clamp-1 text-xs font-medium text-foreground">{j.reason}</div>}
                      <div className="line-clamp-2 text-xs">{j.objective || j.context?.productInterest || j.context?.summary || j.source}</div>
                      {j.lastError && <div className="mt-1 line-clamp-1 text-xs text-destructive-text">{j.lastError}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className={overdue ? "font-medium text-warning-text" : "text-foreground"}>{relativeTime(j.scheduledAt)}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDateTime(j.scheduledAt)}{j.attempts ? ` · attempt ${j.attempts}/${j.maxAttempts}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3"><StatusBadge list={TELECALL_JOB_STATUS} status={j.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" disabled={busy === j.id || j.status !== "queued"} onClick={() => callNow(j)}>
                          <Phone className="h-3.5 w-3.5" /> {busy === j.id ? "Calling…" : "Call now"}
                        </Button>
                        <Button size="icon" variant="ghost" title="Practice this call with your mic" onClick={() => onPractice?.(j)}>
                          <Mic className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" title="Reschedule" onClick={() => { setMoving(j); setWhen(toLocalInput(j.scheduledAt)) }}>
                          <CalendarClock className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="dangerGhost" title="Cancel" onClick={() => cancel(j)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(moving)}
        onClose={() => setMoving(null)}
        title="Reschedule call"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoving(null)}><X className="h-4 w-4" /> Close</Button>
            <Button onClick={reschedule} disabled={!when}>Save</Button>
          </div>
        }
      >
        <p className="mb-3 text-sm text-muted-foreground">
          {moving?.contactName || prettyPhone(moving?.phone)} will be called at the new time, inside calling hours.
        </p>
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Modal>
    </div>
  )
}
