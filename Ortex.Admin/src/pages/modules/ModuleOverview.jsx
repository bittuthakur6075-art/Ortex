import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { Avatar, Badge, Banner, Button, Card, CardHeader, Drawer, EmptyState, Modal, Switch } from "../../components/ui/Ui"
import { LayoutGrid } from "../../components/ui/Icons"
import { ASSIGNABLE_MODULES, moduleControl } from "../../data/domain/modules"
import { useRolePermissions } from "../../hooks/useRolePermissions"
import { saveModuleControls, useModuleControls } from "../../hooks/useModuleControls"
import { REASON_LABEL, whoCanOpen } from "../../lib/moduleAccess"
import { roleLabel } from "../../lib/roles"
import { groupBySection, shortLabel } from "./helpers"

// Modules → Overview: every grantable module with its company-wide switch
// (module_controls.enabled, migration 0053) and who can open it today, and why.
// Switching a module off closes it to everyone but the Super Admin, on the
// console, the phone and in the database; the role grants and personal ticks
// are kept, so switching it back on restores exactly who had it.

const REASON_TONE = { super: "violet", admin: "violet", role: "blue", own: "amber" }

export default function ModuleOverview({ people, peopleError }) {
  const { grants } = useRolePermissions()
  const { controls, ready, loaded } = useModuleControls()
  const [confirmOff, setConfirmOff] = useState(null) // module
  const [showWho, setShowWho] = useState(null) // module
  const [busy, setBusy] = useState(null) // module key

  const sections = useMemo(() => groupBySection(ASSIGNABLE_MODULES), [])
  const who = useMemo(() => {
    const out = {}
    for (const m of ASSIGNABLE_MODULES) out[m.key] = whoCanOpen(people, m.key, grants, controls)
    return out
  }, [people, grants, controls])
  // Who would lose a module if it were switched off: everyone but the Super Admin.
  const reachIfOn = (key) => whoCanOpen(people, key, grants, { ...controls, [key]: { ...moduleControl({ moduleControls: controls }, key), enabled: true } })

  const offCount = ASSIGNABLE_MODULES.filter((m) => !moduleControl({ moduleControls: controls }, m.key).enabled).length

  const setEnabled = async (m, enabled) => {
    setBusy(m.key)
    try {
      const current = moduleControl({ moduleControls: controls }, m.key)
      await saveModuleControls({ [m.key]: { ...current, enabled } })
      toast.success(enabled ? `${m.label} is on again.` : `${m.label} is off. Only you can open it now.`)
    } catch (e) {
      toast.error(e.message || "Could not change the module")
    }
    setBusy(null)
    setConfirmOff(null)
  }

  const losing = confirmOff ? reachIfOn(confirmOff.key).filter((x) => x.reason !== "super") : []

  return (
    <div className="space-y-5">
      {loaded && !ready && (
        <Banner tone="warning">
          Module switches are not set up on this database yet (migration 0053). Every module stays on; switching is
          disabled until it is applied.
        </Banner>
      )}
      {peopleError && <Banner tone="info">{peopleError}</Banner>}

      <Card className="overflow-hidden">
        <CardHeader
          title="Modules"
          description={
            offCount
              ? `${ASSIGNABLE_MODULES.length - offCount} on, ${offCount} switched off for the company.`
              : "Every module is on. Switch one off to close it to everyone but you."
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                <th>Module</th>
                <th>Who can open it</th>
                <th className="text-right">Company</th>
              </tr>
            </thead>
            <tbody className="mt-body">
              {sections.map(([section, items]) => (
                <Section key={section} section={section}>
                  {items.map((m) => {
                    const c = moduleControl({ moduleControls: controls }, m.key)
                    const list = who[m.key] || []
                    return (
                      <tr key={m.key}>
                        <td>
                          <Link to={m.path} className="font-medium text-foreground hover:text-primary">
                            {shortLabel(m)}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                            {!c.enabled ? (
                              <Badge tone="rose">Off for everyone</Badge>
                            ) : (
                              <>
                                {!c.adminAccess && <Badge tone="amber">Not with the Admin role</Badge>}
                                {rolesWith(grants, m.key).map((r) => (
                                  <Badge key={r} tone="slate">{roleLabel(r)}</Badge>
                                ))}
                              </>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => setShowWho(m)}
                            className="flex items-center gap-2 text-left hover:text-primary"
                            disabled={!people.length}
                          >
                            <span className="flex -space-x-2">
                              {list.slice(0, 5).map(({ person }) => (
                                <Avatar key={person.id} name={person.name || person.email} src={person.avatar_url} className="h-7 w-7 ring-2 ring-card" />
                              ))}
                            </span>
                            <span className="text-muted-foreground">
                              {people.length ? `${list.length} ${list.length === 1 ? "person" : "people"}` : "Not loaded"}
                            </span>
                          </button>
                        </td>
                        <td className="text-right">
                          <span className="inline-flex items-center gap-2.5">
                            <span className="text-xs text-muted-foreground">{c.enabled ? "On" : "Off"}</span>
                            <Switch
                              checked={c.enabled}
                              label={`${m.label} on for the company`}
                              disabled={!ready || busy === m.key}
                              onChange={(on) => (on ? setEnabled(m, true) : setConfirmOff(m))}
                            />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </Section>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={Boolean(confirmOff)}
        onClose={() => setConfirmOff(null)}
        title={confirmOff ? `Switch off ${shortLabel(confirmOff)}?` : ""}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOff(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setEnabled(confirmOff, false)} disabled={Boolean(busy)}>
              {busy ? "Switching off…" : "Switch off"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Nobody but you will be able to open it, on the console or the phone, until you switch it back on. Role grants
          and personal access are kept.
        </p>
        {losing.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {losing.length} {losing.length === 1 ? "person loses" : "people lose"} access
            </p>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {losing.slice(0, 12).map(({ person }) => (
                <li key={person.id}>
                  {person.name || person.email} <span className="text-muted-foreground">· {roleLabel(person.role)}</span>
                </li>
              ))}
              {losing.length > 12 && <li className="text-muted-foreground">and {losing.length - 12} more</li>}
            </ul>
          </div>
        )}
      </Modal>

      <Drawer
        open={Boolean(showWho)}
        onClose={() => setShowWho(null)}
        title={showWho ? `Who can open ${shortLabel(showWho)}` : ""}
        subtitle="Active people only, and why each one has it."
      >
        {showWho && (who[showWho.key] || []).length === 0 ? (
          <EmptyState icon={LayoutGrid} title="Nobody but you" description="No role or person has this module." />
        ) : (
          <ul className="divide-y divide-border">
            {(showWho ? who[showWho.key] : []).map(({ person, reason }) => (
              <li key={person.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={person.name || person.email} src={person.avatar_url} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <Link to={`/users/${person.id}`} className="block truncate text-sm font-medium text-foreground hover:text-primary">
                    {person.name || person.email}
                  </Link>
                  <div className="text-xs text-muted-foreground">{roleLabel(person.role)}</div>
                </div>
                <Badge tone={REASON_TONE[reason]}>
                  {reason === "role" ? `${roleLabel(person.role)} role` : REASON_LABEL[reason]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </div>
  )
}

function Section({ section, children }) {
  return (
    <>
      <tr>
        <td colSpan={3} className="bg-subtle text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {section}
        </td>
      </tr>
      {children}
    </>
  )
}

const rolesWith = (grants, key) => Object.keys(grants || {}).filter((r) => (grants[r] || []).includes(key))

