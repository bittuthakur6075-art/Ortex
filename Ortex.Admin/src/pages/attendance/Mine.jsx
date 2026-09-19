import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, CalendarClock, Clock, AlertTriangle, Smartphone } from "../../components/ui/Icons"
import { Banner, Button, Card, CardHeader, EmptyState, PageLoader, StatCard } from "../../components/ui/Ui"
import { useProfile } from "../../hooks/useProfile"
import { currentUserId } from "../../lib/auth"
import { repo } from "../../data/store/repository"
import { clockIST, durationWords, summarizeDays } from "../../lib/attendance"
import { listPunches, todayIST } from "../../services/attendance"
import { DayDrawer, FlagBadges } from "./parts"
import { dayLabel } from "./format"

// Attendance → My attendance: the signed-in person's own record, a month at a
// time. Everyone has this tab. Marking attendance happens only on the phone,
// so there is nothing to press here but the days themselves.

const monthStart = (ym) => `${ym}-01`
const monthEnd = (ym) => {
  const [y, m] = ym.split("-").map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${ym}-${String(last).padStart(2, "0")}`
}
const shiftMonth = (ym, by) => {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00+05:30`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })

export default function Mine() {
  const profile = useProfile()
  const selfId = currentUserId()
  const thisMonth = todayIST().slice(0, 7)
  const [month, setMonth] = useState(thisMonth)
  const [state, setState] = useState({ loading: true })
  const [openDay, setOpenDay] = useState(null)

  const load = useCallback(async () => {
    if (!selfId) return
    const res = await listPunches({ from: monthStart(month), to: monthEnd(month), userId: selfId })
    setState({ loading: false, ...res })
  }, [month, selfId])

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

  const days = useMemo(() => summarizeDays(state.rows || []), [state.rows])
  const totals = useMemo(
    () => ({
      present: days.filter((d) => d.firstIn).length,
      minutes: days.reduce((s, d) => s + d.workedMin, 0),
      flagged: days.reduce((s, d) => s + d.flagged, 0),
    }),
    [days],
  )

  if (state.loading && !state.rows) return <PageLoader />
  if (state.missing) {
    return <Banner tone="warning">Attendance is not set up on this database yet (migration 0033).</Banner>
  }

  const open = days.find((d) => d.day === openDay)

  return (
    <div className="space-y-5">
      {state.error && <Banner tone="danger">{state.error}</Banner>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" icon aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-center text-base font-semibold text-foreground">{monthLabel(month)}</span>
          <Button
            size="sm"
            variant="outline"
            icon
            aria-label="Next month"
            disabled={month >= thisMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Smartphone className="h-4 w-4" /> Clock in and out from the Ortex phone app
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={CalendarClock} label="Days present" value={totals.present} />
        <StatCard icon={Clock} label="Hours worked" value={durationWords(totals.minutes)} accent="bg-success/12 text-success-text" />
        <StatCard icon={AlertTriangle} label="Flagged punches" value={totals.flagged} accent="bg-warning/12 text-warning-text" />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title={`${profile?.name || "My"} attendance`} description="Times in IST, from the server's clock" />
        {days.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No attendance yet"
            description="No attendance yet. Clock in from the Ortex phone app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="mt-head">
                <tr className="text-left">
                  <th>Date</th>
                  <th>First in</th>
                  <th>Last out</th>
                  <th>Worked</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody className="mt-body">
                {days.map((d) => (
                  <tr key={d.day} className="cursor-pointer" onClick={() => setOpenDay(d.day)}>
                    <td className="font-medium text-foreground">{dayLabel(d.day, true)}</td>
                    <td className="tabular">{d.firstIn ? clockIST(d.firstIn) : "-"}</td>
                    <td className="tabular">{d.open ? "On duty" : d.lastOut ? clockIST(d.lastOut) : "-"}</td>
                    <td className="tabular">{durationWords(d.workedMin)}</td>
                    <td>
                      <FlagBadges flags={[...new Set(d.punches.flatMap((p) => p.flags || []))]} field={d.field} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DayDrawer
        open={Boolean(open)}
        onClose={() => setOpenDay(null)}
        person={{ name: profile?.name || profile?.email, avatarUrl: profile?.avatar_url }}
        summary={open}
        selfId={selfId}
        canReview={false}
      />
    </div>
  )
}
