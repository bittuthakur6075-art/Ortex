import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Avatar, Badge, Button, Card, CardHeader, Chip, ChipGroup, EmptyState, SearchInput } from "../../components/ui/Ui"
import { ShieldCheck, Users as UsersIcon } from "../../components/ui/Icons"
import { ASSIGNABLE_MODULES, hiddenModules, moduleControl } from "../../data/domain/modules"
import { useRolePermissions } from "../../hooks/useRolePermissions"
import { useModuleControls } from "../../hooks/useModuleControls"
import { updateProfile } from "../../services/users"
import { accessReason } from "../../lib/moduleAccess"
import { ROLE_TONE, isSuperAdmin, roleLabel } from "../../lib/roles"
import { cn } from "../../lib/cn"
import { useReportUnsaved } from "../../hooks/useUnsaved"
import { groupBySection, shortLabel } from "./helpers"

// Modules → People: every person against every module, in one grid, where the
// Super Admin shows or hides each module for each person. A box their role (or
// the Admin role) already gives is shown with a shield; unticking it HIDES the
// module from this person alone (profiles.modules_hidden, migration 0055).
// Any other box is their own access (profiles.modules), the same ticks as a
// user's Edit dialog. Changes for many people save together.

const ROLE_FILTERS = ["all", "admin", "accounts", "sales", "staff"]

