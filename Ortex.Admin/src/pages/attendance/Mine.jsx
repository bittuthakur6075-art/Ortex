import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Smartphone } from "../../components/ui/Icons"
import { Banner, Card, CardHeader, EmptyState, PageLoader, StatCard } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { currentUserId } from "../../lib/auth"
import { repo } from "../../data/store/repository"
import {
  clockIST,
  durationWords,
  effectiveStatus,
  monthGrid,
  monthTotals,
  STATUS_LABEL,
  summarizeDays,
} from "../../lib/attendance"
import { getSettings, listDays, listPunches, todayIST } from "../../services/attendance"
import { cn } from "../../lib/cn"
import { FlagBadges } from "./parts"
import { dayLabel, daysOf, toneFor } from "./format"
import { MonthSwitcher, StatusLegend } from "./status"
import StatusDayDrawer from "./StatusDayDrawer"
import TodayCard from "./TodayCard"

// Attendance → My attendance: the signed-in person's own record. Today, live;
// then the month as a calendar of what each day counted as, the totals payroll
// will read, and the days with their times. Everyone has this tab. Marking
// attendance happens only on the phone, so there is nothing to press here but
// the days themselves.

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function Mine() {
  const profile = useProfile()
  const selfId = currentUserId()
  const today = todayIST()
  const thisMonth = today.slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [state, setState] = useState({ loading: true })
  const [openDay, setOpenDay] = useState(null)

  const load = useCallback(async () => {
    if (!selfId) return
    const days = daysOf(month)
    const [punches, dayRows, todays, settings] = await Promise.all([
      listPunches({ from: days[0], to: days[days.length - 1], userId: selfId }),
      listDays({ from: days[0], to: days[days.length - 1], userId: selfId }),
      listPunches({ from: today, to: today, userId: selfId }),
      getSettings(),
    ])
    setState({
      loading: false,
      missing: punches.missing,
      // 0034 not pushed yet: the calendar and totals are hidden, the rest works.
      daysMissing: dayRows.missing,
      error: punches.error || dayRows.error,
      rows: punches.rows,
      days: dayRows.rows,
      todays: todays.rows,
      settings: settings.doc || {},
    })
  }, [month, selfId, today])

  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    void load()
  }, [load])

  useEffect(() => {
    if (!repo.subscribe) return undefined
    let t = null
    const off = repo.subscribe(() => {
      clearTimeout(t)
      t = setTimeout(() => void load(), 400)
    })
    return () => {
      clearTimeout(t)
      off?.()
    }
  }, [load])

  const summaries = useMemo(() => summarizeDays(state.rows || []), [state.rows])
  const totals = useMemo(() => monthTotals(state.days || [], state.settings?.lateRule || {}), [state.days, state.settings])
  const weeks = useMemo(() => {
    const [y, m] = month.split("-").map(Number)
    return monthGrid(y, m, state.days || [])
  }, [month, state.days])
  const byDay = useMemo(() => new Map((state.days || []).map((d) => [d.day, d])), [state.days])

  if (state.loading && !state.rows) return <PageLoader />
  if (state.missing) {
    return <Banner tone="warning">Attendance is not set up on this database yet (migration 0033).</Banner>
  }

  const present = totals.counts.P + totals.counts.OD
  const absences = totals.counts.A + totals.counts.MP

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <TodayCard day={today} punches={state.todays || []} settings={state.settings} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthSwitcher month={month} onChange={setMonth} max={thisMonth} />
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Smartphone className="h-4 w-4" /> Clock in and out from the Ortex phone app
        </span>
      </div>

      {!state.daysMissing && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={CheckCircle2} label="Payable days" value={totals.payable} accent="bg-success/12 text-success-text" />
          <StatCard icon={CalendarClock} label="Days present" value={present} />
          <StatCard icon={Clock} label="Hours worked" value={durationWords(totals.workedMin)} />
          <StatCard
            icon={AlertTriangle}
            label={totals.lates ? `Absent or missed · ${totals.lates} late` : "Absent or missed"}
            value={absences}
            accent="bg-warning/12 text-warning-text"
          />
        </div>
      )}

      {!state.daysMissing && (
        <Card className="overflow-hidden">
          <CardHeader
            title="Calendar"
            description={totals.latePenalty ? `Late penalty this month: ${totals.latePenalty} day` : "What each day counts as for payroll"}
          />
          <div className="px-5 pb-5">
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {WEEK.map((w) => (
                <div key={w} className="pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{w}</div>
              ))}
              {weeks.flat().map((c) => {
                const s = c.entry ? effectiveStatus(c.entry) : null
                const isToday = c.day === today
                return (
                  <button
                    key={c.day}
                    type="button"
                    disabled={!c.inMonth}
                    onClick={() => setOpenDay(c.day)}
                    title={c.inMonth ? `${dayLabel(c.day, true)}: ${s ? STATUS_LABEL[s] : "no record"}` : undefined}
                    className={cn(
                      "relative flex aspect-square max-h-20 flex-col items-center justify-center gap-0.5 rounded-lg text-[13px] transition-opacity",
                      !c.inMonth && "invisible",
                      s ? toneFor(s) : "bg-subtle text-muted-foreground",
                      isToday && "ring-2 ring-primary",
                      c.inMonth && "hover:opacity-80",
                    )}
                  >
                    <span className="font-semibold tabular">{c.date}</span>
                    {s && <span className="text-[10px] font-semibold">{s}</span>}
                    {c.entry?.late && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-warning" />}
                  </button>
                )
              })}
            </div>
            <StatusLegend className="mt-4" />
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardHeader title={`${profile?.name || "My"} attendance`} description="Times in IST, from the server's clock" />
        {summaries.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No attendance yet" description="No attendance yet. Clock in from the Ortex phone app." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Date</th>
                  <th>Counts as</th>
                  <th>First in</th>
                  <th>Last out</th>
                  <th>Worked</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {summaries.map((d) => {
                  const e = byDay.get(d.day)
                  const s = e ? effectiveStatus(e) : null
                  return (
                    <tr key={d.day} className="cursor-pointer" onClick={() => setOpenDay(d.day)}>
                      <td className="font-medium text-foreground">{dayLabel(d.day, true)}</td>
                      <td>
                        {s ? (
                          <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-[11px] font-semibold", toneFor(s))}>
                            {STATUS_LABEL[s]}
                          </span>
                        ) : (
                          <span className="text-subtle-foreground">-</span>
                        )}
                      </td>
                      <td className="tabular">{d.firstIn ? clockIST(d.firstIn) : "-"}</td>
                      <td className="tabular">{d.open ? "On duty" : d.lastOut ? clockIST(d.lastOut) : "-"}</td>
                      <td className="tabular">{durationWords(d.workedMin)}</td>
                      <td>
                        <FlagBadges flags={[...new Set(d.punches.flatMap((p) => p.flags || []))]} field={d.field} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <StatusDayDrawer
        open={Boolean(openDay)}
        onClose={() => setOpenDay(null)}
        person={{ name: profile?.name || profile?.email, avatarUrl: profile?.avatar_url }}
        userId={selfId}
        day={openDay}
        entry={openDay ? byDay.get(openDay) || null : null}
        selfId={selfId}
        canOverride={false}
        locked={false}
      />
    </div>
  )
}
