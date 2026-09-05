import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CheckCircle2, MessageCircle, Phone, RefreshCw } from "../../components/ui/Icons"
import { Badge, Button, Drawer } from "../../components/ui/Ui"
import { repo } from "../../data/store/repository"
import { formatCurrency, formatDateTime } from "../../lib/format"
import { cn } from "../../lib/cn"
import { dialNow, recordingUrl } from "../../services/telecaller"
import { duration, kindMeta, outcomeMeta, prettyPhone } from "./helpers"

function Row({ label, children }) {
  if (!children && children !== 0) return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-28 flex-none text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 text-foreground">{children}</span>
    </div>
  )
}

// One call in full: what the agent knew going in, the transcript, and what the
// analyst pulled out. Footer actions hand the result to a human: mark handled,
// open WhatsApp with the promised follow-up, or call again.
export default function CallDrawer({ call, onClose }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  useEffect(() => {
    let alive = true
    setAudioUrl(null)
    if (call?.recordingPath) recordingUrl(call.recordingPath).then((u) => { if (alive) setAudioUrl(u) })
    else if (call?.recordingUrl) setAudioUrl(call.recordingUrl)
    return () => { alive = false }
  }, [call?.id, call?.recordingPath, call?.recordingUrl])
  if (!call) return null
  const a = call.analysis || {}
  const o = outcomeMeta(a.outcome)
  const k = kindMeta(call.kind)
  const wa = `91${String(call.phone).replace(/\D/g, "").slice(-10)}`
  const waText = encodeURIComponent(`Hi ${call.contactName || ""}, this is the Ortex Industries team following up on our call. `)

  const markHandled = async () => {
    await repo.update("telecaller_calls", call.id, { handled: true, handledAt: new Date().toISOString() })
    toast.success("Marked as handled")
  }
  const callAgain = async () => {
    setBusy(true)
    const res = await dialNow({ jobId: call.jobId })
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success(res.simulated ? "Simulated call done" : "Ringing…")
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={call.contactName || prettyPhone(call.phone)}
      subtitle={`${k.label} · ${formatDateTime(call.startedAt || call.createdAt)} · ${duration(call.durationSec)}`}
      width="max-w-2xl"
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <a href={`https://wa.me/${wa}?text=${waText}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted">
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </a>
          {a.outcome === "needs_quote" || a.outcome === "deal_closed" ? (
            <Button variant="outline" onClick={() => navigate("/quotations")}>Create quotation</Button>
          ) : null}
          <span className="flex-1" />
          <Button variant="outline" disabled={busy} onClick={callAgain}><RefreshCw className="h-4 w-4" /> Call again</Button>
          {!call.handled && <Button onClick={markHandled}><CheckCircle2 className="h-4 w-4" /> Handled</Button>}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {a.outcome && <Badge tone={o.tone}>{o.label}</Badge>}
          {a.sentiment && <Badge tone={a.sentiment === "positive" ? "emerald" : a.sentiment === "negative" ? "rose" : "slate"}>{a.sentiment}</Badge>}
          {a.interest != null && <Badge tone="blue">interest {a.interest}/10</Badge>}
          {call.simulated && <Badge tone="slate">simulated</Badge>}
          {call.handled && <Badge tone="emerald">handled</Badge>}
          <span className="ml-auto text-xs text-muted-foreground"><Phone className="mr-1 inline h-3.5 w-3.5" />{prettyPhone(call.phone)}</span>
        </div>

        {audioUrl && (
          <div>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recording</h4>
            <audio controls preload="none" src={audioUrl} className="w-full" />
          </div>
        )}

        {call.error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive-text">{call.error}</div>}

        {a.summary && (
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-sm leading-relaxed text-foreground">{a.summary}</p>
            {a.nextAction && <p className="mt-2 text-sm font-semibold text-foreground">Next: {a.nextAction}</p>}
          </div>
        )}

        <div className="space-y-2">
          <Row label="Items">{a.items?.length ? a.items.map((i) => `${i.product} × ${i.quantity || "?"}`).join(", ") : null}</Row>
          <Row label="Timeline">{a.timeline}</Row>
          <Row label="City">{a.city}</Row>
          <Row label="Value">{a.estimatedValue ? formatCurrency(a.estimatedValue) : null}</Row>
          <Row label="Callback">{a.callbackAt ? formatDateTime(a.callbackAt) : null}</Row>
          <Row label="Objections">{a.objections?.length ? a.objections.join(" · ") : null}</Row>
          <Row label="Feedback">{a.feedbackRating ? `${a.feedbackRating}/5${a.feedbackNotes ? ` - ${a.feedbackNotes}` : ""}` : null}</Row>
          <Row label="Upsell">{a.upsellAccepted ? "Accepted an add-on / reorder" : null}</Row>
          <Row label="Ended">{call.endedReason}</Row>
          {call.recordingUrl && (
            <Row label="Recording"><a className="text-primary underline" href={call.recordingUrl} target="_blank" rel="noopener noreferrer">Listen</a></Row>
          )}
        </div>

        {call.brief?.context && (
          <details className="rounded-lg border border-border/60 p-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">What the agent knew going in</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">{call.brief.context}</pre>
          </details>
        )}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transcript</h4>
          {call.transcript?.length ? (
            <div className="space-y-2">
              {call.transcript.map((t, i) => (
                <div key={i} className={cn("flex", t.role === "customer" ? "justify-start" : "justify-end")}>
                  <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed", t.role === "customer" ? "bg-muted text-foreground" : "bg-primary/10 text-foreground")}>
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t.role === "customer" ? call.contactName || "Customer" : "Agent"}</span>
                    {t.text}
                  </div>
                </div>
              ))}
            </div>
          ) : call.transcriptText ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-sans text-sm">{call.transcriptText}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">{["dialing", "ringing", "in_progress"].includes(call.status) ? "Call in progress - the transcript arrives when it ends." : "No transcript captured."}</p>
          )}
        </div>
      </div>
    </Drawer>
  )
}
