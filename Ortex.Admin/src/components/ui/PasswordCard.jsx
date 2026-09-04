import { useState } from "react"
import { toast } from "sonner"
import { KeyRound } from "./Icons"
import { Button, Card, Input } from "./Ui"
import { login, changePassword, currentEmail } from "../../lib/auth"

// Change-password form shared by Settings and Profile. Verifies the current
// password by re-authenticating before updating it.
export default function PasswordCard({ title = "Change password", description = "Update the password you sign in with.", className }) {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (next.length < 6) return toast.error("New password must be at least 6 characters")
    if (next !== confirm) return toast.error("Passwords do not match")
    setBusy(true)
    const check = await login(currentEmail() || "", current)
    if (check.error) {
      setBusy(false)
      return toast.error("Current password is incorrect")
    }
    const res = await changePassword(next)
    setBusy(false)
    if (res?.error) return toast.error(res.error)
    setCurrent("")
    setNext("")
    setConfirm("")
    toast.success("Password updated")
  }

  return (
    <Card className={className}>
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-muted text-muted-foreground">
          <KeyRound className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-5 text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      <form onSubmit={submit} className="grid max-w-md gap-3 px-5 py-5">
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" />
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" autoComplete="new-password" />
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" />
        <Button type="submit" size="sm" className="justify-self-start" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </Button>
      </form>
    </Card>
  )
}
