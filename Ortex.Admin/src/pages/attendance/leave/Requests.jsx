import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileText, X } from "../../../components/ui/Icons"
import { Avatar, Banner, Button, Card, CardHeader, Chip, ChipGroup, Drawer, EmptyState, Field, Modal, PageLoader, SearchInput, Textarea } from "../../../components/ui/Ui"
import { repo } from "../../../data/store/repository"
import { currentUserId } from "../../../lib/auth"
import { balanceAfter, daysWords } from "../../../lib/attendance"
import { formatDateTime, relativeTime } from "../../../lib/format"
import { balancesFor, cancelLeave, decideLeave, leaveBalances, leaveDocumentUrl, listLeaveRequests } from "../../../services/leave"
import { datesText, nameOf, num } from "./common"
import { openRow } from "../format"
import { LeaveStatusBadge, TypeChip } from "./leaveUi"

// Leave → Requests (Employment Hero's Requests view, Deputy's review drawer):
// every request, filtered by status, with bulk approve and decline for admins.
// Accounts (attendance-team) sees the same list read-only. Nobody decides
// their own request; the database refuses it too, so those rows cannot even be
// ticked.

/**
 * Of `list`, the requests still waiting, read fresh from the server: one
 * decided elsewhere a moment ago is skipped, not decided twice.
 */
async function stillPending(list) {
  const fresh = await listLeaveRequests({ status: "pending" })
  if (fresh.error) throw new Error(fresh.error)
  const ids = new Set((fresh.rows || []).map((r) => r.id))
  const keep = list.filter((r) => ids.has(r.id))
  const skipped = list.length - keep.length
  if (skipped) toast.info(skipped === 1 ? "One request was already decided, so it was skipped" : `${skipped} requests were already decided, so they were skipped`)
  return keep
}

/**
 * The drawer's balance check, for a row or bulk approve: each request's balance
 * now and after, said before anything is decided. False when cancelled.
 */
async function confirmBalances(list, ctx) {
  const { byUser, error } = await balancesFor([...new Set(list.map((r) => r.user_id))])
  const lines = list.map((r) => {
    const bal = (byUser[r.user_id] || []).find((b) => b.code === r.type_code)
    const head = `${nameOf(ctx, r.user_id)}, ${r.type_code} ${num(r.days)} ${r.days === 1 ? "day" : "days"}`
    if (!bal) return `${head}: balance not known`
    const now = bal.available + r.days // a pending request is already inside pending
    const after = balanceAfter({ ...bal, available: now }, r.days)
    if (after == null) return `${head}: no balance kept for this type`
    return `${head}: ${num(now)} now, ${num(after)} after${after < 0 ? " (BELOW ZERO)" : ""}`
  })
  const short = lines.length > 12 ? [...lines.slice(0, 12), `and ${lines.length - 12} more`] : lines
  const head = list.length === 1 ? "Approve this leave?" : `Approve ${list.length} leave requests?`
  return window.confirm([head, "", ...short, ...(error ? ["", `Balances could not all be read: ${error}`] : [])].join("\n"))
}

const STATUSES = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Not approved" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
]