export default function PeopleAccess({ people, reload }) {
  const { grants } = useRolePermissions()
  const { controls } = useModuleControls()
  const [role, setRole] = useState("all")
  const [q, setQ] = useState("")
  const [draft, setDraft] = useState({}) // id -> { modules, hidden }
  const [saving, setSaving] = useState(false)

  // A fresh list from the server replaces any edits already saved.
  useEffect(() => setDraft({}), [people])

  const sections = useMemo(() => groupBySection(ASSIGNABLE_MODULES), [])
  const columns = useMemo(() => sections.flatMap(([, items]) => items), [sections])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (people || [])
      .filter((p) => !isSuperAdmin(p))
      .filter((p) => role === "all" || p.role === role)
      .filter((p) => !needle || `${p.name || ""} ${p.email || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(b.active !== false) - Number(a.active !== false) || String(a.name || a.email).localeCompare(String(b.name || b.email)))
  }, [people, role, q])

  const stateOf = (p) => draft[p.id] || { modules: p.modules || [], hidden: hiddenModules(p) }
  const dirtyIds = Object.keys(draft).filter((id) => {
    const p = people.find((x) => x.id === id)
    return p && (!sameSet(draft[id].modules, p.modules || []) || !sameSet(draft[id].hidden, hiddenModules(p)))
  })

  // A box the role gives flips "hidden"; any other box flips their own access.
  const toggle = (p, key, fromRole) => {
    const { modules, hidden } = stateOf(p)
    const flip = (list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key])
    const next = fromRole
      ? { modules: modules.filter((k) => k !== key), hidden: flip(hidden) }
      : { modules: flip(modules), hidden: hidden.filter((k) => k !== key) }
    setDraft((d) => ({ ...d, [p.id]: next }))
  }

  useReportUnsaved(dirtyIds.length > 0)

  const save = async () => {
    setSaving(true)
    let done = 0
    try {
      for (const id of dirtyIds) {
        await updateProfile(id, { modules: [...new Set(draft[id].modules)], modules_hidden: [...new Set(draft[id].hidden)] })
        done++
      }
      toast.success(done === 1 ? "Access saved for 1 person." : `Access saved for ${done} people.`)
      await reload()
    } catch (e) {
      toast.error(e.message || "Could not save access")
      if (done) await reload()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <ChipGroup>
          {ROLE_FILTERS.map((r) => (
            <Chip key={r} active={role === r} onClick={() => setRole(r)}>
              {r === "all" ? "Everyone" : roleLabel(r)}
            </Chip>
          ))}
        </ChipGroup>
        <SearchInput className="ml-auto w-full sm:w-64" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Access per person"
          description="Tick to show a module to a person, untick to hide it. A shield means their role gives it; unticking hides it from this person only."
          action={
            <div className="flex items-center gap-2">
              {dirtyIds.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setDraft({})} disabled={saving}>
                  Discard
                </Button>
              )}
              <Button size="sm" onClick={save} disabled={saving || !dirtyIds.length}>
                {saving ? "Saving…" : dirtyIds.length ? `Save ${dirtyIds.length} ${dirtyIds.length === 1 ? "person" : "people"}` : "Saved"}
              </Button>
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState icon={UsersIcon} title="Nobody here" description="No one matches this filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 260 + columns.length * 92 }}>
              <thead className="mt-head">
                <tr>
                  <th rowSpan={2} className="sticky left-0 z-10 bg-card text-left">Person</th>
                  {sections.map(([section, items]) => (
                    <th key={section} colSpan={items.length} className="text-center">{section}</th>
                  ))}
                </tr>
                <tr>
                  {columns.map((m) => {
                    const off = !moduleControl({ moduleControls: controls }, m.key).enabled
                    return (
                      <th key={m.key} className={cn("text-center", off && "opacity-60")} title={off ? `${m.label}: switched off for the company` : m.label}>
                        {shortLabel(m)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="mt-body">
                {rows.map((p) => {
                  const { modules: mine, hidden } = stateOf(p)
                  const changed = dirtyIds.includes(p.id)
                  return (
                    <tr key={p.id} className={cn(p.active === false && "opacity-60")}>
                      <td className="sticky left-0 z-10 bg-card">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={p.name || p.email} src={p.avatar_url} className="h-7 w-7" />
                          <div className="min-w-0">
                            <Link to={`/users/${p.id}`} className="block max-w-[160px] truncate font-medium text-foreground hover:text-primary">
                              {p.name || p.email}
                            </Link>
                            <div className="flex items-center gap-1.5">
                              <Badge tone={ROLE_TONE[p.role] || "slate"}>{roleLabel(p.role)}</Badge>
                              {p.active === false && <span className="text-[11px] text-muted-foreground">Deactivated</span>}
                              {changed && <span className="text-[11px] font-medium text-primary">Edited</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      {columns.map((m) => {
                        // What the role gives, judged on the saved profile so a
                        // personal tick never masquerades as a role grant.
                        const base = accessReason({ ...p, active: true, modules: [], modules_hidden: [] }, m.key, grants, withModuleOn(controls, m.key))
                        const fromRole = base === "admin" || base === "role"
                        const isHidden = fromRole && hidden.includes(m.key)
                        const checked = fromRole ? !isHidden : mine.includes(m.key)
                        const off = !moduleControl({ moduleControls: controls }, m.key).enabled
                        const roleName = base === "admin" ? "the Admin role" : `the ${roleLabel(p.role)} role`
                        const title = isHidden
                          ? `Hidden from this person (${roleName} gives it)`
                          : fromRole
                            ? `From ${roleName}. Untick to hide it from this person`
                            : off
                              ? "Kept, but the module is switched off"
                              : checked
                                ? "Own access"
                                : "Not shown"
                        return (
                          <td key={m.key} className={cn("text-center", off && "opacity-60")}>
                            <label className="inline-flex items-center gap-1" title={title}>
                              <input
                                type="checkbox"
                                aria-label={`${p.name || p.email}: ${m.label}`}
                                className={cn("h-4 w-4 rounded border-border accent-primary disabled:opacity-50", isHidden && "outline outline-1 outline-destructive")}
                                checked={checked}
                                disabled={saving}
                                onChange={() => toggle(p, m.key, fromRole)}
                              />
                              {fromRole && <ShieldCheck className={cn("h-3.5 w-3.5", isHidden ? "text-destructive-text" : "text-primary")} aria-hidden="true" />}
                            </label>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

// The grid shows grants even for a module that is switched off, so the Super
// Admin can see (and keep editing) what comes back when it is switched on.
const withModuleOn = (controls, key) => ({ ...controls, [key]: { ...moduleControl({ moduleControls: controls }, key), enabled: true } })

function sameSet(a, b) {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}
