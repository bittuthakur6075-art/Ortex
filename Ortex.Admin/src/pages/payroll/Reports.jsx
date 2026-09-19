import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, FileSpreadsheet } from "../../components/ui/Icons"
import { Banner, Button, Card, CardHeader, Drawer, PageLoader, Segmented, Select, Spinner } from "../../components/ui/Ui"
import { loadDirectory } from "../../hooks/useRecordHistory"
import { downloadCsvRaw } from "../../lib/csv"
import { fyOf } from "../../lib/payroll"
import { getRun, history, listClaims, listLoans, listRuns } from "../../services/payroll"
import { MonthSwitcher } from "../attendance/status"
import { LoadError } from "./setup/common"
import { downloadEcr } from "./run/files"
import {
  epfSummary,
  esiSummary,
  loanOutstanding,
  lwfSummary,
  payrollHistory,
  payrollSummary,
  reimbursementSummary,
  salaryRegister,
  tdsSummary,
} from "./run/reports"
import { downloadXlsx, monthWords, thisMonthIST } from "./run/shared"

// Payroll → Reports, listed the way Zoho Payroll lists them: pick a month or a
// financial year, then view or export any report as CSV or xlsx. Figures come
// from PAID runs only, so a report never shows money that has not gone out.
// Loans and the payroll history are not tied to the period.

const REPORTS = [
  { key: "summary", name: "Payroll summary", about: "Each paid run: employees, gross, deductions, TDS, net pay and cost", build: (c) => payrollSummary(c.runs) },
  { key: "register", name: "Salary register", about: "Form IV style, one row per person and month, every component a column", build: (c) => salaryRegister(c.runs) },
  { key: "epf", name: "EPF summary", about: "PF wages and every share per member; the ECR file for a single month", build: (c) => epfSummary(c.runs), ecr: true },
  { key: "esi", name: "ESI summary", about: "Paid days, gross and both ESI shares per insured person", build: (c) => esiSummary(c.runs) },
  { key: "lwf", name: "Labour welfare fund", about: "Delhi LWF, deducted in June and December", build: (c) => lwfSummary(c.runs) },
  { key: "tds", name: "TDS summary", about: "Taxable pay and TDS deducted per person, for Form 138 and Form 130", build: (c) => tdsSummary(c.runs) },
  { key: "loans", name: "Loans outstanding", about: "Every open loan and advance with what is left to recover (not tied to the period)", build: (c) => loanOutstanding(c.loans, c.nameOf) },
  { key: "claims", name: "Reimbursement summary", about: "Claims by bill date in the period, with their status", build: (c) => reimbursementSummary(c.claims, c.nameOf, c.inPeriod) },
  { key: "history", name: "Payroll history", about: "Who did what in payroll, the latest 200 entries (not tied to the period)", build: (c) => payrollHistory(c.history, c.nameOf, c.runsById) },
]

