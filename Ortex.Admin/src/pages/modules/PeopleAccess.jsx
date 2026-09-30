import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Avatar, Badge, Button, Card, CardHeader, Chip, ChipGroup, EmptyState, SearchInput } from "../../components/ui/Ui"
import { Users as UsersIcon } from "../../components/ui/Icons"
import { ASSIGNABLE_MODULES, moduleControl } from "../../data/domain/modules"
import { useRolePermissions } from "../../hooks/useRolePermissions"
import { useModuleControls } from "../../hooks/useModuleControls"
import { updateProfile } from "../../services/users"
import { accessReason } from "../../lib/moduleAccess"
import { ROLE_TONE, isSuperAdmin, roleLabel } from "../../lib/roles"
import { cn } from "../../lib/cn"
import { groupBySection, shortLabel } from "./helpers"

// Modules → People: every person against every module, in one grid. A locked
// tick comes from their role (or the Admin role) and is changed on the Roles
// tab for everyone; an open box is this person's own access (profiles.modules),
// saved here for as many people as were changed. Same data as the Access ticks
// in a user's Edit dialog, which still work.

const ROLE_FILTERS = ["all", "admin", "accounts", "sales", "staff"]

export default function PeopleAccess({ people, reload }) {
  const { grants } = useRolePermissions()
  const { controls } = useModuleControls()
  const [role, setRole] = useState("all")
  const [q, setQ] = useState("")
  const [draft, setDraft] = useState({}) // id -> modules[]
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

  const own = (p) => draft[p.id] || p.modules || []
  const dirtyIds = Object.keys(draft).filter((id) => {
    const p = people.find((x) => x.id === id)
    return p && !sameSet(draft[id], p.modules || [])
  })

  const toggle = (p, key) => {
    const cur = own(p)
    setDraft((d) => ({ ...d, [p.id]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] }))
  }

  const save = async () => {
    setSaving(true)
    let done = 0
    try {
      for (const id of dirtyIds) {
        await updateProfile(id, { modules: [...new Set(draft[id])] })
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
          description="Locked ticks come from the role; change them on the Roles tab. Open boxes are this person's own access."
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
                  const mine = own(p)
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
                        const base = accessReason({ ...p, active: true, modules: [] }, m.key, grants, withModuleOn(controls, m.key))
                        // The QR code is never the Admin role's: it is ticked per Admin (0043).
                        const locked = (base === "admin" && !m.adminByGrant) || base === "role"
                        const checked = locked || mine.includes(m.key)
                        const off = !moduleControl({ moduleControls: controls }, m.key).enabled
                        return (
                          <td key={m.key} className={cn("text-center", off && "opacity-60")}>
                            <input
                              type="checkbox"
                              aria-label={`${p.name || p.email}: ${m.label}`}
                              title={locked ? (base === "admin" ? "From the Admin role" : `From the ${roleLabel(p.role)} role`) : off ? "Kept, but the module is switched off" : "Own access"}
                              className="h-4 w-4 rounded border-border accent-primary disabled:opacity-50"
                              checked={checked}
                              disabled={locked || saving}
                              onChange={() => toggle(p, m.key)}
                            />
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
