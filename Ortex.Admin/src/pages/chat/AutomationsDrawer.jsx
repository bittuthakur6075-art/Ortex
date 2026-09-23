import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Banner, Button, Drawer, Input } from "../../components/ui/Ui"
import { supabase } from "../../data/store/supabaseClient"
import { cn } from "../../lib/cn"
import { TEAM_TITLES } from "../../lib/anuIntent"

// Anu's scheduled posts (migration 0046): when each runs, for which teams, and
// what happened today. The Super Admin edits; admins can see and send now.
// Everything here is computed by the database, no model involved.

const JOBS = [
  { key: "dailyUpdate", title: "Daily team update", detail: "Leads, quotations, overdue invoices, payments, approvals and holidays, per team." },
  { key: "attendanceMorning", title: "Attendance, morning", detail: "Who checked in, who is late, who is not in yet, who is on leave." },
  { key: "attendanceEvening", title: "Attendance, evening", detail: "Present, absent and on leave for the day, and who has not checked out." },
]
const TEAMS = ["sales", "accounts", "staff", "management", "everyone"]

export default function AutomationsDrawer({ open, onClose, superAdmin }) {
  const [doc, setDoc] = useState(null)
  const [runs, setRuns] = useState([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState("")

  const load = async () => {
    setError("")
    const [s, r] = await Promise.all([
      supabase.from("anu_bot_settings").select("doc").maybeSingle(),
      supabase.from("anu_bot_runs").select("*").order("ran_at", { ascending: false }).limit(40),
    ])
    if (s.error) return setError(/does not exist|schema cache/i.test(s.error.message) ? "Anu's automations need database migration 0046." : s.error.message)
    setDoc(s.data?.doc || {})
    setRuns(r.data || [])
  }

  useEffect(() => { if (open) load() }, [open])

  const patch = (job, change) => setDoc((d) => ({ ...d, [job]: { ...(d?.[job] || {}), ...change } }))

  const save = async () => {
    setSaving(true)
    const { error: e } = await supabase.from("anu_bot_settings").update({ doc, updated_at: new Date().toISOString() }).eq("id", true)
    setSaving(false)
    if (e) return toast.error(e.message)
    toast.success("Schedule saved")
  }

  const sendNow = async (job, team) => {
    setSending(`${job}:${team}`)
    const { data, error: e } = await supabase.rpc("anu_bot_run_now", { p_job: job, p_team: team })
    setSending("")
    if (e) return toast.error(e.message)
    toast.success(data === "posted" ? `Posted to ${TEAM_TITLES[team]}` : `Nothing to post for ${TEAM_TITLES[team]} today`)
    load()
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Anu's automations"
      subtitle="Posted to team channels by the database on a schedule. No AI involved."
      width="max-w-xl"
      footer={superAdmin && doc ? <Button onClick={save} disabled={saving} className="w-full">{saving ? "Saving…" : "Save schedule"}</Button> : null}
    >
      {error && <Banner tone="warning">{error}</Banner>}
      {!superAdmin && doc && <Banner tone="info" className="mb-4">Only the Super Admin can change the schedule. You can send any update now.</Banner>}
      {doc && (
        <div className="space-y-4">
          {JOBS.map((j) => {
            const cfg = doc[j.key] || {}
            const teams = cfg.teams || []
            return (
              <section key={j.key} className="rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-foreground">{j.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{j.detail}</p>
                  </div>
                  <label className="flex flex-none items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={Boolean(cfg.enabled)} disabled={!superAdmin} onChange={(e) => patch(j.key, { enabled: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                    On
                  </label>
                  <Input type="time" value={cfg.time || ""} disabled={!superAdmin} onChange={(e) => patch(j.key, { time: e.target.value })} className="w-[120px] flex-none" aria-label={`${j.title} time`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {TEAMS.map((t) => {
                    const on = teams.includes(t)
                    const ran = runs.find((r) => r.job === j.key && r.team === t && r.day === today)
                    return (
                      <div key={t} className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-xs", on ? "border-primary/40 bg-primary/5" : "border-border")}>
                        <button
                          type="button"
                          disabled={!superAdmin}
                          onClick={() => patch(j.key, { teams: on ? teams.filter((x) => x !== t) : [...teams, t] })}
                          className={cn("font-medium", on ? "text-primary" : "text-muted-foreground", superAdmin && "hover:underline")}
                          title={superAdmin ? (on ? "Stop posting to this team" : "Post to this team") : undefined}
                        >
                          {TEAM_TITLES[t]}
                        </button>
                        {ran && <span className="text-subtle-foreground" title={`Today: ${ran.outcome}`}>· {ran.outcome === "posted" ? "sent" : ran.outcome}</span>}
                        <button
                          type="button"
                          onClick={() => sendNow(j.key, t)}
                          disabled={Boolean(sending)}
                          className="ml-1 rounded px-1 font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
                          title={`Send ${j.title.toLowerCase()} to ${TEAM_TITLES[t]} now`}
                        >
                          {sending === `${j.key}:${t}` ? "…" : "Send now"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
          <p className="text-xs text-muted-foreground">
            Times are India time. Each update posts once a day, within two hours of its time, and never on a holiday or weekly off.
          </p>
        </div>
      )}
    </Drawer>
  )
}
