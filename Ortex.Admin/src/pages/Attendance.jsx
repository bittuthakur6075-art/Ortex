import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { Calendar, CalendarClock, FileText, Settings, Sun, UserCheck } from "../components/ui/Icons"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import { isAdmin, isSuperAdmin } from "../lib/roles"
import Today from "./attendance/Today"
import Register from "./attendance/Register"
import Corrections from "./attendance/Corrections"
import { listCorrections } from "../services/attendance"
import { repo } from "../data/store/repository"
import Mine from "./attendance/Mine"
import AttendanceSettings from "./attendance/Settings"
import Leave from "./attendance/Leave"

// Attendance hub (docs/pm/ATTENDANCE_LEAVE_PLAN.md). The console VIEWS and
// manages attendance; it never marks it. Clocking in and out happens only in
// the phone app, and the database has no way in for anything else.
//
//   Today          admins, and anyone granted "attendance-team" (Accounts)
//   Register       admins, "attendance-register" (lock + export) or "attendance-team"
//   Corrections    admins (decide requests made on the phone)
//   My attendance  everyone
//   Leave          everyone (own leave); admins and attendance-team see all
//   Settings       the Super Admin only
const TABS = [
  { value: "today", label: "Today", icon: UserCheck, Page: Today, allow: (p) => isAdmin(p) || canAccess(p, "attendance-team") },
  {
    value: "register",
    label: "Register",
    icon: Calendar,
    Page: Register,
    allow: (p) => isAdmin(p) || canAccess(p, "attendance-register") || canAccess(p, "attendance-team"),
  },
  { value: "corrections", label: "Corrections", icon: FileText, Page: Corrections, allow: (p) => isAdmin(p) },
  { value: "mine", label: "My attendance", icon: CalendarClock, Page: Mine, allow: () => true },
  { value: "leave", label: "Leave", icon: Sun, Page: Leave, allow: () => true },
  { value: "settings", label: "Settings", icon: Settings, Page: AttendanceSettings, allow: (p) => isSuperAdmin(p) },
]

export default function Attendance() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()
  const allowed = useMemo(() => (profile ? TABS.filter((t) => t.allow(profile)) : []), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]
  const pending = usePendingCorrections(allowed.some((t) => t.value === "corrections"))
  if (!current) return null
  const Page = current.Page

  return (
    <div>
      <HeaderBand>
        <PageHeader title="Attendance" subtitle="Marked in the phone app with a selfie and the office location. Viewed and managed here." />
        <Tabs
          items={allowed.map((t) => ({
            value: t.value,
            icon: t.icon,
            label: t.label,
            count: t.value === "corrections" && pending ? pending : undefined,
          }))}
          value={current.value}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
        />
      </HeaderBand>
      <Page key={current.value} />
    </div>
  )
}

/** Corrections waiting for a decision, for the tab's count. Live. */
function usePendingCorrections(enabled) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    const read = () =>
      listCorrections({ status: "pending" }).then((r) => {
        if (alive) setN(r.missing ? 0 : (r.rows || []).length)
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
  }, [enabled])
  return n
}