export default function Reports() {
  const [base, setBase] = useState({ loading: true })
  const [mode, setMode] = useState("month")
  const [month, setMonth] = useState(() => thisMonthIST())
  const [fy, setFy] = useState(() => fyOf(`${thisMonthIST()}-01`).label)
  const [period, setPeriod] = useState({ loading: true, runs: [] })
  const [view, setView] = useState(null)

  useEffect(() => {
    let live = true
    Promise.all([listRuns(), listLoans(), listClaims(), history({ limit: 200 }), loadDirectory()])
      .then(([runs, loans, claims, entries, directory]) => {
        if (!live) return
        // Open on the latest paid month, where the reports have something to say.
        const lastPaid = runs.filter((r) => r.status === "paid").sort((a, b) => (a.month < b.month ? 1 : -1))[0]
        if (lastPaid) {
          setMonth(String(lastPaid.month).slice(0, 7))
          setFy(fyOf(lastPaid.month).label)
        }
        setBase({ loading: false, runs, loans, claims, history: entries, directory: directory || {} })
      })
      .catch((error) => live && setBase({ loading: false, error }))
    return () => {
      live = false
    }
  }, [])

  const range = useMemo(() => {
    if (mode === "month") return { from: `${month}-01`, to: `${month}-31`, label: monthWords(month), stem: month }
    const start = Number(fy.slice(0, 4))
    return { from: `${start}-04-01`, to: `${start + 1}-03-31`, label: `FY ${fy}`, stem: `fy-${fy}` }
  }, [mode, month, fy])

  const loadPeriod = useCallback(async () => {
    if (!base.runs) return
    setPeriod((p) => ({ ...p, loading: true }))
    const inRange = base.runs
      .filter((r) => r.status === "paid" && r.month >= range.from && r.month <= range.to)
      .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : a.kind === "regular" ? -1 : 1))
    try {
      const runs = (await Promise.all(inRange.map((r) => getRun(r.id)))).filter(Boolean)
      setPeriod({ loading: false, runs })
    } catch (error) {
      setPeriod({ loading: false, runs: [], error })
    }
  }, [base.runs, range])

  useEffect(() => {
    void loadPeriod()
  }, [loadPeriod])

  const years = useMemo(() => {
    const set = new Set([fyOf(`${thisMonthIST()}-01`).label])
    for (const r of base.runs || []) set.add(fyOf(r.month).label)
    return [...set].sort().reverse()
  }, [base.runs])

  if (base.loading) return <PageLoader />
  if (base.error) return <LoadError error={base.error} />

  const ctx = {
    runs: period.runs,
    loans: base.loans,
    claims: base.claims,
    history: base.history,
    runsById: new Map(base.runs.map((r) => [r.id, r])),
    nameOf: (uid) => base.directory[uid]?.name || "Unknown",
    inPeriod: (d) => Boolean(d) && d >= range.from && d <= range.to,
  }

  const fileName = (r, ext) => `${r.key}-${["loans", "history"].includes(r.key) ? "current" : range.stem}.${ext}`
  const exportCsv = (r) => downloadCsvRaw(fileName(r, "csv"), r.build(ctx))
  const exportXlsx = async (r) => {
    const ok = await downloadXlsx(fileName(r, "xlsx"), [{ name: r.name, rows: r.build(ctx) }])
    if (!ok) {
      toast.warning("The spreadsheet library did not load, so this downloaded as CSV")
      exportCsv(r)
    }
  }
  const ecrRun = mode === "month" ? period.runs.find((r) => r.kind === "regular") : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="md"
          items={[
            { value: "month", label: "Month" },
            { value: "fy", label: "Financial year" },
          ]}
          value={mode}
          onChange={setMode}
        />
        {mode === "month" ? (
          <MonthSwitcher month={month} onChange={setMonth} max={thisMonthIST()} />
        ) : (
          <Select className="w-[180px]" value={fy} onChange={(e) => setFy(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>
                FY {y}
              </option>
            ))}
          </Select>
        )}
        <span className="text-[13px] text-muted-foreground">
          {period.loading ? <Spinner className="h-4 w-4" /> : `${period.runs.length} paid ${period.runs.length === 1 ? "run" : "runs"} in ${range.label}`}
        </span>
      </div>

      <LoadError error={period.error} />
      {!period.loading && period.runs.length === 0 && (
        <Banner tone="info">Nothing was paid in {range.label}. The period reports stay empty until a pay run for it is paid.</Banner>
      )}

      <Card className="overflow-hidden">
        <CardHeader title="Reports" description={`${range.label}. View on screen, or export for the portals, Tally or a spreadsheet.`} />
        <ul className="divide-y divide-border border-t border-border">
          {REPORTS.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <button type="button" className="text-sm font-medium text-foreground hover:text-primary" onClick={() => setView(r)}>
                  {r.name}
                </button>
                <div className="text-[12px] text-muted-foreground">{r.about}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {r.ecr && mode === "month" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!ecrRun || period.loading}
                    title={ecrRun ? undefined : "No paid regular run in this month"}
                    onClick={() => {
                      const warnings = downloadEcr(ecrRun, ecrRun.payslips)
                      if (warnings.length) toast.warning(warnings.slice(0, 3).join("; "))
                    }}
                  >
                    ECR .txt
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setView(r)} disabled={period.loading}>
                  <Eye className="h-4 w-4" /> View
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportCsv(r)} disabled={period.loading}>
                  CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => void exportXlsx(r)} disabled={period.loading}>
                  <FileSpreadsheet className="h-4 w-4" /> XLSX
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {view && <ReportDrawer report={view} rows={view.build(ctx)} label={range.label} onClose={() => setView(null)} onCsv={() => exportCsv(view)} onXlsx={() => void exportXlsx(view)} />}
    </div>
  )
}

const LIMIT = 300

function ReportDrawer({ report, rows, label, onClose, onCsv, onXlsx }) {
  const [header, ...body] = rows
  const fmt = (v) => (typeof v === "number" ? v.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : v)
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-5xl"
      title={report.name}
      subtitle={["loans", "history"].includes(report.key) ? "Current" : label}
      bodyClassName="p-0"
      footer={
        <div className="flex justify-end gap-2.5">
          <Button variant="outline" onClick={onCsv}>
            CSV
          </Button>
          <Button onClick={onXlsx}>
            <FileSpreadsheet className="h-4 w-4" /> XLSX
          </Button>
        </div>
      }
    >
      {body.length === 0 ? (
        <p className="p-5 text-[13px] text-muted-foreground">Nothing to report for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="mt-head">
              <tr className="text-left">
                {header.map((h, i) => (
                  <th key={i} className="whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="mt-body">
              {body.slice(0, LIMIT).map((r, i) => (
                <tr key={i} className={r[0] === "Total" ? "font-semibold" : undefined}>
                  {r.map((v, j) => (
                    <td key={j} className={typeof v === "number" ? "whitespace-nowrap text-right tabular" : "whitespace-nowrap"}>
                      {fmt(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {body.length > LIMIT && <p className="p-5 text-[13px] text-muted-foreground">Showing the first {LIMIT} of {body.length} rows. Export for the rest.</p>}
        </div>
      )}
    </Drawer>
  )
}
