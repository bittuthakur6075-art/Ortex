import { useState, useEffect } from "react"
import { toast } from "sonner"
import { ShieldCheck, Save } from "../components/ui/Icons"
import { Button, Card, Input, Field, Badge, PageLoader } from "../components/ui/Ui"
import PageHeader from "../components/layout/PageHeader"
import PasswordCard from "../components/ui/PasswordCard"
import { useProfile } from "../hooks/useProfile"
import { updateMyProfile } from "../services/users"
import { currentEmail, currentUserId } from "../lib/auth"
import { hasSupabase } from "../data/store/supabaseClient"
import { roleLabel, moduleLabel } from "../lib/roles"

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
          {roleLabel(profile.role)}
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

