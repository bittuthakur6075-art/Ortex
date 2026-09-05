import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "sonner"
import { ShieldCheck, Plus, Users as UsersIcon } from "../components/ui/Icons"
import { Button, Card, Input, Select, Field, Modal, Badge, PageLoader, EmptyState, SortTh } from "../components/ui/Ui"
import PageHeader from "../components/layout/PageHeader"
import { listProfiles, updateProfile, createUser } from "../services/users"
import { useSorting } from "../hooks/useCollection"
import { ASSIGNABLE_MODULES, SALES_DEFAULT_MODULES } from "../data/domain/modules"
import { currentUserId } from "../lib/auth"
import { roleLabel, moduleLabel } from "../lib/roles"

const randomPassword = () => "Ox-" + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase()

export default function Users() {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null) // profile object or "new"
  const selfId = currentUserId()
  const [sort, onSort] = useSorting("email")

  const sortedUsers = useMemo(() => {
    if (!rows) return []
    const { key, desc } = sort
    const sorted = [...rows].sort((a, b) => {
      let valA = a[key]
      let valB = b[key]
      if (valA === undefined || valA === null) valA = ""
      if (valB === undefined || valB === null) valB = ""
      if (typeof valA === "boolean") return valA === valB ? 0 : valA ? -1 : 1
      if (typeof valA === "string") return valA.localeCompare(valB)
      return valA - valB
    })
    return desc ? sorted.reverse() : sorted
  }, [rows, sort])

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
              <thead className="mt-head">
                <tr className="text-left">
                  <SortTh sortKey="name" sort={sort} onSort={onSort}>Name</SortTh>
                  <SortTh sortKey="email" sort={sort} onSort={onSort}>Email</SortTh>
                  <SortTh sortKey="role" sort={sort} onSort={onSort}>Role</SortTh>
                  <SortTh sortKey="modules" sort={sort} onSort={onSort}>Modules</SortTh>
                  <SortTh sortKey="active" sort={sort} onSort={onSort}>Status</SortTh>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-subtle"
                    onClick={() => setEditing(p)}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {p.name || "—"} {p.id === selfId && <span className="text-xs text-muted-foreground">(you)</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={p.role === "admin" ? "violet" : "blue"}>{roleLabel(p.role)}</Badge>
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
        await updateProfile(user.id, { name, role, modules, active })
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
          toast.warning(`User ${email} created, but the email failed — share the password manually.`, {
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
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="person@ortexindustries.in" />
            </Field>
            <Field
              label="Temporary password"
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
                in that inbox, so the message tells them to change it — and they can sign in with a
                one-time code instead.
              </span>
            </span>
          </label>
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
            Account active {isSelf && <span className="text-xs text-muted-foreground">(can't disable yourself)</span>}
          </label>
        )}
      </div>
    </Modal>
  )
}