export default function Requests({ ctx, canDecide }) {
  const selfId = currentUserId()
  const [status, setStatus] = useState("pending")
  const [q, setQ] = useState("")
  const [state, setState] = useState({ loading: true })
  const [picked, setPicked] = useState(() => new Set())
  const [open, setOpen] = useState(null)
  const [declining, setDeclining] = useState(null) // array of requests
  const [busy, setBusy] = useState(false)

  // The newest 1000 for the history, plus every pending request on its own
  // read, so a waiting request can never drop off the end of the list.
  const load = useCallback(async () => {
    const [recent, pending] = await Promise.all([listLeaveRequests({}), listLeaveRequests({ status: "pending" })])
    const byId = new Map((recent.rows || []).map((r) => [r.id, r]))
    for (const r of pending.rows || []) byId.set(r.id, r)
    const rows = [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    setState({ loading: false, missing: recent.missing || pending.missing, error: recent.error || pending.error, rows })
  }, [])

  useEffect(() => {
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

  const all = useMemo(() => state.rows || [], [state.rows])
  const counts = useMemo(() => {
    const c = { all: all.length }
    for (const r of all) c[r.status] = (c[r.status] || 0) + 1
    return c
  }, [all])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !needle || `${nameOf(ctx, r.user_id)} ${r.type_code} ${r.reason}`.toLowerCase().includes(needle))
  }, [all, status, q, ctx])

  const selectable = (r) => canDecide && r.status === "pending" && r.user_id !== selfId
  const pickedRows = rows.filter((r) => picked.has(r.id))
  const allPicked = rows.filter(selectable).length > 0 && rows.filter(selectable).every((r) => picked.has(r.id))

  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // The drawer shows the balance itself; a row or bulk approve asks first.
  const approve = async (asked, { checked = false } = {}) => {
    setBusy(true)
    if (!checked && !(await confirmBalances(asked, ctx))) return setBusy(false)
    let ok = 0
    const errors = []
    let list = []
    try {
      list = await stillPending(asked)
    } catch (e) {
      errors.push(e.message)
    }
    for (const r of list) {
      try {
        await decideLeave(r.id, true, null)
        ok += 1
      } catch (e) {
        errors.push(`${nameOf(ctx, r.user_id)}: ${e.message}`)
      }
    }
    setBusy(false)
    if (ok) toast.success(ok === 1 ? "Leave approved" : `${ok} requests approved`)
    if (errors.length) toast.error(errors.join("\n"), { duration: 10000 })
    setPicked(new Set())
    setOpen(null)
    void load()
  }

  if (state.loading) return <PageLoader />
  if (state.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      {!canDecide && <Banner tone="info">You can see every request. Admins approve and decline them.</Banner>}
      <Card className="overflow-hidden">
        <CardHeader title="Leave requests" description="From the phone app and this console" />
        <div className="flex flex-wrap items-center gap-[10px] px-5 pb-4">
          <ChipGroup>
            {STATUSES.map((s) => (
              <Chip key={s.value} active={status === s.value} onClick={() => setStatus(s.value)}>
                {s.label} {counts[s.value] ? <span className="tabular text-muted-foreground">{counts[s.value]}</span> : null}
              </Chip>
            ))}
          </ChipGroup>
          <div className="ml-auto flex flex-wrap items-center gap-[10px]">
            {canDecide && pickedRows.length > 0 && (
              <>
                <Button size="sm" onClick={() => approve(pickedRows)} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Approve selected ({pickedRows.length})
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDeclining(pickedRows)} disabled={busy}>
                  <X className="h-4 w-4" /> Decline selected
                </Button>
              </>
            )}
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, type, reason" />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={status === "pending" ? "Nothing waiting" : "No requests here"}
            description={status === "pending" ? "New leave requests appear here the moment they are sent." : "Try another status."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className={canDecide ? "w-full min-w-[1160px] text-sm" : "w-full min-w-[980px] text-sm"}>
              <thead className="mt-head">
                <tr className="text-left">
                  {canDecide && (
                    <th className="w-10">
                      <input
                        id="leave-pick-all"
                        type="checkbox"
                        aria-label="Select every waiting request"
                        className="h-4 w-4 rounded border-border accent-primary"
                        checked={allPicked}
                        onChange={(e) => setPicked(e.target.checked ? new Set(rows.filter(selectable).map((r) => r.id)) : new Set())}
                      />
                    </th>
                  )}
                  <th>Person</th>
                  <th>Type</th>
                  <th>Dates</th>
                  <th>Days</th>
                  <th>Reason</th>
                  <th>Applied</th>
                  <th>Status</th>
                  {canDecide && <th className="text-right">Decision</th>}
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((r) => {
                  const d = ctx.directory?.[r.user_id] || {}
                  return (
                    <tr key={r.id} {...openRow(() => setOpen(r))}>
                      {canDecide && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            id={`leave-pick-${r.id}`}
                            type="checkbox"
                            aria-label={`Select ${d.name || "request"}`}
                            className="h-4 w-4 rounded border-border accent-primary disabled:opacity-30"
                            disabled={!selectable(r)}
                            checked={picked.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        </td>
                      )}
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={d.name || "?"} src={d.avatarUrl} className="h-7 w-7" />
                          <span className="font-medium text-foreground">{d.name || "Unknown"}</span>
                        </div>
                      </td>
                      <td><TypeChip code={r.type_code} /></td>
                      <td className="text-foreground">{datesText(r)}</td>
                      <td className="tabular">{num(r.days)}</td>
                      <td className="max-w-[240px] truncate text-muted-foreground">{r.reason}</td>
                      <td className="text-muted-foreground">{relativeTime(r.created_at)}</td>
                      <td><LeaveStatusBadge status={r.status} /></td>
                      {canDecide && (
                        <td className="text-right" onClick={(e) => e.stopPropagation()}>
                          {selectable(r) && (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" onClick={() => approve([r])} disabled={busy} aria-label={`Approve leave for ${d.name || "this person"}`}>
                                <CheckCircle2 className="h-4 w-4" /> Approve
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => setDeclining([r])} disabled={busy} aria-label={`Decline leave for ${d.name || "this person"}`}>
                                <X className="h-4 w-4" /> Decline
                              </Button>
                            </div>
                          )}
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

      <RequestDrawer
        request={open}
        ctx={ctx}
        all={all}
        canDecide={canDecide}
        deciding={busy}
        selfId={selfId}
        onClose={() => setOpen(null)}
        onApprove={(r) => approve([r], { checked: true })}
        onDecline={(r) => setDeclining([r])}
        onChanged={() => {
          setOpen(null)
          void load()
        }}
      />
      <DeclineModal
        list={declining}
        ctx={ctx}
        onClose={() => setDeclining(null)}
        onDone={() => {
          setDeclining(null)
          setPicked(new Set())
          setOpen(null)
          void load()
        }}
      />
    </div>
  )
}

/** Deputy's review: the balance now, this request, after; clashes; the certificate; the timeline. */
function RequestDrawer({ request: r, ctx, all, canDecide, deciding, selfId, onClose, onApprove, onDecline, onChanged }) {
  const [bal, setBal] = useState(null)
  const [docUrl, setDocUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelNote, setCancelNote] = useState("")

  useEffect(() => {
    setCancelling(false)
    setCancelNote("")
    if (!r) return
    let alive = true
    setBal(null)
    setDocUrl(null)
    void leaveBalances(r.user_id).then((res) => alive && setBal(res.rows.find((b) => b.code === r.type_code) || null))
    if (r.attachment_path) void leaveDocumentUrl(r.attachment_path).then((u) => alive && setDocUrl(u))
    return () => {
      alive = false
    }
  }, [r])

  if (!r) return null
  const own = r.user_id === selfId
  const clashes = all.filter(
    (x) => x.id !== r.id && x.user_id !== r.user_id && x.status === "approved" && x.from_day <= r.to_day && x.to_day >= r.from_day,
  )
  // "Now" is what is available before this request; a pending request is
  // already inside `pending`, so add it back.
  const now = bal ? bal.available + (r.status === "pending" ? r.days : 0) : null
  const after = bal && r.status === "pending" ? balanceAfter({ ...bal, available: now }, r.days) : null
  const canCancelApproved = canDecide && r.status === "approved" && !own

  const cancelApproved = async () => {
    const note = cancelNote.trim()
    if (note.length < 3) return toast.error("Say why the leave is being cancelled")
    setBusy(true)
    try {
      await cancelLeave(r.id, note)
      toast.success("Leave cancelled. The days are back in the balance.")
      setCancelling(false)
      onChanged()
    } catch (e) {
      toast.error(e.message)
    }
    setBusy(false)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={nameOf(ctx, r.user_id)}
      subtitle={`${r.type_code} · ${datesText(r)}`}
      footer={
        r.status === "pending" && canDecide ? (
          own ? (
            <span className="text-[13px] text-muted-foreground">Another admin reviews your own leave.</span>
          ) : (
            <div className="flex w-full justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onDecline(r)} disabled={deciding}>
                <X className="h-4 w-4" /> Decline
              </Button>
              <Button size="sm" onClick={() => onApprove(r)} disabled={deciding}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
            </div>
          )
        ) : canCancelApproved ? (
          <div className="flex w-full justify-end">
            <Button variant="outline" size="sm" onClick={() => setCancelling(true)} disabled={busy}>
              Cancel leave
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Figure label="Available now" value={now == null ? "…" : r.type_code === "LOP" ? "Unpaid" : num(now)} />
          <Figure label="This request" value={daysWords(r.days)} />
          <Figure
            label="After"
            value={after == null ? "-" : num(after)}
            tone={after != null && after < 0 ? "text-destructive-text" : undefined}
          />
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason</div>
          <p className="text-sm text-foreground">{r.reason}</p>
          {r.sandwich && <p className="mt-1 text-[12px] text-muted-foreground">Counted with the sandwich rule.</p>}
        </div>

        {r.attachment_path && (
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Certificate</div>
            {docUrl ? (
              <a href={docUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
                Open the attached document
              </a>
            ) : (
              <span className="text-sm text-muted-foreground">Loading…</span>
            )}
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Others away on these days</div>
          {clashes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one else is on approved leave then.</p>
          ) : (
            <ul className="space-y-1 text-sm text-foreground">
              {clashes.map((x) => (
                <li key={x.id}>
                  {nameOf(ctx, x.user_id)} · <TypeChip code={x.type_code} className="align-middle" /> {datesText(x)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</div>
          <ol className="space-y-3 border-l border-border pl-4 text-sm">
            <li>
              <div className="font-medium text-foreground">Requested</div>
              <div className="text-[12px] text-muted-foreground">{formatDateTime(r.created_at)}</div>
            </li>
            {r.status === "pending" ? (
              <li>
                <div className="font-medium text-foreground">Waiting for an admin</div>
              </li>
            ) : (
              <li>
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <LeaveStatusBadge status={r.status} />
                  {r.decided_by ? `by ${nameOf(ctx, r.decided_by)}` : ""}
                </div>
                <div className="text-[12px] text-muted-foreground">{r.decided_at ? formatDateTime(r.decided_at) : ""}</div>
                {r.decision_note && <div className="mt-1 text-[13px] text-muted-foreground">{r.decision_note}</div>}
                {r.cancel_note && <div className="mt-1 text-[13px] text-muted-foreground">Cancelled: {r.cancel_note}</div>}
              </li>
            )}
          </ol>
        </div>
      </div>
      <Modal
        open={cancelling}
        onClose={() => !busy && setCancelling(false)}
        width="max-w-md"
        title="Cancel this leave"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setCancelling(false)} disabled={busy}>Keep it</Button>
            <Button size="sm" onClick={cancelApproved} disabled={busy || cancelNote.trim().length < 3}>
              {busy ? "Cancelling…" : "Cancel leave"}
            </Button>
          </div>
        }
      >
        <Field label="Reason" required hint="The person sees this. The days go back into their balance.">
          <Textarea id="leave-cancel-note" rows={3} value={cancelNote} onChange={(e) => setCancelNote(e.target.value)} placeholder="For example: the client visit moved, so they are working that day" />
        </Field>
      </Modal>
    </Drawer>
  )
}

function Figure({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-subtle p-3">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular ${tone || "text-foreground"}`}>{value}</div>
    </div>
  )
}

function DeclineModal({ list, ctx, onClose, onDone }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    let ok = 0
    const errors = []
    let todo = []
    try {
      todo = await stillPending(list)
    } catch (e) {
      errors.push(e.message)
    }
    for (const r of todo) {
      try {
        await decideLeave(r.id, false, note.trim())
        ok += 1
      } catch (e) {
        errors.push(`${nameOf(ctx, r.user_id)}: ${e.message}`)
      }
    }
    setBusy(false)
    if (ok) toast.success(ok === 1 ? "Declined" : `${ok} requests declined`)
    if (errors.length) toast.error(errors.join("\n"), { duration: 10000 })
    setNote("")
    onDone()
  }
  return (
    <Modal
      open={Boolean(list?.length)}
      onClose={onClose}
      width="max-w-md"
      title={list?.length > 1 ? `Decline ${list.length} requests` : "Decline this request"}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={go} disabled={busy || note.trim().length < 3}>Decline</Button>
        </div>
      }
    >
      <Field label="Reason" required hint="The person sees this in the app.">
        <Textarea id="leave-decline-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the factory audit is that week" />
      </Field>
    </Modal>
  )
}

