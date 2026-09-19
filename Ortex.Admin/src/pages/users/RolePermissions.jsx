import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ShieldCheck } from "../../components/ui/Icons"
import { Banner, Button, Card, CardHeader } from "../../components/ui/Ui"
import { ASSIGNABLE_MODULES, MODULES } from "../../data/domain/modules"
import { CONFIGURABLE_ROLES, ROLE_DESCRIPTION, roleLabel } from "../../lib/roles"
import { saveRolePermissions, useRolePermissions } from "../../hooks/useRolePermissions"

// Users → Roles & permissions: what each role may open (role_permissions,
// migration 0032). The Super Admin ticks a section for a role and everyone in
// that role gets it, on the console and the phone, the moment it is saved;
// ticks on one person (their Edit dialog) still add extras on top.
//
// Admin and Super Admin are shown for completeness but are not editable: an
// Admin reaches every module, and the Super-Admin-only powers are role checks
// in the database, never grantable keys. Everyone else sees this read-only.

const ALWAYS = MODULES.filter((m) => m.always).map((m) => m.label)
const ADMIN_ONLY = MODULES.filter((m) => m.adminOnly).map((m) => m.label)
const SUPER_ONLY = [
  ...MODULES.filter((m) => m.superAdminOnly).map((m) => m.label),
  "Add and manage Admins",
  "Roles & permissions",
  "Attendance rules, leave policy and holidays",
  "Unlock a locked month, override a day",
]

export default function RolePermissions({ editable }) {
  const { grants, ready, loaded } = useRolePermissions()
  const [draft, setDraft] = useState(grants)
  const [saving, setSaving] = useState(false)

  // Follow the live copy until someone starts editing.
  const dirtyRoles = useMemo(
    () => CONFIGURABLE_ROLES.filter((r) => !sameSet(draft[r] || [], grants[r] || [])),
    [draft, grants],
  )
  useEffect(() => {
    if (!dirtyRoles.length) setDraft(grants)
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [grants])

  const sections = useMemo(() => {
    const by = new Map()
    for (const m of ASSIGNABLE_MODULES) {
      if (!by.has(m.section)) by.set(m.section, [])
      by.get(m.section).push(m)
    }
    return [...by.entries()]
  }, [])

  const toggle = (role, key) =>
    setDraft((d) => {
      const cur = d[role] || []
      return { ...d, [role]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] }
    })

  const save = async () => {
    setSaving(true)
    try {
      for (const role of dirtyRoles) await saveRolePermissions(role, draft[role] || [])
      toast.success(
        dirtyRoles.length === 1
          ? `${roleLabel(dirtyRoles[0])} permissions saved. Everyone in that role has them now.`
          : "Role permissions saved. Everyone in those roles has them now.",
      )
    } catch (e) {
      toast.error(e.message || "Could not save role permissions")
    }
    setSaving(false)
  }

  const canEdit = editable && ready

  return (
    <div className="space-y-5">
      {!editable && (
        <Banner tone="info">Only the Super Admin can change what each role can open. This is a read-only view.</Banner>
      )}
      {editable && loaded && !ready && (
        <Banner tone="warning">
          Role permissions are not set up on this database yet (migration 0032). Showing the defaults; saving is
          switched off until it is applied.
        </Banner>
      )}

      <Card className="overflow-hidden">
        <CardHeader
          title="What each role can open"
          action={
            canEdit ? (
              <div className="flex items-center gap-2">
                {dirtyRoles.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setDraft(grants)} disabled={saving}>
                    Discard
                  </Button>
                )}
                <Button size="sm" onClick={save} disabled={saving || !dirtyRoles.length}>
                  {saving ? "Saving…" : dirtyRoles.length ? "Save changes" : "Saved"}
                </Button>
              </div>
            ) : null
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Section</th>
                {CONFIGURABLE_ROLES.map((r) => (
                  <th key={r} className="text-center" title={ROLE_DESCRIPTION[r]}>{roleLabel(r)}</th>
                ))}
                <th className="text-center">Admin</th>
                <th className="text-center">Super Admin</th>
              </tr>
            </thead>
            <tbody className="mt-body">
              {sections.map(([section, items]) => (
                <SectionRows
                  key={section}
                  section={section}
                  items={items}
                  draft={draft}
                  canEdit={canEdit}
                  onToggle={toggle}
                />
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

function SectionRows({ section, items, draft, canEdit, onToggle }) {
  return (
    <>
      <tr>
        <td colSpan={CONFIGURABLE_ROLES.length + 3} className="bg-subtle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {section}
        </td>
      </tr>
      {items.map((m) => (
        <tr key={m.key}>
          <td className="text-foreground">{m.label.replace(/^[^·]+·\s*/, "")}</td>
          {CONFIGURABLE_ROLES.map((r) => {
            const on = (draft[r] || []).includes(m.key)
            return (
              <td key={r} className="text-center">
                <input
                  type="checkbox"
                  id={`perm-${r}-${m.key}`}
                  aria-label={`${roleLabel(r)}: ${m.label}`}
                  className="h-4 w-4 rounded border-border accent-primary disabled:opacity-60"
                  checked={on}
                  disabled={!canEdit}
                  onChange={() => onToggle(r, m.key)}
                />
              </td>
            )
          })}
          <td className="text-center">
            <ShieldCheck className="mx-auto h-4 w-4 text-primary" aria-label="Always" />
          </td>
          <td className="text-center">
            <ShieldCheck className="mx-auto h-4 w-4 text-primary" aria-label="Always" />
          </td>
        </tr>
      ))}
    </>
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
