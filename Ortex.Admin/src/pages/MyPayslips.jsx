import { useEffect, useMemo, useState } from "react"
import { FileText } from "../components/ui/Icons"
import PageHeader from "../components/layout/PageHeader"
import { Button, Card, CardHeader, EmptyState, PageLoader, Segmented } from "../components/ui/Ui"
import { useProfile } from "../hooks/useProfile"
import { useSettings } from "../hooks/useCollection"
import { fyOf } from "../lib/payroll"
import { getPayrollSettings, myPayslips } from "../services/payroll"
import { LoadError } from "./payroll/setup/common"
import PayslipPreview from "./payroll/run/PayslipPreview"
import { monthWords, rupees } from "./payroll/run/shared"

// My payslips (/payslips): every signed-in person's own payslips, once payroll
// has recorded the payment (a payslip is released with its run, migration
// 0040; RLS returns nobody else's). Grouped by financial year with the year so
// far on top; a row opens the payslip with its PDF.

export default function MyPayslips() {
  const profile = useProfile()
  const company = useSettings()?.company
  const [state, setState] = useState({ loading: true, slips: [] })
  const [fy, setFy] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    let live = true
    Promise.all([myPayslips(profile.id), getPayrollSettings().catch(() => null)])
      .then(([slips, settings]) => live && setState({ loading: false, slips, org: settings?.organisation || null }))
      .catch((error) => live && setState({ loading: false, slips: [], error }))
    return () => {
      live = false
    }
  }, [profile?.id])

  // Payroll settings are payroll's to read; for everyone else the company's
  // own name and address stand in on the payslip.
  const org = useMemo(() => {
    const o = state.org || {}
    return {
      ...o,
      name: o.name || company?.name || "Ortex Industries",
      address: o.address || company?.address || "",
    }
  }, [state.org, company])

  const years = useMemo(() => {
    const map = new Map()
    for (const s of state.slips) {
      const label = fyOf(s.data?.month || "2000-01-01").label
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(s)
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [state.slips])

  const current = years.find(([label]) => label === fy) || years[0]
  const ytd = useMemo(() => {
    const list = current?.[1] || []
    return list.reduce(
      (t, s) => ({
        gross: t.gross + (Number(s.data?.gross) || 0),
        deductions: t.deductions + (Number(s.data?.totalDeductions) || 0) - (Number(s.data?.tds?.monthly) || 0),
        tds: t.tds + (Number(s.data?.tds?.monthly) || 0),
        net: t.net + (Number(s.data?.netPay) || 0),
      }),
      { gross: 0, deductions: 0, tds: 0, net: 0 },
    )
  }, [current])

  return (
    <div>
      <PageHeader title="My payslips" subtitle="Your salary slips, available once payroll has paid the month." />
      {state.loading ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <LoadError error={state.error} />
          {years.length === 0 ? (
            <EmptyState icon={FileText} title="No payslips yet" description="No payslips yet. They appear here once payroll records a payment." />
          ) : (
            <>
              {years.length > 1 && (
                <Segmented
                  size="md"
                  items={years.map(([label]) => ({ value: label, label: `FY ${label}` }))}
                  value={current[0]}
                  onChange={setFy}
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Tile label={`Gross, FY ${current[0]}`} value={rupees(ytd.gross)} />
                <Tile label="Deductions (PF, ESI, loans)" value={rupees(ytd.deductions)} />
                <Tile label="Income tax deducted" value={rupees(ytd.tds)} />
                <Tile label="Net pay received" value={rupees(ytd.net)} strong />
              </div>
              <Card className="overflow-hidden">
                <CardHeader title={`Financial year ${current[0]}`} description="April to March. Click a month to see the payslip and download it." />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="mt-head">
                      <tr className="text-left">
                        <th>Month</th>
                        <th className="text-right">Paid days</th>
                        <th className="text-right">Gross</th>
                        <th className="text-right">Deductions</th>
                        <th className="text-right">Net pay</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="mt-body">
                      {current[1].map((s) => (
                        <tr key={s.id} className="cursor-pointer" onClick={() => setOpen(s)}>
                          <td className="font-medium text-foreground">{monthWords(s.data?.month)}</td>
                          <td className="text-right tabular">
                            {s.data?.paidDays} / {s.data?.basisDays}
                          </td>
                          <td className="text-right tabular">{rupees(s.data?.gross)}</td>
                          <td className="text-right tabular">{rupees(s.data?.totalDeductions)}</td>
                          <td className="text-right font-semibold text-foreground tabular">{rupees(s.data?.netPay)}</td>
                          <td className="text-right">
                            <Button size="sm" variant="ghost">
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
      <PayslipPreview item={open ? { slip: open.data, status: open.status, payDate: open.released_at } : null} org={org} onClose={() => setOpen(null)} />
    </div>
  )
}

function Tile({ label, value, strong }) {
  return (
    <Card className="gap-1.5 p-4">
      <span className="text-xs font-medium uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
      <span className={strong ? "text-lg font-semibold text-primary tabular" : "text-lg font-semibold text-foreground tabular"}>{value}</span>
    </Card>
  )
}
