import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  Calendar,
  CalendarClock,
  FileText,
  IndianRupee,
  LayoutDashboard,
  QrCode,
  ReceiptIndianRupee,
  Settings,
  Sun,
  UserCheck,
  Users,
  Wallet,
} from "../components/ui/Icons"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { PillTabs, Tabs } from "../components/ui/Ui"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { isAdmin, isSuperAdmin } from "../lib/roles"
import Today from "./attendance/Today"
import Register from "./attendance/Register"
import Corrections from "./attendance/Corrections"
import { listCorrections } from "../services/attendance"
import { listLeaveRequests } from "../services/leave"
import { repo } from "../data/store/repository"
import Mine from "./attendance/Mine"
import AttendanceSettings from "./attendance/Settings"
import Leave from "./attendance/Leave"
import QrCodeDisplay from "./attendance/QrCodeDisplay"
import { canShowGateCode } from "./attendance/gate"
import MyPayslips from "./MyPayslips"
import PayrollDashboard from "./payroll/Dashboard"
import PayRuns from "./payroll/PayRuns"
import Employees from "./payroll/Employees"
import Approvals from "./payroll/Approvals"
import Loans from "./payroll/Loans"
import Reports from "./payroll/Reports"
import PayrollSettings from "./payroll/PayrollSettings"

// Attendance & pay (docs/pm/ATTENDANCE_LEAVE_PLAN.md, PAYROLL_PLAN.md). The
// console VIEWS and manages attendance; it never marks it. Clocking in and out
// happens only in the phone app.
//
// Four sections, each a row of pages. The URL names only the page
// (`?tab=today`), so every older link (`?tab=leave`, `?tab=qr&full=1`) still
// lands; the section follows from the page. A person who can open only one
// section (most staff) sees no section bar at all.
//
//   My records  everyone: own attendance, leave, payslips
//   Team        admins and "attendance-team" (Accounts); Corrections and
//               leave decisions are admins'; QR code per canShowGateCode
//   Payroll     is_payroll() ("payroll"), never implied by admin
//   Settings    the Super Admin
const SECTIONS = [
  { value: "team", label: "Team", icon: Users, subtitle: "Who is in today, the monthly register, and requests waiting for a decision." },
  { value: "me", label: "My records", icon: CalendarClock, subtitle: "Your attendance, leave and payslips. Attendance is marked in the phone app." },
  { value: "payroll", label: "Payroll", icon: IndianRupee, subtitle: "Salaries from attendance: pay runs, payslips, PF, ESI and TDS, bank and statutory files." },
  { value: "settings", label: "Settings", icon: Settings, subtitle: "Working hours, the punch window, leave policy and payroll rules." },
]

const team = (p) => isAdmin(p) || canAccess(p, "attendance-team")
const payroll = (p) => canAccess(p, "payroll")

const PAGES = [
  { section: "team", value: "today", label: "Today", icon: UserCheck, render: () => <Today />, allow: team },
  {
    section: "team",
    value: "register",
    label: "Register",
    icon: Calendar,
    render: () => <Register />,
    allow: (p) => team(p) || canAccess(p, "attendance-register"),
  },
  { section: "team", value: "corrections", label: "Corrections", icon: FileText, render: () => <Corrections />, allow: (p) => isAdmin(p), count: "corrections" },
  { section: "team", value: "leave-requests", label: "Leave requests", icon: Sun, render: () => <Leave view="requests" />, allow: team, count: "leave" },
  { section: "team", value: "leave-calendar", label: "Leave calendar", icon: Calendar, render: () => <Leave view="calendar" />, allow: team },
  { section: "team", value: "leave-balances", label: "Leave balances", icon: Wallet, render: () => <Leave view="balances" />, allow: team },
  // Not canAccess(): see canShowGateCode, which the Dashboard's gate card also checks.
  { section: "team", value: "qr", label: "QR code", icon: QrCode, render: () => <QrCodeDisplay />, allow: canShowGateCode },

  { section: "me", value: "mine", label: "My attendance", icon: CalendarClock, render: () => <Mine />, allow: () => true },
  { section: "me", value: "leave", label: "My leave", icon: Sun, render: () => <Leave view="mine" />, allow: () => true },
  { section: "me", value: "payslips", label: "My payslips", icon: ReceiptIndianRupee, render: () => <MyPayslips />, allow: (p) => canAccess(p, "payslips") },

  { section: "payroll", value: "payroll", label: "Overview", icon: LayoutDashboard, render: () => <PayrollDashboard />, allow: payroll },
  { section: "payroll", value: "runs", label: "Pay runs", icon: IndianRupee, render: () => <PayRuns />, allow: payroll },
  { section: "payroll", value: "employees", label: "Employees", icon: Users, render: () => <Employees />, allow: payroll },
  { section: "payroll", value: "approvals", label: "Approvals", icon: ReceiptIndianRupee, render: () => <Approvals />, allow: payroll },
  { section: "payroll", value: "loans", label: "Loans", icon: Wallet, render: () => <Loans />, allow: payroll },
  { section: "payroll", value: "reports", label: "Reports", icon: FileText, render: () => <Reports />, allow: payroll },

  { section: "settings", value: "settings", label: "Attendance and leave", icon: CalendarClock, render: () => <AttendanceSettings />, allow: (p) => isSuperAdmin(p) },
  { section: "settings", value: "payroll-settings", label: "Payroll", icon: IndianRupee, render: () => <PayrollSettings />, allow: (p) => isSuperAdmin(p) && payroll(p) },
]


