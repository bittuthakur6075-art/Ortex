import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Monitor, Smartphone, LogOut } from "../../components/ui/Icons"
import { Badge, Button, Card } from "../../components/ui/Ui"
import { listSessions, revokeSession, logoutOtherDevices } from "../../lib/auth"
import { describeDevice } from "../../lib/sessions"
import { formatDateTime, relativeTime } from "../../lib/format"

// Every device signed in to this account, with a way to sign any of them out
// (migration 0063). A signed-out device can no longer refresh; its current
// access token lapses within the hour.
export default function SessionsCard() {
  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")

  const load = useCallback(async () => {
    const res = await listSessions()
    if (res.error) setError(res.error)
    else {
      setError("")
      setSessions(res.sessions)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const revoke = async (id) => {
    setBusy(id)
    const res = await revokeSession(id)
    setBusy("")
    if (res.error) return toast.error(res.error)
    toast.success("That device has been signed out")
    load()
  }

  const revokeOthers = async () => {
    setBusy("others")
    const res = await logoutOtherDevices()
    setBusy("")
    if (res.error) return toast.error(res.error)
    toast.success("Signed out of every other device")
    load()
  }

  const others = (sessions || []).filter((s) => !s.is_current).length

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-4">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-muted text-muted-foreground">
          <Monitor className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-5 text-foreground">Login sessions</h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Devices signed in to your account. Sign out any you do not recognise, then change your password.
          </p>
        </div>
        {others > 0 && (
          <Button variant="outline" size="sm" onClick={revokeOthers} disabled={!!busy}>
            <LogOut className="h-4 w-4" />
            {busy === "others" ? "Signing out…" : "Log out all other devices"}
          </Button>
        )}
      </div>

      {error ? (
        <p className="px-5 py-5 text-sm text-destructive">{error}</p>
      ) : !sessions ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">No active sessions found.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => {
            const device = describeDevice(s.user_agent)
            const Icon = device.kind === "phone" ? Smartphone : Monitor
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-lg bg-primary/10 text-primary">
                  <Icon variant="Bold" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{device.label}</span>
                    {s.is_current && <Badge tone="emerald">This device</Badge>}
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {[
                      s.ip && `IP ${s.ip}`,
                      `Signed in ${formatDateTime(s.created_at)}`,
                      s.is_current ? "Active now" : `Last active ${relativeTime(s.last_active)}`,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!s.is_current && (
                  <Button variant="ghost" size="sm" onClick={() => revoke(s.id)} disabled={!!busy}>
                    {busy === s.id ? "Signing out…" : "Log out"}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
