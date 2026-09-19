import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock } from "../components/ui/Icons"
import PageHeader, { ActionBar } from "../components/layout/PageHeader"
import SectionCard from "../components/ui/SectionCard"
import { Banner, Card, CardHeader, ExportButton, PageLoader, Segmented, SortTh } from "../components/ui/Ui"
import { CHART_COLORS, ColumnChart, DonutChart } from "../components/ui/Chart"
import { useSorting } from "../hooks/useCollection"
import { repo } from "../data/store/repository"
import { listDays, todayIST } from "../services/attendance"
import { listLeaveRequests } from "../services/leave"
import { RANGES } from "../lib/analytics/today"
import { changeWords, computeAttendanceInsights, windowFor } from "../lib/analytics/attendance"
import { exportCsv } from "../lib/csv"
import { cn } from "../lib/cn"

// Insights → Attendance: how the team turns up, over a rolling 7 / 30 / 90
// days compared with the window before it. Everyone's day rows are readable
// with the attendance-team grant (admins, Accounts by default), which is also
// what gates this tab. The arithmetic is lib/analytics/attendance.js.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const short = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}
const withDay = (iso) => `${DOW[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${short(iso)}`
const fmtRate = (v) => (v == null ? "No days" : `${v}%`)
const fmtHours = (v) => (v == null ? "No hours" : `${v}h`)

export default function AttendanceInsights({ embedded = false }) {
  const Header = embedded ? ActionBar : PageHeader
  const [range, setRange] = useState("30d")
  const [state, setState] = useState({ loading: true })
  const today = todayIST()
  const noun = RANGES.find((r) => r.value === range)?.noun || "the previous period"

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }))
    // Always the longest window and the one before it, so switching the range
    // is instant: 90 days back from the start of the current 90.
    const w = windowFor("90d", today)
    const [days, leave, directory] = await Promise.all([
      listDays({ from: w.prevFrom, to: w.to }),
      listLeaveRequests({ status: "approved", from: w.from }),
      repo.staffDirectory ? repo.staffDirectory().catch(() => ({})) : {},
    ])
    setState({
      loading: false,
      missing: days.missing,
      error: days.error || null,
      days: days.rows || [],
      requests: leave.missing ? [] : leave.rows || [],
      names: directory || {},
    })
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  const r = useMemo(
    () =>
      state.loading || state.missing
        ? null
        : computeAttendanceInsights({ days: state.days, requests: state.requests, names: state.names, range, today }),
    [state, range, today],
  )

  if (state.loading) return <PageLoader />

  return (
    <div>
      <Header title="Attendance" subtitle={r ? `${short(r.window.from)} to ${short(r.window.to)}, compared with ${noun}` : "How the team turns up"}>
        <Segmented items={RANGES} value={range} onChange={setRange} size="md" />
      </Header>

      {state.missing && (
        <Banner tone="warning">Attendance is not set up on this database yet (migrations 0033 and 0034).</Banner>
      )}
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      {r && (
        <>
          <Tiles r={r} noun={noun} />
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <DailyTrend r={r} className="lg:col-span-2" />
            <LatesByWeekday r={r} />
          </div>
          <div className="mt-5">
            <People r={r} range={range} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <LeaveUsage r={r} />
            <Upcoming r={r} names={state.names} />
            <Attention r={r} />
          </div>
        </>
      )}
    </div>
  )
}

// ---- tiles --------------------------------------------------------------------------------

