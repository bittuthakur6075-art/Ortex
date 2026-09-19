import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { Banner, PageLoader, PillTabs } from "../../components/ui/Ui"
import { canAccess } from "../../data/domain/modules"
import { useProfile } from "../../hooks/useProfile"
import { isAdmin, isSuperAdmin } from "../../lib/roles"
import Balances from "./leave/Balances"
import LeaveCalendar from "./leave/LeaveCalendar"
import MyLeave from "./leave/MyLeave"
import Requests from "./leave/Requests"
import { useLeaveContext } from "./leave/common"

// Attendance → Leave (migration 0036). Everyone applies for and follows their
// own leave here, as on the phone. Admins decide requests; admins and anyone
// with "Everyone's records" (Accounts) see the calendar and every balance; the
// Super Admin adjusts balances. The policy itself is in Settings.
//
// The sub-view rides on `?view=`, next to the hub's own `?tab=leave`.

export default function Leave() {
  const profile = useProfile()
  const ctx = useLeaveContext()
  const [params, setParams] = useSearchParams()
  const team = isAdmin(profile) || canAccess(profile, "attendance-team")

  const views = useMemo(
    () => [
      { value: "mine", label: "My leave" },
      ...(team
        ? [
            { value: "requests", label: "Requests" },
            { value: "calendar", label: "Calendar" },
            { value: "balances", label: "Balances" },
          ]
        : []),
    ],
    [team],
  )
  const view = views.find((v) => v.value === params.get("view"))?.value || "mine"

  if (ctx.loading) return <PageLoader />
  if (ctx.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  return (
    <div className="space-y-5">
      {ctx.error && <Banner tone="danger">{ctx.error}</Banner>}
      {views.length > 1 && (
        <PillTabs
          items={views}
          value={view}
          onChange={(v) => {
            const next = new URLSearchParams(params)
            next.set("tab", "leave")
            next.set("view", v)
            setParams(next, { replace: true })
          }}
        />
      )}
      {view === "mine" && <MyLeave ctx={ctx} />}
      {view === "requests" && <Requests ctx={ctx} canDecide={isAdmin(profile)} />}
      {view === "calendar" && <LeaveCalendar ctx={ctx} />}
      {view === "balances" && <Balances ctx={ctx} canAdjust={isSuperAdmin(profile)} />}
    </div>
  )
}
