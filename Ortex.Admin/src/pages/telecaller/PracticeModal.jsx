import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Mic, Phone, Sparkles, X } from "../../components/ui/Icons"
import { Badge, Button, Field, Input, Modal, Select } from "../../components/ui/Ui"
import { TELECALL_KINDS } from "../../data/domain/schema"
import { cn } from "../../lib/cn"
import { briefFor, recordLiveCall } from "../../services/telecaller"
import { duration, isValidMobile, kindMeta, prettyPhone } from "./helpers"
import { useLiveCall } from "./useLiveCall"

// Practice studio: talk to the agent with your microphone, playing the
// customer. Uses Gemini Live with the exact brief a phone call would get, so
// what you hear is what a lead would hear. On hang-up the transcript is
// analysed and saved as a (practice) call, which also moves the lead — pick a
// scratch contact or your own number when you only want to rehearse.
//
// `job` (optional): a queued job to practise against. Without it, a small form
// creates a scratch job first.
export default function PracticeModal({ open, job, onClose, onRecorded }) {
  const call = useLiveCall()
  const [phase, setPhase] = useState("setup") // setup | call | saving
  const [brief, setBrief] = useState(null)
  const [f, setF] = useState({ contactName: "Practice customer", phone: "", kind: "followup", objective: "" })
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  useEffect(() => { if (!open) { call.reset(); setPhase("setup"); setBrief(null) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }) }, [call.turns, call.live])

  const begin = async () => {
    setLoading(true)
    const res = job
      ? await briefFor({ jobId: job.id })
      : isValidMobile(f.phone)
        ? await briefFor({ target: { ...f, source: "practice" } })
        : { error: "Enter a valid 10-digit mobile (your own is fine — nothing rings)." }
    setLoading(false)
    if (res.error) return toast.error(res.error)
    setBrief(res)
    setPhase("call")
    call.start(res.brief, res.language)
  }

  const finish = async () => {
    call.hangUp()
    const turns = call.turns
    if (!turns.length) { toast.warning("Nothing was said — not saved."); onClose(); return }
    setPhase("saving")
    const res = await recordLiveCall({ jobId: brief.jobId, transcript: turns, durationSec: call.seconds, startedAt: call.startedAt })
    if (res.error) { toast.error(res.error); setPhase("call"); return }
    toast.success(`Practice call analysed — ${String(res.analysis?.outcome || "").replace(/_/g, " ")}`)
    onRecorded?.(res)
    onClose()
  }

  // The session ended from the agent's side (it said goodbye and hung up).
  useEffect(() => { if (phase === "call" && call.status === "ended" && call.turns.length) finish() }, [call.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const who = brief?.job || job
  const k = kindMeta(who?.kind || f.kind)

  return (
    <Modal
      open={open}
      onClose={() => { call.reset(); onClose() }}
      title="Practice with the agent"
      width="max-w-2xl"
      footer={
        phase === "setup" ? (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}><X className="h-4 w-4" /> Close</Button>
            <Button disabled={loading} onClick={begin}><Mic className="h-4 w-4" /> {loading ? "Preparing brief…" : "Start call"}</Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2">
            <span className="text-sm tabular text-muted-foreground">{duration(call.seconds)}</span>
            <Badge tone={call.status === "live" ? "emerald" : call.status === "connecting" ? "amber" : "slate"}>{call.status}</Badge>
            <span className="flex-1" />
            <Button variant="danger" disabled={phase === "saving"} onClick={finish}>
              <Phone className="h-4 w-4" /> {phase === "saving" ? "Analysing…" : "Hang up & analyse"}
            </Button>
          </div>
        )
      }
    >
      {phase === "setup" ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <Sparkles className="mr-1 inline h-4 w-4" />
            You play the customer. {brief?.agentName || "The agent"} opens the call with the real brief for this person, in the language set under Agent. Free: no phone, no Vapi.
          </p>
          {job ? (
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              <div className="font-semibold text-foreground">{job.contactName || "Unnamed"} · {prettyPhone(job.phone)}</div>
              <div className="mt-1 flex items-center gap-2 text-muted-foreground"><Badge tone={k.tone}>{k.label}</Badge>{job.objective || job.context?.productInterest || job.source}</div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Customer name"><Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
              <Field label="Mobile" hint="Nothing rings; it only keys the record."><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="Your own number" /></Field>
              <Field label="Type of call">
                <Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
                  {TELECALL_KINDS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </Select>
              </Field>
              <Field label="Scenario / objective"><Input value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} placeholder="500 lanyards for a college fest, wants a price today" /></Field>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/40 p-3">
            <canvas ref={call.canvasRef} className="h-16 w-full" />
            <div className="mt-1 text-center text-xs text-muted-foreground">
              {call.status === "connecting" ? "Connecting…" : call.speaking ? `${brief?.agentName || "Agent"} is speaking` : call.status === "live" ? "Your turn — speak" : call.errorMsg || "Call ended"}
            </div>
          </div>
          <div ref={listRef} className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {call.turns.map((t, i) => <Bubble key={i} role={t.role} text={t.text} name={who?.contactName} agent={brief?.agentName} />)}
            {call.live.customer && <Bubble role="customer" text={call.live.customer} name={who?.contactName} partial />}
            {call.live.agent && <Bubble role="agent" text={call.live.agent} agent={brief?.agentName} partial />}
            {!call.turns.length && !call.live.agent && !call.live.customer && <p className="py-6 text-center text-sm text-muted-foreground">Transcript appears here as you talk.</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Bubble({ role, text, name, agent, partial }) {
  const customer = role === "customer"
  return (
    <div className={cn("flex", customer ? "justify-start" : "justify-end")}>
      <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed", customer ? "bg-muted" : "bg-primary/10", partial && "opacity-70")}>
        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{customer ? name || "You (customer)" : agent || "Agent"}</span>
        {text}
      </div>
    </div>
  )
}
