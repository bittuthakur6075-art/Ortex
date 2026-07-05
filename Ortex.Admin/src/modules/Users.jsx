import { useState, useEffect, useCallback } from "react"
import { toast } from "sonner"
import { ShieldCheck, Plus, Users as UsersIcon } from "../components/icons"
import { Button, Card, Input, Select, Field, Modal, Badge, PageLoader, EmptyState } from "../components/ui"
import PageHeader from "../components/PageHeader"
import { listProfiles, updateProfile, createUser } from "../data/users"
import { ASSIGNABLE_MODULES, SALES_DEFAULT_MODULES, MODULES } from "../data/modules"
import { currentUserId } from "../lib/auth"

const ROLE_LABEL = { admin: "Admin", sales: "Sales Executive" }
const moduleLabel = (key) => MODULES.find((m) => m.key === key)?.label || key
const randomPassword = () => "Ox-" + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase()

export default function Users() {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null) // profile object or "new"
  const selfId = currentUserId()

  const load = useCallback(async () => {
    try {
      setRows(await listProfiles())
    } catch (e) {
      toast.error(e.message || "Failed to load users")
      setRows([])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (rows === null) return <PageLoader />

  return (
    <div>
      <PageHeader title="Users" subtitle="Team accounts, roles and per-user module access">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" description="Add your first team member." action={
          <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add user</Button>
        } />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Modules</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                    onClick={() => setEditing(p)}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {p.name || "—"} {p.id === selfId && <span className="text-xs text-muted-foreground">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.role === "admin" ? "violet" : "blue"}>{ROLE_LABEL[p.role] || p.role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.role === "admin" ? "All modules" : `${(p.modules || []).length} module${(p.modules || []).length === 1 ? "" : "s"}`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.active ? "emerald" : "slate"}>{p.active ? "Active" : "Disabled"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && (
        <UserEditor
          user={editing === "new" ? null : editing}
          selfId={selfId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function UserEditor({ user, selfId, onClose, onSaved }) {
  const isEdit = Boolean(user)
  const isSelf = isEdit && user.id === selfId
  const [email, setEmail] = useState(user?.email || "")
  const [password, setPassword] = useState(isEdit ? "" : randomPassword())
  const [name, setName] = useState(user?.name || "")
  const [role, setRole] = useState(user?.role || "sales")
  const [modules, setModules] = useState(user?.modules || SALES_DEFAULT_MODULES)
  const [active, setActive] = useState(user?.active ?? true)
  const [busy, setBusy] = useState(false)

  const toggleModule = (key) =>
    setModules((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]))

  const save = async () => {
    if (!isEdit && (!email.trim() || !password)) return toast.error("Email and password are required")
    if (isSelf && role !== "admin") return toast.error("You can't remove your own admin role")
    if (isSelf && !active) return toast.error("You can't disable your own account")
    setBusy(true)
    try {
      if (isEdit) {
        await updateProfile(user.id, { name, role, modules, active })
        toast.success("User updated")
      } else {
        const res = await createUser({ email: email.trim(), password, name, role, modules })
        if (res.error) {
          toast.error(res.error)
          setBusy(false)
          return
        }
        toast.success(`User ${email} created`)
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
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@ortexindustries.in" />
            </Field>
            <Field label="Temporary password" required hint="Share securely; they can change it in Settings">
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} />
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(randomPassword())}>New</Button>
              </div>
            </Field>
          </div>
        )}
        <Field label="Full name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" />
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ASSIGNABLE_MODULES.map((m) => (
                <label key={m.key} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={modules.includes(m.key)}
                    onChange={() => toggleModule(m.key)}
                  />
                  {m.label}
                </label>
              ))}
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
            Account active {isSelf && <span className="text-xs text-muted-foreground">(can't disable yourself)</span>}
          </label>
        )}
      </div>
    </Modal>
  )
}
