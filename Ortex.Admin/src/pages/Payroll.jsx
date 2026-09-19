import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { FileText, IndianRupee, LayoutDashboard, ReceiptIndianRupee, Settings, Users, Wallet } from "../components/ui/Icons"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { isSuperAdmin } from "../lib/roles"
import PayrollDashboard from "./payroll/Dashboard"
import PayRuns from "./payroll/PayRuns"
import Employees from "./payroll/Employees"
import Approvals from "./payroll/Approvals"
import Loans from "./payroll/Loans"
import Reports from "./payroll/Reports"
import PayrollSettings from "./payroll/PayrollSettings"

// Payroll hub (docs/pm/PAYROLL_PLAN.md), laid out like Zoho Payroll: a
// dashboard, pay runs, employees, approvals, loans, reports and settings.
//
// Payroll is the Super Admin's and whoever holds the `payroll` grant (Accounts
// by default); an Admin does not see salaries by default (is_payroll(), 0040).
// Settings are the Super Admin's alone. A person's own payslips are at
// /payslips, not here.
const TABS = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard, Page: PayrollDashboard },
  { value: "runs", label: "Pay runs", icon: IndianRupee, Page: PayRuns },
  { value: "employees", label: "Employees", icon: Users, Page: Employees },
  { value: "approvals", label: "Approvals", icon: ReceiptIndianRupee, Page: Approvals },
  { value: "loans", label: "Loans", icon: Wallet, Page: Loans },
  { value: "reports", label: "Reports", icon: FileText, Page: Reports },
  { value: "settings", label: "Settings", icon: Settings, Page: PayrollSettings, superAdmin: true },
]

export default function Payroll() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const allowed = useMemo(
    () => (profile && canAccess(profile, "payroll") ? TABS.filter((t) => !t.superAdmin || isSuperAdmin(profile)) : []),
    [profile],
  )
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]
  if (!current) return null
  const Page = current.Page

  return (
    <div>
      <HeaderBand>
        <PageHeader title="Payroll" subtitle="Salaries from attendance: pay runs, payslips, PF, ESI and TDS, bank and statutory files." />
        <Tabs
          items={allowed.map((t) => ({ value: t.value, icon: t.icon, label: t.label }))}
          value={current.value}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
        />
      </HeaderBand>
      <Page key={current.value} />
    </div>
  )
}
