import { useState } from "react"
import { toast } from "sonner"
import { Camera, CheckCircle2, MapPin, X } from "../../components/ui/Icons"
import { Avatar, Badge, Button, Drawer, Field, Modal, Textarea } from "../../components/ui/Ui"
import { ImageViewer } from "../../components/ui/ImageViewer"
import { clockIST, durationWords, flagWords, REVIEW_LABEL } from "../../lib/attendance"
import { reviewPunch } from "../../services/attendance"
import { useSelfieUrls } from "./useSelfieUrls"
import { cn } from "../../lib/cn"
import { dayLabel } from "./format"

// Pieces shared by the Today and My attendance tabs: the selfie thumbnail, the
// flag badges and the day drawer (every punch of one person's day, with its
// selfie, place, distance, accuracy and review state).

const REVIEW_TONE = { ok: "emerald", flagged: "amber", accepted: "emerald", rejected: "rose" }

export function Selfie({ url, size = "h-10 w-10", onOpen, label }) {
  if (!url) {
    return (
      <span className={cn("inline-grid flex-none place-items-center rounded-lg bg-muted text-subtle-foreground", size)} title="No selfie">
        <Camera className="h-4 w-4" />
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label || "View selfie"}
      className={cn("flex-none overflow-hidden rounded-lg border border-border", size)}
    >
      <img src={url} alt="" className="h-full w-full object-cover" />
    </button>
  )
}

export function FlagBadges({ flags, field }) {
  const words = flagWords(flags)
  if (!words.length && !field) return <span className="text-subtle-foreground">-</span>
  return (
    <div className="flex flex-wrap gap-1">
      {field && <Badge tone="blue">Field</Badge>}
      {words.map((w) => (
        <Badge key={w} tone={w === "Fake location detected" ? "rose" : "amber"}>{w}</Badge>
      ))}
    </div>
  )
}

/** One person's day. `summary` is a DaySummary from lib/attendance. */
export function DayDrawer({ open, onClose, person, summary, selfId, canReview, onReviewed }) {
  const punches = summary?.punches || []
  const urls = useSelfieUrls(punches.map((p) => p.selfie_path))
  const [viewer, setViewer] = useState(null)
  const images = punches.map((p) => urls[p.selfie_path]).filter(Boolean)

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person?.name || "?"} src={person?.avatarUrl} className="h-9 w-9" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-foreground">{person?.name || "Unknown"}</h2>
            <p className="text-[13px] text-muted-foreground">{summary ? dayLabel(summary.day, true) : ""}</p>
          </div>
        </div>
      }
    >
      {summary && (
        <div className="space-y-5">
          <dl className="grid grid-cols-3 gap-3 text-[13px]">
            <div>
              <dt className="text-muted-foreground">First in</dt>
              <dd className="font-semibold text-foreground tabular">{summary.firstIn ? clockIST(summary.firstIn) : "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last out</dt>
              <dd className="font-semibold text-foreground tabular">
                {summary.lastOut && !summary.open ? clockIST(summary.lastOut) : summary.open ? "On duty" : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Worked</dt>
              <dd className="font-semibold text-foreground tabular">{durationWords(summary.workedMin)}</dd>
            </div>
          </dl>

          <ol className="space-y-3">
            {punches.map((p) => {
              const url = urls[p.selfie_path]
              const imgIndex = images.indexOf(url)
              return (
                <li key={p.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-3">
                    <Selfie
                      url={url}
                      size="h-14 w-14"
                      label={`Selfie for the ${p.kind === "in" ? "clock in" : "clock out"} at ${clockIST(p.at)}`}
                      onOpen={() => setViewer(imgIndex)}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          {p.kind === "in" ? "Clocked in" : "Clocked out"} · <span className="tabular">{clockIST(p.at)}</span>
                        </span>
                        <Badge tone={REVIEW_TONE[p.review] || "slate"}>{REVIEW_LABEL[p.review] || p.review}</Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 flex-none" />
                        {p.mode === "field"
                          ? "Field visit"
                          : `${p.site_name || "Office"}${p.distance_m != null ? ` · ${Math.round(p.distance_m)} m away` : ""}`}
                        {p.accuracy_m != null && <span> · accurate to {Math.round(p.accuracy_m)} m</span>}
                      </p>
                      {p.note && <p className="text-[13px] text-foreground">“{p.note}”</p>}
                      {(p.flags || []).length > 0 && <FlagBadges flags={p.flags} />}
                      {p.review_note && <p className="text-[12px] text-muted-foreground">Review note: {p.review_note}</p>}
                      {canReview && p.review === "flagged" && p.user_id !== selfId && (
                        <ReviewButtons punch={p} onDone={onReviewed} />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
      <ImageViewer
        open={viewer !== null && viewer >= 0}
        images={images}
        index={Math.max(0, viewer ?? 0)}
        alt="Attendance selfie"
        onClose={() => setViewer(null)}
        onIndexChange={setViewer}
      />
    </Drawer>
  )
}

/** Accept / Reject for a flagged punch. Reject asks for a reason first. */
export function ReviewButtons({ punch, onDone }) {
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState("")

  const decide = async (decision, reason) => {
    setBusy(true)
    try {
      await reviewPunch(punch.id, decision, reason)
      toast.success(decision === "accepted" ? "Accepted" : "Rejected")
      setRejecting(false)
      onDone?.()
    } catch (e) {
      toast.error(e.message || "Could not save the review")
    }
    setBusy(false)
  }

  return (
    <>
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => decide("accepted")} disabled={busy}>
          <CheckCircle2 className="h-4 w-4" /> Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={busy}>
          <X className="h-4 w-4" /> Reject
        </Button>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Reject this punch"
        width="max-w-md"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRejecting(false)}>Cancel</Button>
            <Button size="sm" onClick={() => decide("rejected", note)} disabled={busy || !note.trim()}>Reject</Button>
          </div>
        }
      >
        <Field label="Reason" required hint="The person sees this on their attendance.">
          <Textarea
            id={`reject-note-${punch.id}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="For example: selfie is not of the person clocking in"
          />
        </Field>
      </Modal>
    </>
  )
}
