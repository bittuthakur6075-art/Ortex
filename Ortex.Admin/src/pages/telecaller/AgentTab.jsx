import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Mic, RefreshCw, Save, Sparkles } from "../../components/ui/Icons"
import { TELECALL_KINDS } from "../../data/domain/schema"
import { TELECALL_LANGUAGES } from "../../data/domain/telecallerLanguages"
import { Button, Card, Field, Input, Select, Textarea } from "../../components/ui/Ui"
import { DEFAULT_SETTINGS } from "../../data/domain/settingsDefaults"
import { repo } from "../../data/store/repository"
import { useSettings } from "../../hooks/useCollection"
import { refreshPulse } from "../../services/telecaller"
import { formatDateTime } from "../../lib/format"

const Section = ({ title, hint, children }) => (
  <Card className="p-5 ring-1 ring-border/60">
    <h3 className="font-semibold text-foreground">{title}</h3>
    {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
  </Card>
)

const Check = ({ checked, onChange, children }) => (
  <label className="flex items-center gap-2 text-sm text-foreground">
    <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
    {children}
  </label>
)

// Everything that shapes how the agent calls: persona, hours, cadences, pitch
// notes, do-not-call. Saved into settings.telecaller; the Edge Functions read
// the same block, so a change here applies to the very next call.
const SCRIPT_HINT = {
  followup: "Default: reconnect, confirm items / quantity / timeline / city, handle objections, close on a free mockup + quotation or book a callback.",
  pitch: "Default: introduce Ortex, discover the use-case, recommend a product, move to a mockup + quotation.",
  feedback: "Default: thank them, ask about quality / packaging / timing, capture a 1-5 rating, log any issue, ask for a review or referral.",
  upsell: "Default: reference the last order, ask what is coming up, suggest add-ons or a reorder at volume rates, close on a mockup + quotation.",
}

export default function AgentTab({ isAdmin, onPractice }) {
  const settings = useSettings()
  const [t, setT] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pulsing, setPulsing] = useState(false)
  const pulse = settings?.telecaller?.pulse
  const doPulse = async () => {
    setPulsing(true)
    const res = await refreshPulse()
    setPulsing(false)
    if (res.error) return toast.error(res.error)
    toast.success("Pulse refreshed")
  }

  useEffect(() => { if (settings && !t) setT(settings.telecaller || DEFAULT_SETTINGS.telecaller) }, [settings, t])
  if (!t) return null

  const set = (key, v) => setT((x) => ({ ...x, [key]: v }))
  const setIn = (group, key, v) => setT((x) => ({ ...x, [group]: { ...x[group], [key]: v } }))
  const num = (v, fallback) => (v === "" ? fallback : Number(v))

  const save = async () => {
    setSaving(true)
    try {
      const latest = await repo.getSettings()
      await repo.saveSettings({ ...latest, telecaller: { ...t, doNotCall: (t.doNotCall || []).map((p) => String(p).replace(/\D/g, "").slice(-10)).filter(Boolean) } })
      toast.success("Agent settings saved")
    } catch (e) {
      toast.error(e.message || "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Agent" hint="Who calls, in which language, and whether the scheduler is allowed to dial on its own.">
        <Field label="Agent name"><Input value={t.agentName} onChange={(e) => set("agentName", e.target.value)} /></Field>
        <Field label="Language" hint={t.language === "auto" ? "Sneha opens in Hinglish and switches to whatever the customer speaks: Tamil, Bengali, Marathi, English…" : "Fixed language for every call. Auto is recommended."}>
          <Select value={t.language} onChange={(e) => set("language", e.target.value)}>
            {TELECALL_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}{l.tier === "basic" ? " (basic)" : ""}</option>)}
          </Select>
        </Field>
        <Field label="Provider" hint={t.provider === "simulate" ? "Simulate: Gemini role-plays the customer, no phone rings. Switch to Vapi once the keys are set." : "Vapi places real calls from the number configured in the Edge Function secrets."}>
          <Select value={t.provider} onChange={(e) => set("provider", e.target.value)}>
            <option value="simulate">Simulate (no phone)</option>
            <option value="vapi">Vapi (real calls)</option>
          </Select>
        </Field>
        <div className="flex flex-col justify-end gap-2">
          <Check checked={t.enabled} onChange={(v) => set("enabled", v)}>Automatic calling on (scheduler dials due jobs)</Check>
          <Check checked={t.autoQueueNewLeads} onChange={(v) => set("autoQueueNewLeads", v)}>Auto-queue new leads and voice leads for follow-up</Check>
        </div>
      </Section>

      <Section title="Calling window & limits" hint="No calls on Sundays or outside this window. Retries and rounds always land inside it.">
        <Field label="From"><Input type="time" value={t.callingHours.start} onChange={(e) => setIn("callingHours", "start", e.target.value)} /></Field>
        <Field label="To"><Input type="time" value={t.callingHours.end} onChange={(e) => setIn("callingHours", "end", e.target.value)} /></Field>
        <Field label="Daily cap (calls)"><Input type="number" min="1" value={t.dailyCap} onChange={(e) => set("dailyCap", num(e.target.value, 40))} /></Field>
        <Field label="Attempts per job" hint="No answer / busy retries before the job is marked failed."><Input type="number" min="1" max="6" value={t.maxAttempts} onChange={(e) => set("maxAttempts", num(e.target.value, 3))} /></Field>
        <Field label="Retry gap (hours)"><Input type="number" min="1" value={t.retryGapHours} onChange={(e) => set("retryGapHours", num(e.target.value, 24))} /></Field>
        <Field label="Timezone"><Input value={t.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
      </Section>

      <Section title="Follow-up, feedback & upsell" hint="The lifecycle: pitch → follow-up rounds until closed → feedback after delivery → periodic upsell calls to keep the customer coming back.">
        <div className="space-y-3">
          <Check checked={t.followUp.enabled} onChange={(v) => setIn("followUp", "enabled", v)}>Follow-up rounds after an interested call</Check>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Delay (hours)"><Input type="number" min="1" value={t.followUp.delayHours} onChange={(e) => setIn("followUp", "delayHours", num(e.target.value, 24))} /></Field>
            <Field label="Max rounds"><Input type="number" min="1" max="6" value={t.followUp.maxRounds} onChange={(e) => setIn("followUp", "maxRounds", num(e.target.value, 3))} /></Field>
          </div>
        </div>
        <div className="space-y-3">
          <Check checked={t.feedback.enabled} onChange={(v) => setIn("feedback", "enabled", v)}>Feedback call after every invoice</Check>
          <Field label="Days after invoice"><Input type="number" min="1" value={t.feedback.daysAfterInvoice} onChange={(e) => setIn("feedback", "daysAfterInvoice", num(e.target.value, 7))} /></Field>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <Check checked={t.upsell.enabled} onChange={(v) => setIn("upsell", "enabled", v)}>Upsell / reorder calls to existing customers</Check>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First call, days after invoice"><Input type="number" min="1" value={t.upsell.daysAfterInvoice} onChange={(e) => setIn("upsell", "daysAfterInvoice", num(e.target.value, 30))} /></Field>
            <Field label="Repeat every (days)"><Input type="number" min="7" value={t.upsell.repeatEveryDays} onChange={(e) => setIn("upsell", "repeatEveryDays", num(e.target.value, 90))} /></Field>
          </div>
        </div>
      </Section>

      <Section title="Training" hint="How the agent should sound, and what each type of call must achieve. Blank fields keep the built-in defaults. Rehearse with Practice, read the transcript, refine, repeat.">
        <Field label="Persona & style" hint="Tone, phrases to use, phrases to avoid, how to handle Hindi vs English, how formal to be." className="sm:col-span-2">
          <Textarea rows={4} value={t.scripts?.persona || ""} onChange={(e) => setIn("scripts", "persona", e.target.value)} placeholder="Warm and respectful, always 'ji'. Never say 'cheapest'. Mention we are in Mundka, New Delhi. If the customer speaks English, switch fully to English." />
        </Field>
        {TELECALL_KINDS.filter((k) => k.id !== "manual").map((k) => (
          <Field key={k.id} label={`${k.label} call script`} hint={SCRIPT_HINT[k.id]}>
            <Textarea rows={4} value={t.scripts?.[k.id] || ""} onChange={(e) => setIn("scripts", k.id, e.target.value)} />
          </Field>
        ))}
        {onPractice && (
          <div className="sm:col-span-2">
            <Button variant="outline" size="sm" onClick={onPractice}><Mic className="h-4 w-4" /> Practice a call now</Button>
            <span className="ml-2 text-xs text-muted-foreground">Save first so the practice call uses the latest scripts.</span>
          </div>
        )}
      </Section>

      <Section title="India business pulse" hint="A daily research brief (news, events, market mood) that Sneha weaves into calls as openers. Refreshed automatically once a day with Google Search; refresh now after big news.">
        <div className="sm:col-span-2">
          {pulse?.text ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-sans text-sm text-foreground">{pulse.text}</pre>
          ) : (
            <p className="text-sm text-muted-foreground">Not generated yet. It appears after the first call or sweep, or press Refresh.</p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <Button variant="outline" size="sm" disabled={pulsing} onClick={doPulse}><RefreshCw className="h-4 w-4" /> {pulsing ? "Researching…" : "Refresh pulse"}</Button>
            {pulse?.at && <span className="text-xs text-muted-foreground">Updated {formatDateTime(pulse.at)}</span>}
          </div>
        </div>
      </Section>

      <Section title="Pitch notes" hint="Current offers, seasonal pushes, products to lead with, things to never say. The agent reads this before every call.">
        <Field className="sm:col-span-2">
          <Textarea rows={5} value={t.pitchNotes} onChange={(e) => set("pitchNotes", e.target.value)} placeholder="e.g. Diwali gifting bookings open - push gift hampers (bottle + diary + pen). 10% off on 500+ lanyards this month. Never promise delivery under 4 days." />
        </Field>
        <Field label="Your upcoming occasions" hint="Sneha already knows the Indian festival calendar, IST time and regional festivals by city. Add your own dates here, one per line: YYYY-MM-DD Name - what to pitch (e.g. 2026-10-15 Delhi Corporate Gifting Expo - invite buyers to the stall, offer exhibition pricing)." className="sm:col-span-2">
          <Textarea rows={3} value={t.occasions || ""} onChange={(e) => set("occasions", e.target.value)} placeholder="2026-10-15 Delhi Corporate Gifting Expo - invite buyers to our stall, exhibition-only rates" />
        </Field>
        <Field label="Do not call" hint="One number per line. Anyone who asks not to be called is added here automatically." className="sm:col-span-2">
          <Textarea rows={3} value={(t.doNotCall || []).join("\n")} onChange={(e) => set("doNotCall", e.target.value.split(/\n/).map((s) => s.trim()).filter(Boolean))} />
        </Field>
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          Keys (Gemini, Vapi, webhook secret) are Edge Function secrets - see docs/guides/TELECALLER_SETUP.md.
        </p>
        <Button onClick={save} disabled={saving || isAdmin === false}><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save agent settings"}</Button>
      </div>
    </div>
  )
}
