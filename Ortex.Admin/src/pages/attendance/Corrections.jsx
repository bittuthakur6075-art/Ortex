import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileText, X } from "../../components/ui/Icons"
import { Avatar, Badge, Banner, Button, Card, CardHeader, Chip, ChipGroup, EmptyState, Field, Modal, PageLoader, Textarea } from "../../components/ui/Ui"
import { currentUserId } from "../../lib/auth"
import { repo } from "../../data/store/repository"
import { clockIST, REGULARISATION_LABEL } from "../../lib/attendance"
import { relativeTime } from "../../lib/format"
import { decideCorrection, listCorrections } from "../../services/attendance"
import { dayLabel } from "./format"

// Attendance → Corrections: "I forgot to clock out", asked on the phone
// (regularise_request) and decided here by an admin. Approving applies the
// corrected times as punches, so the day recalculates from the same source as
// every other day. Nobody decides their own request; the database refuses it
// too.

const TONE = { pending: "amber", approved: "emerald", rejected: "rose", cancelled: "slate" }

export default function Corrections() {
  const selfId = currentUserId()
  const [view, setView] = useState("pending")
  const [state, setState] = useState({ loading: true })
  const [declining, setDeclining] = useState(null)

  const load = useCallback(async () => {
    const [res, directory] = await Promise.all([
      listCorrections({ status: view }),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
    ])
    setState({ loading: false, ...res, directory: directory || {} })
  }, [view])

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    void load()
  }, [load])

  useEffect(() => {
    if (!repo.subscribe) return undefined
    let t = null
    const off = repo.subscribe(() => {
      clearTimeout(t)
      t = setTimeout(() => void load(), 500)
    })
    return () => {
      clearTimeout(t)
      off?.()
    }
  }, [load])

  const rows = useMemo(() => state.rows || [], [state.rows])

  const approve = async (r) => {
    try {
      await decideCorrection(r.id, true, null)
      toast.success("Approved. The day is recalculated with the corrected times.")
      void load()
    } catch (e) {
      toast.error(e.message || "Could not approve")
    }
  }

  if (state.loading && !state.rows) return <PageLoader />
  if (state.missing) {
    return <Banner tone="warning">Corrections are not set up on this database yet (migration 0034).</Banner>
  }

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}
      <Card className="overflow-hidden">
        <CardHeader title="Corrections" description="Requests from the phone app to fix a missed or wrong clock-in or clock-out" />
        <div className="px-5 pb-4">
          <ChipGroup>
            <Chip active={view === "pending"} onClick={() => setView("pending")}>Waiting</Chip>
            <Chip active={view === "decided"} onClick={() => setView("decided")}>Decided</Chip>
          </ChipGroup>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={view === "pending" ? "Nothing waiting" : "No decided corrections yet"}
            description={view === "pending" ? "New requests from the phone app appear here." : "Approved and declined requests appear here."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Person</th>
                  <th>Day</th>
                  <th>Came in</th>
                  <th>Left</th>
                  <th>Reason</th>
                  <th>Asked</th>
                  <th className="text-right">{view === "pending" ? "Decision" : "Status"}</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((r) => {
                  const d = state.directory[r.user_id] || {}
                  const own = r.user_id === selfId
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={d.name || "?"} src={d.avatarUrl} className="h-7 w-7" />
                          <span className="font-medium text-foreground">{d.name || "Unknown"}</span>
                        </div>
                      </td>
                      <td>{dayLabel(r.day, true)}</td>
                      <td className="tabular">{r.in_at ? clockIST(r.in_at) : "-"}</td>
                      <td className="tabular">{r.out_at ? clockIST(r.out_at) : "-"}</td>
                      <td className="max-w-[280px] text-muted-foreground">
                        {r.reason}
                        {r.decision_note && <div className="mt-1 text-[12px]">Note: {r.decision_note}</div>}
                      </td>
                      <td className="text-muted-foreground">{relativeTime(r.created_at)}</td>
                      <td className="text-right">
                        {r.status !== "pending" ? (
                          <Badge tone={TONE[r.status] || "slate"}>{REGULARISATION_LABEL[r.status] || r.status}</Badge>
                        ) : own ? (
                          <span className="text-[13px] text-muted-foreground">Another admin reviews this</span>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => approve(r)}>
                              <CheckCircle2 className="h-4 w-4" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDeclining(r)}>
                              <X className="h-4 w-4" /> Decline
                            </Button>
                          </div>
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
      <DeclineModal
        request={declining}
        onClose={() => setDeclining(null)}
        onDone={() => {
          setDeclining(null)
          void load()
        }}
      />
    </div>
  )
}

function DeclineModal({ request, onClose, onDone }) {
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    try {
      await decideCorrection(request.id, false, note.trim())
      toast.success("Declined")
      setNote("")
      onDone()
    } catch (e) {
      toast.error(e.message || "Could not decline")
    }
    setBusy(false)
  }
  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      width="max-w-md"
      title="Decline this correction"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={go} disabled={busy || note.trim().length < 3}>Decline</Button>
        </div>
      }
    >
      <Field label="Reason" required hint="The person sees this in the phone app.">
        <Textarea id="decline-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: you were not at the office that evening" />
      </Field>
    </Modal>
  )
}
