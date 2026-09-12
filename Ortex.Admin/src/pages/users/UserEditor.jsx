import { useState, useMemo } from "react"
import { toast } from "sonner"
import { ShieldCheck } from "../../components/ui/Icons"
import { Button, Input, Select, Field, Modal } from "../../components/ui/Ui"
import { updateProfile, createUser, setUserActive } from "../../services/users"
import { ASSIGNABLE_MODULES, SALES_DEFAULT_MODULES } from "../../data/domain/modules"
import { moduleLabel } from "../../lib/roles"
import { randomPassword } from "./helpers"

// The create/edit dialog for a console account. Lives beside the Users page
// rather than inside it because the user detail page opens the same dialog:
// role and module access must be edited in exactly one place, or the two
// screens drift into two different ideas of what a role grants.

export default function UserEditor({ user, selfId, onClose, onSaved }) {
  const isEdit = Boolean(user)
  const isSelf = isEdit && user.id === selfId
  const [email, setEmail] = useState(user?.email || "")
  const [password, setPassword] = useState(isEdit ? "" : randomPassword())
  const [name, setName] = useState(user?.name || "")
  const [role, setRole] = useState(user?.role || "sales")
  const [modules, setModules] = useState(user?.modules || SALES_DEFAULT_MODULES)
  const [active, setActive] = useState(user?.active ?? true)
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)

  const toggleModule = (key) =>
    setModules((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]))

  // Group the checklist the way the sidebar is grouped, so granting access maps
  // onto how people actually describe the app ("give them CRM") rather than a
  // flat wall of twelve checkboxes.
  const moduleSections = useMemo(() => {
    const bySection = new Map()
    for (const m of ASSIGNABLE_MODULES) {
      if (!bySection.has(m.section)) bySection.set(m.section, [])
      bySection.get(m.section).push(m)
    }
    return [...bySection.entries()]
  }, [])

  const toggleSection = (items) => {
    const keys = items.map((m) => m.key)
    const allOn = keys.every((k) => modules.includes(k))
    setModules((m) => (allOn ? m.filter((k) => !keys.includes(k)) : [...new Set([...m, ...keys])]))
  }

  const save = async () => {
    if (!isEdit && (!email.trim() || !password)) return toast.error("Email and password are required")
    if (isSelf && role !== "admin") return toast.error("You can't remove your own admin role")
    if (isSelf && !active) return toast.error("You can't disable your own account")
    setBusy(true)
    try {
      if (isEdit) {
        // Name, role and modules are a plain profiles write. The active flag is
        // NOT: disabling an account is profiles.active *and* an auth ban, and
        // only the Edge Function can set the ban. Writing the column alone left
        // a re-enabled user reading "Active" here while every sign-in, password
        // or emailed code, was still refused by the ban nobody had lifted.
        await updateProfile(user.id, { name, role, modules })
        if (Boolean(user.active) !== Boolean(active)) {
          const res = await setUserActive(user.id, active)
          if (res.error) {
            toast.error(res.error, { duration: res.reverted || res.notDeployed ? 15000 : 6000 })
            setBusy(false)
            return
          }
        }
        toast.success("User updated")
      } else {
        const res = await createUser({
          email: email.trim(),
          password,
          name,
          role,
          modules,
          notify,
          // Sent so the email can list access in the same words the console
          // uses, without the function needing to know the module registry.
          moduleLabels: role === "admin" ? ["Every module"] : modules.map(moduleLabel),
        })
        if (res.error) {
          toast.error(res.error)
          setBusy(false)
          return
        }
        if (!notify) {
          toast.success(`User ${email} created. Share the password securely.`)
        } else if (res.emailed) {
          toast.success(`User ${email} created and emailed their details`)
        } else {
          // The account exists; only the mail failed. Say so plainly, because
          // the admin is now the only route those credentials have.
          toast.warning(`User ${email} created, but the email failed. Share the password manually.`, {
            description: res.emailError || undefined,
            duration: 12000,
          })
        }
      }
      onSaved()
    } catch (e) {
      toast.error(e.message || "Save failed")
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-lg"
      title={isEdit ? `Edit ${user.email}` : "Add user"}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Create user"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter email address" />
            </Field>
            <Field
              label="Temporary Password"
              required
              hint={notify ? "Emailed to them; they change it in Settings" : "Share securely; they can change it in Settings"}
            >
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())}>New</Button>
              </div>
            </Field>
          </div>
        )}
        {!isEdit && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium text-foreground">Email them their sign-in details</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Sends the console link, their email and this password. A password sent by email stays
                in that inbox, so the message tells them to change it, and they can sign in with a
                one-time code instead.
              </span>
            </span>
          </label>
        )}
        <Field label="Full Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" />
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf}>
            <option value="sales">Sales Executive</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>

        <div>
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Module access</span>
          {role === "admin" ? (
            <p className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2.5 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" /> Admins have access to every module.
            </p>
          ) : (
            <div className="space-y-3">
              {moduleSections.map(([section, items]) => {
                const allOn = items.every((m) => modules.includes(m.key))
                return (
                  <div key={section}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{section}</span>
                      <button
                        type="button"
                        onClick={() => toggleSection(items)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {allOn ? "Clear" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {items.map((m) => (
                        <label
                          key={m.key}
                          className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                            checked={modules.includes(m.key)}
                            onChange={() => toggleModule(m.key)}
                          />
                          {/* The registry labels carry their section ("CRM · Pipeline"),
                              which is redundant once they sit under that heading. */}
                          {m.label.replace(/^[^·]+·\s*/, "")}
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {role !== "admin" && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Dashboard is always available. {modules.length ? modules.map(moduleLabel).join(", ") : "No modules selected."}
            </p>
          )}
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              disabled={isSelf}
            />
            Account active {isSelf
              ? <span className="text-xs text-muted-foreground">(can't disable yourself)</span>
              : <span className="text-xs text-muted-foreground">(unticking hides every module; use the row menu to block sign-in too)</span>}
          </label>
        )}
      </div>
    </Modal>
  )
}
