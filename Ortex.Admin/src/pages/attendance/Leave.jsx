import { Banner, PageLoader } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { isAdmin, isSuperAdmin } from "../../lib/roles"
import Balances from "./leave/Balances"
import LeaveCalendar from "./leave/LeaveCalendar"
import MyLeave from "./leave/MyLeave"
import Requests from "./leave/Requests"
import { useLeaveContext } from "./leave/common"

// Leave (migration 0036). Everyone applies for and follows their own leave
// ("mine", under My records). Admins decide requests; admins and anyone with
// "Everyone's records" (Accounts) see the calendar and every balance (under
// Team); the Super Admin adjusts balances. The policy itself is in Settings.
// The hub (Attendance.jsx) picks the view and checks who may open it.

export default function Leave({ view = "mine" }) {
  const profile = useProfile()
  const ctx = useLeaveContext()

  if (ctx.loading) return <PageLoader />
  if (ctx.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  return (
    <div className="space-y-5">
      {ctx.error && <Banner tone="danger">{ctx.error}</Banner>}
      {view === "mine" && <MyLeave ctx={ctx} />}
      {view === "requests" && <Requests ctx={ctx} canDecide={isAdmin(profile)} />}
      {view === "calendar" && <LeaveCalendar ctx={ctx} />}
      {view === "balances" && <Balances ctx={ctx} canAdjust={isSuperAdmin(profile)} />}
    </div>
  )
}