export default function Attendance() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const allowed = useMemo(() => (profile ? PAGES.filter((t) => t.allow(profile)) : []), [profile])
  const sections = SECTIONS.filter((s) => allowed.some((t) => t.section === s.value))
  // Before the sections, Leave had its own ?view= (requests, calendar, balances).
  const asked = params.get("tab") === "leave" && params.get("view") && params.get("view") !== "mine" ? `leave-${params.get("view")}` : params.get("tab")
  const current = allowed.find((t) => t.value === asked) || allowed[0]
  const counts = usePendingCounts({
    corrections: allowed.some((t) => t.count === "corrections"),
    leave: allowed.some((t) => t.count === "leave"),
  })
  if (!current) return null
  const section = sections.find((s) => s.value === current.section)
  const pages = allowed.filter((t) => t.section === section.value)
  const go = (tab) => setParams({ tab }, { replace: true })
  const sectionCount = (s) => allowed.filter((t) => t.section === s && t.count).reduce((n, t) => n + (counts[t.count] || 0), 0)

  return (
    <div>
      <HeaderBand>
        <PageHeader title="Attendance & pay" subtitle={section.subtitle} />
        {sections.length > 1 && (
          <Tabs
            items={sections.map((s) => ({ value: s.value, icon: s.icon, label: s.label, count: sectionCount(s.value) || undefined }))}
            value={section.value}
            // A section opens on its first page.
            onChange={(v) => go(allowed.find((t) => t.section === v).value)}
          />
        )}
      </HeaderBand>
      {pages.length > 1 && (
        <PillTabs
          className="mb-5"
          items={pages.map((t) => ({ value: t.value, icon: t.icon, label: t.label, count: t.count && counts[t.count] ? counts[t.count] : undefined }))}
          value={current.value}
          onChange={go}
        />
      )}
      <div key={current.value}>{current.render()}</div>
    </div>
  )
}

/** Corrections and leave requests waiting for a decision, for the counts. Live. */
function usePendingCounts({ corrections, leave }) {
  const [n, setN] = useState({ corrections: 0, leave: 0 })
  useEffect(() => {
    if (!corrections && !leave) return undefined
    let alive = true
    const size = (r) => (r.missing ? 0 : (r.rows || []).length)
    const read = () =>
      Promise.all([
        corrections ? listCorrections({ status: "pending" }) : { rows: [] },
        leave ? listLeaveRequests({ status: "pending" }) : { rows: [] },
      ]).then(([c, l]) => {
        if (alive) setN({ corrections: size(c), leave: size(l) })
      })
    void read()
    let t = null
    const off = repo.subscribe?.(() => {
      clearTimeout(t)
      t = setTimeout(read, 800)
    })
    return () => {
      alive = false
      clearTimeout(t)
      off?.()
    }
  }, [corrections, leave])
  return n
}
