import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { MoreHorizontal, Pencil, KeyRound, UserCheck, UserX, Trash2, AlertTriangle } from "../../components/ui/Icons"
import { Button, Input, Field, Modal, Banner } from "../../components/ui/Ui"
import { setUserActive, resetUserPassword, deleteUser } from "../../services/users"
import { randomPassword } from "./helpers"

// Per-row account actions on the Users page: edit, enable/disable, reset the
// password, delete outright. Everything except "edit" goes through the
// admin-manage-user Edge Function, which re-checks that the caller is an admin
// and refuses to let anyone disable or delete themselves.
export default function RowActions({ user, selfId, onEdit, onChanged }) {
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState(null) // "reset" | "delete"
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const isSelf = user.id === selfId

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const toggleActive = async () => {
    setOpen(false)
    setBusy(true)
    const res = await setUserActive(user.id, !user.active)
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success(user.active ? `${user.email} can no longer sign in` : `${user.email} is active again`)
    onChanged()
  }

  const item = "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-secondary-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-40"

  return (
    <div ref={ref} className="relative flex justify-end" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label={`Actions for ${user.email}`}
        aria-expanded={open}
        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal variant="Linear" className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-20 w-56 rounded-card border border-border bg-card p-2 shadow-overlay-lg animate-pop-in">
          <button type="button" className={item} onClick={() => { setOpen(false); onEdit() }}>
            <Pencil variant="Linear" className="h-4 w-4 text-muted-foreground" /> Edit role &amp; access
          </button>
          <button type="button" className={item} onClick={toggleActive} disabled={isSelf}>
            {user.active
              ? <><UserX variant="Linear" className="h-4 w-4 text-muted-foreground" /> Deactivate account</>
              : <><UserCheck variant="Linear" className="h-4 w-4 text-muted-foreground" /> Activate account</>}
          </button>
          <button type="button" className={item} onClick={() => { setOpen(false); setDialog("reset") }}>
            <KeyRound variant="Linear" className="h-4 w-4 text-muted-foreground" /> Reset password
          </button>
          <div className="my-1.5 h-px bg-border" />
          <button
            type="button"
            className={`${item} text-destructive-text hover:bg-destructive/10`}
            onClick={() => { setOpen(false); setDialog("delete") }}
            disabled={isSelf}
          >
            <Trash2 variant="Linear" className="h-4 w-4" /> Delete user
          </button>
          {isSelf && <p className="px-2 pt-1 text-[11px] text-subtle-foreground">You can't disable or delete your own account.</p>}
        </div>
      )}

      {dialog === "reset" && (
        <ResetPasswordDialog user={user} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />
      )}
      {dialog === "delete" && (
        <DeleteUserDialog user={user} onClose={() => setDialog(null)} onDone={() => { setDialog(null); onChanged() }} />
      )}
    </div>
  )
}

function ResetPasswordDialog({ user, onClose, onDone }) {
  const [password, setPassword] = useState(randomPassword)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (password.length < 6) return toast.error("Password must be at least 6 characters")
    setBusy(true)
    const res = await resetUserPassword(user.id, password, notify)
    setBusy(false)
    if (res.error) return toast.error(res.error)
    if (!notify) toast.success("Password reset. Share it securely.")
    else if (res.emailed) toast.success(`Password reset and emailed to ${user.email}`)
    else toast.warning("Password reset, but the email failed — share it manually.", { description: res.emailError || undefined, duration: 12000 })
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-md"
      title={`Reset password for ${user.email}`}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={busy}>{busy ? "Resetting…" : "Reset password"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Banner tone="warning">
          Their current password stops working immediately, and every session they have open is signed out.
        </Banner>
        <Field label="New temporary password" required hint="They change it themselves in Settings → Password.">
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())}>New</Button>
          </div>
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-border accent-primary" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          <span className="text-sm">
            <span className="font-medium text-foreground">Email them the new password</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Sent to {user.email}. Untick if you'd rather hand it over in person.</span>
          </span>
        </label>
      </div>
    </Modal>
  )
}

// Deletion is irreversible and cascades, so it asks for the email to be typed
// out — the same guard GitHub and Supabase use, and cheap insurance against a
// mis-click on the wrong row.
function DeleteUserDialog({ user, onClose, onDone }) {
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const matches = confirm.trim().toLowerCase() === (user.email || "").toLowerCase()

  const submit = async () => {
    if (!matches) return
    setBusy(true)
    const res = await deleteUser(user.id)
    setBusy(false)
    if (res.error) return toast.error(res.error)
    toast.success(`${user.email} deleted`)
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-md"
      title="Delete user"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={submit} disabled={!matches || busy}>{busy ? "Deleting…" : "Delete permanently"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Banner tone="danger">
          <span className="flex items-start gap-2">
            <AlertTriangle variant="Linear" className="mt-0.5 h-4 w-4 flex-none" />
            <span>
              This removes the login, the profile, the role and every module permission. It cannot be undone —
              records they created (leads, quotations, invoices) stay put.
            </span>
          </span>
        </Banner>
        <Field label={`Type ${user.email} to confirm`} required>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={user.email} autoComplete="off" />
        </Field>
      </div>
    </Modal>
  )
}
