import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ShieldCheck } from "../../components/ui/Icons"
import { Badge, Banner, Button, Card, CardHeader } from "../../components/ui/Ui"
import { ASSIGNABLE_MODULES, MODULES, adminAccessConfigurable, moduleControl } from "../../data/domain/modules"
import { CONFIGURABLE_ROLES, ROLE_DESCRIPTION, roleLabel } from "../../lib/roles"
import { saveRolePermissions, useRolePermissions } from "../../hooks/useRolePermissions"
import { saveModuleControls, useModuleControls } from "../../hooks/useModuleControls"
import { groupBySection, shortLabel } from "./helpers"

// Modules → Roles: what each role may open. The Super Admin ticks a module for
// a role and everyone in it gets it, on the console and the phone, the moment
// it is saved (role_permissions, migration 0032). The Admin column is the
// module's Admin switch (module_controls.admin_access, migration 0053): untick
// it and Admins reach that module only when it is ticked on their own profile.
// The Super Admin column is fixed: the Super Admin reaches everything.

const ALWAYS = MODULES.filter((m) => m.always).map((m) => m.label)
const ADMIN_ONLY = MODULES.filter((m) => m.adminOnly).map((m) => m.label)
const SUPER_ONLY = [
  ...MODULES.filter((m) => m.superAdminOnly).map((m) => m.label),
  "Add and manage Admins",
  "Attendance rules and leave policy",
  "Unlock a locked month, override a day",
]

const adminOn = (controls, key) => moduleControl({ moduleControls: controls }, key).adminAccess
const moduleOn = (controls, key) => moduleControl({ moduleControls: controls }, key).enabled

export default function RoleMatrix() {
  const { grants, ready: grantsReady, loaded } = useRolePermissions()
  const { controls, ready: controlsReady } = useModuleControls()
  const [draft, setDraft] = useState(grants)
  // Module keys whose Admin switch is being changed: key -> new value.
  const [adminDraft, setAdminDraft] = useState({})
  const [saving, setSaving] = useState(false)

  const dirtyRoles = useMemo(
    () => CONFIGURABLE_ROLES.filter((r) => !sameSet(draft[r] || [], grants[r] || [])),
    [draft, grants],
  )
  const dirtyAdmin = useMemo(
    () => Object.keys(adminDraft).filter((k) => adminDraft[k] !== adminOn(controls, k)),
    [adminDraft, controls],
  )
  const dirty = dirtyRoles.length + dirtyAdmin.length

  // Follow the live copy until someone starts editing.
  useEffect(() => {
    if (!dirtyRoles.length) setDraft(grants)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [grants])

  const sections = useMemo(() => groupBySection(ASSIGNABLE_MODULES), [])

  const toggle = (role, key) =>
    setDraft((d) => {
      const cur = d[role] || []
      return { ...d, [role]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] }
    })
  const toggleAdmin = (key) =>
    setAdminDraft((d) => ({ ...d, [key]: !(key in d ? d[key] : adminOn(controls, key)) }))

  const discard = () => {
    setDraft(grants)
    setAdminDraft({})
  }

  const save = async () => {
    setSaving(true)
    try {
      for (const role of dirtyRoles) await saveRolePermissions(role, draft[role] || [])
      if (dirtyAdmin.length) {
        const changes = {}
        for (const key of dirtyAdmin) changes[key] = { enabled: moduleOn(controls, key), adminAccess: adminDraft[key] }
        await saveModuleControls(changes)
      }
      setAdminDraft({})
      toast.success("Saved. Everyone in those roles has the new access now.")
    } catch (e) {
      toast.error(e.message || "Could not save role access")
    }
    setSaving(false)
  }

  const canEditRoles = grantsReady
  const canEditAdmin = controlsReady

  return (
    <div className="space-y-5">
      {loaded && !grantsReady && (
        <Banner tone="warning">
          Role permissions are not set up on this database yet (migration 0032). Showing the defaults; saving is
          switched off until it is applied.
        </Banner>
      )}
      {loaded && grantsReady && !controlsReady && (
        <Banner tone="warning">
          Module switches are not set up on this database yet (migration 0053). Admins keep every module until it is
          applied.
        </Banner>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="What each role can open"
          description="Untick Admin to take a module off every Admin; you can still give it back to one Admin on the People tab."
          action={
            <div className="flex items-center gap-2">
              {dirty > 0 && (
                <Button variant="outline" size="sm" onClick={discard} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
              </Button>
            </div>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Module</th>
                <th className="text-center" title={ROLE_DESCRIPTION.admin}>Admin</th>
                {CONFIGURABLE_ROLES.map((r) => (
                  <th key={r} className="text-center" title={ROLE_DESCRIPTION[r]}>{roleLabel(r)}</th>
                ))}
                <th className="text-center">Super Admin</th>
              </tr>
            </thead>
            <tbody className="mt-body">
              {sections.map(([section, items]) => (
                <SectionRows key={section} section={section}>
                  {items.map((m) => {
                    const off = !moduleOn(controls, m.key)
                    const admin = m.key in adminDraft ? adminDraft[m.key] : adminOn(controls, m.key)
                    return (
                      <tr key={m.key} className={off ? "opacity-60" : undefined}>
                        <td className="text-foreground">
                          <span className="inline-flex items-center gap-2">
                            {shortLabel(m)}
                            {off && <Badge tone="rose">Off</Badge>}
                          </span>
                        </td>
                        <td className="text-center">
                          {adminAccessConfigurable(m) ? (
                            <Tick
                              id={`admin-${m.key}`}
                              label={`Admin: ${m.label}`}
                              checked={admin}
                              disabled={!canEditAdmin}
                              onChange={() => toggleAdmin(m.key)}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground" title="Only when ticked on that Admin's own profile">
                              Per person
                            </span>
                          )}
                        </td>
                        {CONFIGURABLE_ROLES.map((r) => (
                          <td key={r} className="text-center">
                            <Tick
                              id={`perm-${r}-${m.key}`}
                              label={`${roleLabel(r)}: ${m.label}`}
                              checked={(draft[r] || []).includes(m.key)}
                              disabled={!canEditRoles}
                              onChange={() => toggle(r, m.key)}
                            />
                          </td>
                        ))}
                        <td className="text-center">
                          <ShieldCheck className="mx-auto h-4 w-4 text-primary" aria-label="Always" />
                        </td>
                      </tr>
                    )
                  })}
                </SectionRows>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Fixed title="Everyone, always" items={ALWAYS} note="Every role, including Staff." />
        <Fixed title="Admins only" items={ADMIN_ONLY} note="The Super Admin and Admins. Never grantable to other roles." />
        <Fixed title="Super Admin only" items={SUPER_ONLY} note="Only you. Not grantable to anyone." />
      </div>
    </div>
  )
}

function SectionRows({ section, children }) {
  return (
    <>
      <tr>
        <td colSpan={CONFIGURABLE_ROLES.length + 3} className="bg-subtle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {section}
        </td>
      </tr>
      {children}
    </>
  )
}

function Tick({ id, label, checked, disabled, onChange }) {
  return (
    <input
      type="checkbox"
      id={id}
      aria-label={label}
      className="h-4 w-4 rounded border-border accent-primary disabled:opacity-60"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
    />
  )
}

function Fixed({ title, items, note }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="space-y-2 px-5 pb-5">
        <p className="text-xs text-muted-foreground">{note}</p>
        <ul className="space-y-1 text-sm text-foreground">
          {items.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

function sameSet(a, b) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}
