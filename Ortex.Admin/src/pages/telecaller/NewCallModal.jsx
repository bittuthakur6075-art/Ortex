import { useState } from "react"
import { toast } from "sonner"
import { Phone } from "../../components/ui/Icons"
import { Button, Field, Input, Modal, Select, Textarea } from "../../components/ui/Ui"
import { TELECALL_KINDS } from "../../data/domain/schema"
import { dialNow } from "../../services/telecaller"
import { isValidMobile, toLocalInput } from "./helpers"

const EMPTY = { contactName: "", phone: "", company: "", kind: "pitch", objective: "", when: "" }

// Ring anyone: a fresh prospect, a number from a business card, a customer the
// team wants checked on. Creates the job and dials it now, or queues it for the
// chosen time.
export default function NewCallModal({ open, onClose, onDialed }) {
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  const submit = async (queueOnly) => {
    if (!isValidMobile(f.phone)) return toast.error("Enter a valid 10-digit Indian mobile number")
    setBusy(true)
    const res = await dialNow({
      target: {
        contactName: f.contactName, phone: f.phone, company: f.company, kind: f.kind, objective: f.objective,
        scheduledAt: f.when ? new Date(f.when).toISOString() : undefined, source: "console",
      },
      queueOnly,
    })
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success(queueOnly ? "Call queued" : res.simulated ? "Simulated call done" : "Ringing…")
    setF(EMPTY)
    onDialed?.(res)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New AI call"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => submit(true)}>Queue for later</Button>
          <Button disabled={busy} onClick={() => submit(false)}><Phone className="h-4 w-4" /> {busy ? "Calling…" : "Call now"}</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Sanjay" /></Field>
        <Field label="Mobile" required><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" /></Field>
        <Field label="Company"><Input value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        <Field label="Type of call">
          <Select value={f.kind} onChange={(e) => set("kind", e.target.value)}>
            {TELECALL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </Select>
        </Field>
        <Field label="Objective / what the agent should know" className="sm:col-span-2">
          <Textarea rows={3} value={f.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Met at the Pragati Maidan expo, wants 500 lanyards for a college fest in October. Close on a mockup." />
        </Field>
        <Field label="Schedule (optional)" hint="Leave empty to call right away." className="sm:col-span-2">
          <Input type="datetime-local" value={f.when} min={toLocalInput(new Date().toISOString())} onChange={(e) => set("when", e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
