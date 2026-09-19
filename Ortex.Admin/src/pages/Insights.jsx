import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { TrendingUp, Flame, ReceiptIndianRupee, CalendarClock } from "../components/ui/Icons"
import { useProfile } from "../hooks/useProfile"
import { canAccess } from "../data/domain/modules"
import PageHeader, { HeaderBand } from "../components/layout/PageHeader"
import { Tabs } from "../components/ui/Ui"
import Growth from "./Growth"
import Automation from "./Automation"
import SalesInsights from "./SalesInsights"
import AttendanceInsights from "./AttendanceInsights"

// One Growth workspace. Growth is the period-scoped funnel/attribution view,
// Sales is the analysis that used to crowd the Dashboard, and Web events is the
// raw stream the marketing site's tracker writes (activities, event logs,
// WhatsApp queue, rules, templates). Access is still
// granted per tab through the original module keys, so a user's permissions
// carry over without migration.
const TABS = [
  { value: "growth", moduleKey: "growth", label: "Funnel", icon: TrendingUp, Page: Growth },
  // Sales rides on the growth key: both are admin-only analysis, so no new
  // module (and no permission migration) was needed when it left the Dashboard.
  { value: "sales", moduleKey: "growth", label: "Sales", icon: ReceiptIndianRupee, Page: SalesInsights },
  { value: "events", moduleKey: "automation", label: "Web events", icon: Flame, Page: Automation },
  // Everyone's attendance, so the same grant as reading it: admins, and
  // Accounts by default (role_permissions, migration 0032).
  { value: "attendance", moduleKey: "attendance-team", label: "Attendance", icon: CalendarClock, Page: AttendanceInsights },
]

export const INSIGHTS_MODULE_KEYS = [...new Set(TABS.map((t) => t.moduleKey))]

export default function Insights() {
  const profile = useProfile()
  const [params, setParams] = useSearchParams()

  const allowed = useMemo(() => TABS.filter((t) => canAccess(profile, t.moduleKey)), [profile])
  const current = allowed.find((t) => t.value === params.get("tab")) || allowed[0]

  if (!current) return null

  const items = allowed.map((t) => ({ value: t.value, icon: t.icon, label: t.label }))
  const Page = current.Page

  return (
    <div>
      <HeaderBand>
        <PageHeader title="Insights" subtitle="Visitor-to-cash funnel, sales, the website event stream and attendance" />
        <Tabs
          items={items}
          value={current.value}
          onChange={(v) => setParams({ tab: v }, { replace: true })}
        />
      </HeaderBand>
      <Page key={current.value} embedded />
    </div>
  )
}
