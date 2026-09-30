import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { LayoutGrid, ShieldCheck, Users as UsersIcon } from "../components/ui/Icons"
import { Tabs } from "../components/ui/Ui"
import { listProfiles } from "../services/users"
import ModuleOverview from "./modules/ModuleOverview"
import RoleMatrix from "./modules/RoleMatrix"
import PeopleAccess from "./modules/PeopleAccess"

// The Super Admin's one place for who opens what (route /modules, module key
// `modules`, superAdminOnly). Three views over the same rule as canAccess() and
// has_module_access():
//   Modules  each module on or off for the company, and who can open it
//   Roles    what each role (Admin included) gets
//   People   each person's own access on top of their role
const TABS = [
  { value: "modules", label: "Modules", icon: LayoutGrid },
  { value: "roles", label: "Roles", icon: ShieldCheck },
  { value: "people", label: "People", icon: UsersIcon },
]

/**
 * `embedded` drops the page header, because inside the Control centre the
 * section already carries a heading and two titles in a row read as a mistake.
 * The tab switch stays: the three views are genuinely different tables.
 */
export default function Modules({ embedded = false }) {
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.value === params.get("tab"))?.value || "modules"

  // MERGE, never replace. Embedded in the Control centre this page shares the
  // query string with the section menu (`?section=access`), and writing a bare
  // { tab } wiped it, which threw you back to Company the moment you pressed
  // Roles or People.
  const goTab = (v) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === "modules") next.delete("tab")
        else next.set("tab", v)
        return next
      },
      { replace: true },
    )

  const [people, setPeople] = useState([])
  const [peopleError, setPeopleError] = useState("")
  const loadPeople = useCallback(async () => {
    try {
      setPeople(await listProfiles())
      setPeopleError("")
    } catch (e) {
      setPeople([])
      setPeopleError(e.message || "Could not load people")
    }
  }, [])
  useEffect(() => {
    void loadPeople()
  }, [loadPeople])

  return (
    <div>
      {embedded ? (
        <div className="mb-5">
          <Tabs items={TABS} value={tab} onChange={goTab} />
        </div>
      ) : (
        <HeaderBand>
          <PageHeader title="Modules" subtitle="Switch modules on or off, and choose who can open each one" />
          <Tabs items={TABS} value={tab} onChange={goTab} />
        </HeaderBand>
      )}
      {tab === "modules" && <ModuleOverview people={people} peopleError={peopleError} />}
      {tab === "roles" && <RoleMatrix />}
      {tab === "people" && <PeopleAccess people={people} reload={loadPeople} />}
    </div>
  )
}
