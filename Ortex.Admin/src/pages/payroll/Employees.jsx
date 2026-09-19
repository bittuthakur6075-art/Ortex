import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Users } from "../../components/ui/Icons"
import { Avatar, Badge, Button, Card, CardHeader, Chip, ChipGroup, EmptyState, ExportButton, PageLoader, SearchInput } from "../../components/ui/Ui"
import { exportCsv } from "../../lib/csv"
import { listEmployees, revisionFor } from "../../services/payroll"
import { LoadError } from "./setup/common"
import { dateLabel, missingFor, money, thisMonthIST } from "./setup/helpers"

// Payroll → Employees (Zoho Payroll's employee list): everyone with a login,
// their current salary, their PF / ESI flags and what is still missing before
// they can be paid. A row opens the pay profile.

const FILTERS = [
  { value: "active", label: "Active" },
  { value: "missing", label: "Missing details" },
  { value: "exited", label: "Exited" },
]

const exited = (p) => ["exited", "settled"].includes(p.employee?.status)

export default function Employees() {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState("active")
  const [query, setQuery] = useState("")

  const load = useCallback(async () => {
    try {
      setRows(await listEmployees())
      setError(null)
    } catch (e) {
      setError(e)
      setRows([])
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const month = `${thisMonthIST()}-01`
  const people = useMemo(
    () =>
      (rows || [])
        .filter((p) => p.active !== false || p.employee)
        .map((p) => ({ ...p, current: revisionFor(p.revisions, month) || p.revisions[0] || null, missing: missingFor(p) })),
    [rows, month],
  )

  const counts = useMemo(
    () => ({
      active: people.filter((p) => !exited(p)).length,
      missing: people.filter((p) => !exited(p) && p.missing.length).length,
      exited: people.filter(exited).length,
    }),
    [people],
  )

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter((p) => (filter === "exited" ? exited(p) : !exited(p)))
      .filter((p) => filter !== "missing" || p.missing.length)
      .filter((p) => {
        if (!q) return true
        const e = p.employee || {}
        return [p.name, p.email, e.employee_code, e.designation, e.department].some((v) => String(v || "").toLowerCase().includes(q))
      })
  }, [people, filter, query])

  const exportRows = () =>
    exportCsv(`payroll-employees-${thisMonthIST()}.csv`, [
      { header: "Name", value: (p) => p.name },
      { header: "Email", value: (p) => p.email },
      { header: "Employee code", value: (p) => p.employee?.employee_code || "" },
      { header: "Designation", value: (p) => p.employee?.designation || "" },
      { header: "Department", value: (p) => p.employee?.department || "" },
      { header: "Date of joining", value: (p) => p.employee?.doj || "" },
      { header: "Annual CTC", value: (p) => (p.current ? Number(p.current.annual_ctc) : "") },
      { header: "Monthly gross", value: (p) => (p.current ? Number(p.current.monthly_gross) : "") },
      { header: "PF", value: (p) => (p.employee?.pf_enabled ?? true ? "Yes" : "No") },
      { header: "ESI", value: (p) => (p.employee?.esi_enabled ? "Yes" : "No") },
      { header: "Status", value: (p) => p.employee?.status || "active" },
      { header: "Missing", value: (p) => p.missing.join(", ") },
    ], shown)

  return (
    <div>
      <LoadError error={error} />
      <div className="mb-4 flex flex-wrap items-center gap-[10px]">
        <ChipGroup>
          {FILTERS.map((f) => (
            <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label} <span className="ml-1 text-subtle-foreground">{counts[f.value]}</span>
            </Chip>
          ))}
        </ChipGroup>
        <div className="ml-auto flex items-center gap-[10px]">
          <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} onClear={() => setQuery("")} placeholder="Search name, code, department" />
          <ExportButton onClick={exportRows} disabled={!shown.length} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Employees" description="Everyone with a login. Pay details are visible to payroll only." />
        {rows === null ? (
          <div className="p-6"><PageLoader /></div>
        ) : !shown.length ? (
          <EmptyState
            icon={Users}
            title={query ? "No one matches that search" : filter === "exited" ? "No one has left" : filter === "missing" ? "Everyone's details are complete" : "No employees yet"}
            description={filter === "active" && !query ? "People appear here once they have a login in Users." : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Employee</th>
                  <th>Code</th>
                  <th>Designation</th>
                  <th>Department</th>
                  <th className="text-right">Annual CTC</th>
                  <th className="text-right">Monthly gross</th>
                  <th>Statutory</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {shown.map((p) => {
                  const e = p.employee || {}
                  return (
                    <tr key={p.id} className="cursor-pointer" onClick={() => navigate(`/payroll/employees/${p.id}`)}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={p.name || p.email} src={p.avatar_url} className="h-8 w-8" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">{p.name || p.email}</div>
                            <div className="truncate text-xs text-muted-foreground">{e.doj ? `Joined ${dateLabel(e.doj)}` : p.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted-foreground">{e.employee_code || "Not set"}</td>
                      <td className="text-muted-foreground">{e.designation || "Not set"}</td>
                      <td className="text-muted-foreground">{e.department || "Not set"}</td>
                      <td className="tabular text-right text-foreground">
                        {p.current ? (
                          money(p.current.annual_ctc)
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              navigate(`/payroll/employees/${p.id}`, { state: { revise: true } })
                            }}
                          >
                            Add salary
                          </Button>
                        )}
                      </td>
                      <td className="tabular text-right text-foreground">{p.current ? money(p.current.monthly_gross) : ""}</td>
                      <td>
                        <div className="flex gap-1">
                          {(e.pf_enabled ?? true) && <Badge tone="blue">PF</Badge>}
                          {e.esi_enabled && <Badge tone="violet">ESI</Badge>}
                          {!(e.pf_enabled ?? true) && !e.esi_enabled && <span className="text-xs text-muted-foreground">None</span>}
                        </div>
                      </td>
                      <td>
                        {exited(p) ? (
                          <Badge tone="slate">{e.status === "settled" ? "Settled" : "Exited"}</Badge>
                        ) : p.missing.length ? (
                          <span className="text-xs text-warning-text">Missing: {p.missing.join(", ")}</span>
                        ) : (
                          <Badge tone="emerald">Ready</Badge>
                        )}
                      </td>
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