function Tiles({ r, noun }) {
  const { now, before } = r
  const tiles = [
    {
      label: "Attendance rate",
      value: fmtRate(now.rate),
      change: changeWords(now.rate, before.rate, { unit: "points", noun, digits: 1 }),
      hint: `${now.working} working person-days`,
    },
    {
      label: "Average hours",
      value: fmtHours(now.avgHours),
      change: changeWords(now.avgHours, before.avgHours, { unit: "hours", noun, digits: 1 }),
      hint: "Per worked day",
    },
    {
      label: "Late marks",
      value: String(now.lates),
      change: changeWords(now.lates, before.lates, { unit: now.lates === 1 ? "late mark" : "late marks", noun, better: "down" }),
      hint: now.latePct == null ? "No days in" : `${now.latePct}% of days in`,
    },
    {
      label: "Missed clock-outs",
      value: String(now.missed),
      change: changeWords(now.missed, before.missed, { noun, better: "down" }),
      hint: "Counted as half until corrected",
    },
    {
      label: "Days on leave",
      value: String(now.leave),
      change: changeWords(now.leave, before.leave, { unit: "days", noun, better: "flat", digits: 1 }),
      hint: "Approved leave, half days included",
    },
  ]
  return (
    <SectionCard title="This period" description="Rate = present + field + half of each half day, over the days people were due to work">
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((k) => (
          <div key={k.label} className="rounded-xl bg-subtle px-3.5 py-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="mt-1.5 text-lg font-semibold leading-none tracking-tight text-foreground tabular">{k.value}</div>
            <div
              className={cn(
                "mt-1.5 text-[12px] leading-snug",
                k.change.tone === "good" ? "text-success-text" : k.change.tone === "bad" ? "text-destructive-text" : "text-muted-foreground",
              )}
            >
              {k.change.text}
            </div>
            <div className="mt-0.5 text-[11px] text-subtle-foreground">{k.hint}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ---- charts -------------------------------------------------------------------------------

function DailyTrend({ r, className }) {
  const pts = r.trend
  return (
    <SectionCard className={className} title="Day by day" description="People present, absent and on leave each day" bodyClassName="px-3 pb-3 pt-2">
      <ColumnChart
        height={272}
        stacked
        categories={pts.map((p) => short(p.day))}
        series={[
          { name: "Present", data: pts.map((p) => p.present) },
          { name: "Absent", data: pts.map((p) => p.absent) },
          { name: "On leave", data: pts.map((p) => p.leave) },
        ]}
        colors={[CHART_COLORS.emerald, CHART_COLORS.rose, CHART_COLORS.violet]}
        valueFormatter={(v) => `${v} ${v === 1 ? "person" : "people"}`}
      />
    </SectionCard>
  )
}

function LatesByWeekday({ r }) {
  const total = r.latesByWeekday.reduce((s, x) => s + x.count, 0)
  return (
    <SectionCard title="Lates by weekday" description={total ? `${total} late marks, Monday to Saturday` : "No late marks in this period"} bodyClassName="px-3 pb-3 pt-2">
      <ColumnChart
        height={272}
        categories={r.latesByWeekday.map((x) => x.label)}
        series={[{ name: "Late marks", data: r.latesByWeekday.map((x) => x.count) }]}
        colors={[CHART_COLORS.amber]}
        valueFormatter={(v) => `${v} late`}
      />
    </SectionCard>
  )
}

function LeaveUsage({ r }) {
  const rows = r.leaveByType
  return (
    <SectionCard title="Leave taken" description="By type, days inside this period">
      {rows.length ? (
        <DonutChart
          height={240}
          labels={rows.map((x) => x.code)}
          series={rows.map((x) => x.days)}
          colors={[CHART_COLORS.violet, CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.emerald, CHART_COLORS.rose, CHART_COLORS.slate]}
          valueFormatter={(v) => `${v} ${v === 1 ? "day" : "days"}`}
          totalLabel="Days"
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">No leave taken in this period.</p>
      )}
    </SectionCard>
  )
}

function Upcoming({ r, names }) {
  return (
    <SectionCard title="Coming up" description="Approved leave running now or starting in the next 14 days">
      {r.upcoming.length ? (
        <ul className="flex flex-col gap-3">
          {r.upcoming.map((q) => (
            <li key={q.id} className="flex items-start justify-between gap-3 text-[13px]">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{names[q.user_id]?.name || "Former colleague"}</span>
                <span className="text-muted-foreground">
                  {q.from_day === q.to_day ? withDay(q.from_day) : `${withDay(q.from_day)} to ${withDay(q.to_day)}`}
                </span>
              </span>
              <span className="flex-none rounded-btn bg-subtle px-2 py-0.5 text-[12px] font-medium text-foreground tabular">
                {q.type_code} · {q.days}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">No one is due to be off in the next 14 days.</p>
      )}
    </SectionCard>
  )
}

function Attention({ r }) {
  return (
    <SectionCard title="Worth a word" description="3 or more late marks, or 2 or more absences">
      {r.attention.length ? (
        <ul className="flex flex-col gap-2.5 text-[13px] text-foreground">
          {r.attention.map((a) => (
            <li key={a.userId} className="flex gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 flex-none text-warning" />
              <span>{a.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">Nobody stands out in this period.</p>
      )}
    </SectionCard>
  )
}

// ---- by person ------------------------------------------------------------------------------

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "rate", label: "Attendance", align: "right" },
  { key: "present", label: "Present", align: "right" },
  { key: "lates", label: "Late", align: "right" },
  { key: "absent", label: "Absent", align: "right" },
  { key: "missed", label: "Missed out", align: "right" },
  { key: "leave", label: "Leave", align: "right" },
  { key: "avgHours", label: "Avg hours", align: "right" },
]

function People({ r, range }) {
  const [sort, onSort] = useSorting("name")
  const rows = useMemo(() => {
    const { key, desc } = sort
    const sorted = [...r.people].sort((a, b) => {
      const x = a[key] ?? -1
      const y = b[key] ?? -1
      return typeof x === "string" ? x.localeCompare(y) : x - y
    })
    return desc ? sorted.reverse() : sorted
  }, [r.people, sort])

  const exportPeople = () =>
    exportCsv(
      `attendance-${range}-${r.window.to}.csv`,
      [
        { header: "Name", value: (p) => p.name },
        { header: "Attendance %", value: (p) => (p.rate == null ? "" : p.rate) },
        { header: "Days present", value: (p) => p.present },
        { header: "Late marks", value: (p) => p.lates },
        { header: "Absent", value: (p) => p.absent },
        { header: "Missed clock-outs", value: (p) => p.missed },
        { header: "Leave days", value: (p) => p.leave },
        { header: "Average hours", value: (p) => (p.avgHours == null ? "" : p.avgHours) },
      ],
      rows,
    )

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="By person"
        description={`${r.people.length} ${r.people.length === 1 ? "person" : "people"} with attendance in this period`}
        action={<ExportButton onClick={exportPeople} disabled={!rows.length} />}
      />
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="mt-head">
              <tr>
                {COLUMNS.map((c) => (
                  <SortTh key={c.key} sortKey={c.key} sort={sort} onSort={onSort} align={c.align}>
                    {c.label}
                  </SortTh>
                ))}
              </tr>
            </thead>
            <tbody className="mt-body">
              {rows.map((p) => (
                <tr key={p.userId}>
                  <td className="font-medium text-foreground">{p.name}</td>
                  <td className="text-right">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
                        <span
                          className={cn("block h-full rounded-full", (p.rate ?? 0) >= 90 ? "bg-success" : (p.rate ?? 0) >= 75 ? "bg-warning" : "bg-destructive")}
                          style={{ width: `${Math.min(100, p.rate ?? 0)}%` }}
                        />
                      </span>
                      <span className="w-12 text-foreground tabular">{fmtRate(p.rate)}</span>
                    </span>
                  </td>
                  <td className="text-right tabular">{p.present}</td>
                  <td className={cn("text-right tabular", p.lates >= 3 && "font-semibold text-warning-text")}>{p.lates}</td>
                  <td className={cn("text-right tabular", p.absent >= 2 && "font-semibold text-destructive-text")}>{p.absent}</td>
                  <td className="text-right tabular">{p.missed}</td>
                  <td className="text-right tabular">{p.leave}</td>
                  <td className="text-right tabular">{fmtHours(p.avgHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 pb-5 text-[13px] text-muted-foreground">No attendance recorded in this period.</p>
      )}
    </Card>
  )
}
