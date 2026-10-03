import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Save } from "../components/ui/Icons"
import { Button, Card, Input, Field, Badge, PageLoader } from "../components/ui/Ui"
import PageHeader from "../components/layout/PageHeader"
import PasswordCard from "../components/ui/PasswordCard"
import { useProfile, refreshProfile } from "../hooks/useProfile"
import AvatarUploader from "./profile/AvatarUploader"
import QuotationDefaultsCard from "./profile/QuotationDefaultsCard"
import SessionsCard from "./profile/SessionsCard"
import { updateMyProfile } from "../services/users"
import { currentEmail, currentUserId } from "../lib/auth"
import { hasSupabase } from "../data/store/supabaseClient"
import { roleLabel, ROLE_TONE } from "../lib/roles"
import { MODULES, canAccess } from "../data/domain/modules"

export default function Profile() {
  const profile = useProfile()
  if (!profile) return <PageLoader />
  return (
    <div>
      <PageHeader title="My profile" subtitle="Your account details and password" />
      <ProfileHeader profile={profile} />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountCard profile={profile} />
        <PasswordCard />
      </div>
      <div className="mt-4">
        <QuotationDefaultsCard profile={profile} />
      </div>
      <div className="mt-4">
        {hasSupabase && <SessionsCard />}
      </div>
    </div>
  )
}

// Minimal-style profile hero: gradient cover with the avatar overlapping.
// The avatar doubles as the photo picker.
function ProfileHeader({ profile }) {
  const email = profile.email || currentEmail() || "-"
  const name = profile.name || email
  return (
    <Card className="overflow-hidden p-0">
      <div className="h-28 bg-gradient-to-br from-primary via-primary to-accent" />
      <div className="-mt-12 flex flex-col items-center gap-3 px-6 pb-6 text-center sm:flex-row sm:items-end sm:text-left">
        <AvatarUploader photo={profile.avatar_url} name={name} />
        <div className="min-w-0 flex-1 sm:pb-2">
          <div className="truncate text-lg font-semibold text-foreground">{name || "-"}</div>
          <div className="truncate text-sm text-muted-foreground">{email}</div>
        </div>
        <Badge tone={ROLE_TONE[profile.role] || "blue"} className="sm:mb-2">
          {roleLabel(profile)}
        </Badge>
      </div>
    </Card>
  )
}

function AccountCard({ profile }) {
  const [name, setName] = useState(profile.name || "")
  // A colleague's contact number (migration 0021), the number a teammate rings,
  // not an auth identity. The field-sales app writes the same column from its
  // Account details page, so it has to be editable on both sides or one of them
  // is quietly the only way to set it.
  const [phone, setPhone] = useState(profile.phone || "")
  const [busy, setBusy] = useState(false)
  useEffect(() => setName(profile.name || ""), [profile.name])
  useEffect(() => setPhone(profile.phone || ""), [profile.phone])

  const email = profile.email || currentEmail() || "-"
  // What this person can actually open: role grants, own ticks, company switches
  // and per-person hides, all through canAccess, as the sidebar does.
  const reachable = MODULES.filter((m) => canAccess(profile, m.key))

  const save = async () => {
    if (!hasSupabase) return toast.error("Editing your name needs the backend enabled")
    setBusy(true)
    const res = await updateMyProfile(currentUserId(), { name: name.trim(), phone: phone.trim() })
    setBusy(false)
    if (res.error) return toast.error(res.error)
    refreshProfile() // header + account popover pick up the new name immediately
    toast.success("Profile updated")
  }

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="mb-4 font-semibold text-foreground">Account details</h3>

      <Field label="Full name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" />
      </Field>
      <Field label="Phone" className="mt-3">
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Enter phone number"
          inputMode="tel"
        />
      </Field>
      <Field label="Email" className="mt-3">
        <Input value={email} disabled />
      </Field>

      <div className="mt-4">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module access</span>
        <div className="flex flex-wrap gap-1.5">
          {reachable.map((m) => (
            <Badge key={m.key} tone="slate">{m.label}</Badge>
          ))}
        </div>
      </div>

      <Button size="sm" className="mt-5" onClick={save} disabled={busy}>
        <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
      </Button>
    </Card>
  )
}

