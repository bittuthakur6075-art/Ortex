import { useCallback, useEffect, useMemo, useState } from "react"
import { Avatar, Banner, Card, CardHeader, PageLoader } from "../../../components/ui/Ui"
import { cn } from "../../../lib/cn"
import { todayIST } from "../../../services/attendance"
import { listLeaveRequests } from "../../../services/leave"
import { dayHead, daysOf } from "../format"
import { MonthSwitcher } from "../status"
import { dayRules, nameOf, typeTone } from "./common"
import { TypeChip } from "./leaveUi"

// Leave → Calendar (Workable's work calendar, Remote's team absences): people
// down the side, the month across, approved leave as solid blocks and pending
// leave as light ones, coloured by type. Weekly offs and holidays are shaded.
// The header says who is out today in words, or that nobody is.

/** Whole days from one ISO day to another. */
function inDays(from, to) {
  const utc = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))
  return Math.round((utc(to) - utc(from)) / 86400000)
}

export default function LeaveCalendar({ ctx }) {
  const today = todayIST()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [state, setState] = useState({ loading: true })

  const days = useMemo(() => daysOf(month), [month])
  const load = useCallback(async () => {
    const [res, todayRes] = await Promise.all([
      listLeaveRequests({ status: ["approved", "pending"], from: `${month}-01`, to: days[days.length - 1] }),
      // Anyone on leave today, whatever month is on screen.
      listLeaveRequests({ status: "approved", from: today, to: today }),
    ])
    setState({ loading: false, ...res, today: todayRes.rows || [] })
  }, [month, days, today])

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    void load()
  }, [load])

  const rules = dayRules(ctx)
  const off = new Set(rules.weeklyOff)
  const holidaySet = new Map((ctx.holidays || []).map((h) => [h.day, h]))
  const requests = useMemo(() => state.rows || [], [state.rows])

  // One row per person with leave this month, then everyone else from the directory.
  const people = useMemo(() => {
    const withLeave = [...new Set(requests.map((r) => r.user_id))]
    const rest = Object.keys(ctx.directory || {}).filter((id) => !withLeave.includes(id))
    const byName = (a, b) => nameOf(ctx, a).localeCompare(nameOf(ctx, b))
    return [...withLeave.sort(byName), ...rest.sort(byName)]
  }, [requests, ctx])

  const cellFor = (userId, day) => {
    const hits = requests.filter((r) => r.user_id === userId && r.from_day <= day && r.to_day >= day)
    return hits.find((r) => r.status === "approved") || hits[0] || null
  }

  const outToday = [...new Set((state.today || []).map((r) => r.user_id))].map((id) => nameOf(ctx, id))
  const upcoming = (ctx.holidays || []).filter((h) => h.day >= today).slice(0, 6)

  if (state.loading && !state.rows) return <PageLoader />
  if (state.missing) return <Banner tone="warning">Leave is not set up on this database yet (migration 0036).</Banner>

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="overflow-hidden">
        <CardHeader
          title={outToday.length ? `Out today: ${outToday.join(", ")}` : "No one is out today"}
          description="Approved leave is solid; waiting requests are light"
          action={<MonthSwitcher month={month} onChange={setMonth} />}
        />
        <div className="overflow-x-auto px-5 pb-5">
          <table className="border-separate border-spacing-0 text-[12px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[180px] bg-card pb-2 text-left font-medium text-muted-foreground">Person</th>
                {days.map((d) => {
                  const h = dayHead(d)
                  const shaded = off.has(h.dow) || holidaySet.has(d)
                  return (
                    <th
                      key={d}
                      title={holidaySet.get(d)?.name}
                      className={cn("w-8 min-w-8 pb-2 text-center font-medium", shaded ? "text-subtle-foreground" : "text-muted-foreground", d === today && "text-primary")}
                    >
                      <div>{h.wd}</div>
                      <div className="tabular">{h.date}</div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {people.map((id) => {
                const person = ctx.directory?.[id] || {}
                return (
                  <tr key={id}>
                    <td className="sticky left-0 z-10 border-t border-border bg-card py-1.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={person.name || "?"} src={person.avatarUrl} className="h-6 w-6" />
                        <span className="max-w-[140px] truncate text-[13px] text-foreground">{person.name || "Unknown"}</span>
                      </div>
                    </td>
                    {days.map((d) => {
                      const r = cellFor(id, d)
                      const h = dayHead(d)
                      const shaded = off.has(h.dow) || holidaySet.has(d)
                      return (
                        <td key={d} className={cn("h-9 border-t border-border p-0.5 text-center", shaded && "bg-subtle")}>
                          {r && !shaded ? (
                            <span
                              title={`${nameOf(ctx, id)} · ${r.type_code} · ${r.status === "approved" ? "approved" : "waiting"}`}
                              className={cn(
                                "grid h-7 place-items-center rounded text-[10px] font-semibold",
                                typeTone(r.type_code),
                                r.status === "pending" && "opacity-50 outline-1 outline-dashed outline-current",
                              )}
                            >
                              {r.type_code}
                            </span>
                          ) : null}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground">
            {(ctx.types || []).map((t) => (
              <span key={t.code} className="inline-flex items-center gap-1.5">
                <TypeChip code={t.code} /> {t.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-4 w-6 rounded bg-subtle" /> Weekly off or holiday
            </span>
          </div>
        </div>
      </Card>

      <Card className="self-start overflow-hidden">
        <CardHeader title="Upcoming holidays" />
        {upcoming.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-muted-foreground">None added yet. The Super Admin adds them under Settings.</p>
        ) : (
          <ul className="border-t border-border">
            {upcoming.map((h, i) => {
              const [y, m, d] = h.day.split("-").map(Number)
              const date = new Date(Date.UTC(y, m - 1, d))
              const soon = inDays(today, h.day)
              return (
                <li key={h.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-b-0">
                  {/* A small calendar leaf: month over date; the next holiday in brand. */}
                  <span
                    className={cn(
                      "squircle grid w-11 flex-none place-items-center rounded-[10px] py-1 leading-none",
                      i === 0 ? "bg-primary/10 text-primary" : "bg-subtle text-foreground",
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{date.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span>
                    <span className="mt-1 text-[17px] font-semibold tabular">{d}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground" title={h.name}>{h.name}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {date.toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" })}
                      {y !== Number(today.slice(0, 4)) ? ` ${y}` : ""}
                    </span>
                  </span>
                  <span className={cn("flex-none whitespace-nowrap text-[12px] tabular", soon <= 7 ? "font-medium text-primary" : "text-muted-foreground")}>
                    {soon === 0 ? "Today" : soon === 1 ? "Tomorrow" : `in ${soon} days`}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
