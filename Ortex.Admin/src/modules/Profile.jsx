import { useState, useEffect } from "react"
import { toast } from "sonner"
import { ShieldCheck, KeyRound, Save } from "../components/icons"
import { Button, Card, Input, Field, Badge, PageLoader } from "../components/ui"
import PageHeader from "../components/PageHeader"
import { useProfile } from "../data/profile"
import { updateMyProfile } from "../data/users"
import { login, changePassword, currentEmail, currentUserId } from "../lib/auth"
import { hasSupabase } from "../data/supabaseClient"
import { MODULES } from "../data/modules"

const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }
const moduleLabel = (key) => MODULES.find((m) => m.key === key)?.label || key

export default function Profile() {
  const profile = useProfile()
  if (!profile) return <PageLoader />
  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your account details and password" />
      <ProfileHeader profile={profile} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountCard profile={profile} />
        <PasswordCard />
      </div>
    </div>
  )
}

// Minimal-style profile hero: gradient cover with the avatar overlapping.
function ProfileHeader({ profile }) {
  const email = profile.email || currentEmail() || "—"
  const name = profile.name || email
  const isAdmin = profile.role === "admin"
  return (
    <Card className="overflow-hidden p-0">
      <div className="h-28 bg-gradient-to-br from-primary via-primary to-accent" />
      <div className="-mt-12 flex flex-col items-center gap-3 px-6 pb-6 text-center sm:flex-row sm:items-end sm:text-left">
        <span className="flex h-24 w-24 flex-none items-center justify-center rounded-full bg-primary/10 text-3xl font-bold text-primary ring-4 ring-card">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 sm:pb-2">
          <div className="truncate text-lg font-semibold text-foreground">{name || "—"}</div>
          <div className="truncate text-sm text-muted-foreground">{email}</div>
        </div>
        <Badge tone={isAdmin ? "violet" : "blue"} className="sm:mb-2">
          {ROLE_LABEL[profile.role] || profile.role}
        </Badge>
      </div>
    </Card>
  )
}

function AccountCard({ profile }) {
  const [name, setName] = useState(profile.name || "")
  const [busy, setBusy] = useState(false)
  useEffect(() => setName(profile.name || ""), [profile.name])

  const email = profile.email || currentEmail() || "—"
  const isAdmin = profile.role === "admin"

  const save = async () => {
    if (!hasSupabase) return toast.error("Editing your name needs the backend enabled")
    setBusy(true)
    const res = await updateMyProfile(currentUserId(), { name: name.trim() })
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success("Profile updated")
  }

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="mb-4 font-semibold text-foreground">Account details</h3>

      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </Field>
      <Field label="Email" className="mt-3">
        <Input value={email} disabled />
      </Field>

      <div className="mt-4">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module access</span>
        {isAdmin ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" /> Full access to every module.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="slate">Dashboard</Badge>
            {(profile.modules || []).map((k) => (
              <Badge key={k} tone="slate">{moduleLabel(k)}</Badge>
            ))}
          </div>
        )}
      </div>

      <Button size="sm" className="mt-5" onClick={save} disabled={busy}>
        <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
      </Button>
    </Card>
  )
}

function PasswordCard() {
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
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold text-foreground">Change password</h3>
          <p className="text-sm text-muted-foreground">Update the password you sign in with.</p>
        </div>
      </div>
      <form onSubmit={submit} className="grid gap-3">
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
