import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import {
  dayKey,
  durationWords,
  effectiveStatus,
  monthBounds,
  monthGrid,
  monthTotals,
  STATUS_LABEL,
  type AttendanceDay,
  type DayStatus,
} from "@/domain/attendance"
import { SummaryTiles, type SummaryTileData } from "@/features/attendance/attendanceUi"
import { DayRowsSkeleton, TilesSkeleton } from "@/features/attendance/AttendanceSkeletons"
import DayListRow from "@/features/attendance/DayListRow"
import { daysFromPunches } from "@/features/attendance/days"
import { dayLabel, hoursShort, statusColors, statusHue } from "@/features/attendance/format"
import { monthEntries } from "@/features/attendance/month"
import { addDays } from "@/features/leave/leaveFormat"
import {
  holidays as loadHolidays,
  loadSettings,
  myDays,
  myPunches,
  NOT_SET_UP,
  type AttendanceSettings,
  type Holiday,
} from "@/lib/attendance"
import { feedback } from "@/lib/feedback"
import { myRequests } from "@/lib/leave"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { EmptyState, IconButton, Panel, RowSeparator, SegmentedControl } from "@/ui"

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"]

/** Zoho People's legend: the six things a day can be, in its colours. */
const LEGEND: { status: DayStatus; label: string }[] = [
  { status: "P", label: "Present" },
  { status: "A", label: "Absent" },
  { status: "WO", label: "Weekend" },
  { status: "H", label: "Holiday" },
  { status: "L", label: "Leave" },
  { status: "MP", label: "Late / missed" },
]

type ViewMode = "list" | "calendar"

/**
 * A month of attendance, Zoho People's lower half of the attendance screen: the
 * month switcher, the month's counts (payable days, present, absent, leave,
 * holidays, late marks, hours), a List / Calendar switch and the colour legend.
 * The list is one Zoho row per day (DayListRow); the calendar is the month grid
 * with each date on its status colour and today ringed. A day opens its detail.
 * Loads its own month; `refreshKey` changing reloads it (pull to refresh).
 */
export default function MonthAttendance({
  onOpen,
  refreshKey = 0,
  now,
  onLoaded,
}: {
  onOpen: (day: string) => void
  refreshKey?: number
  now: number
  /** Called when a load finishes, so a pull-to-refresh spinner can stop. */
  onLoaded?: () => void
}) {
  const t = useTheme()
  const [today] = React.useState(() => dayKey(Date.now()))
  const [ym, setYm] = React.useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [days, setDays] = React.useState<AttendanceDay[] | null>(null)
  const [hols, setHols] = React.useState<Holiday[]>([])
  const [settings, setSettings] = React.useState<AttendanceSettings>({})
  const [notice, setNotice] = React.useState<string | null>(null)
  const [view, setView] = React.useState<ViewMode>("list")
  // Approved leave still to come: dashed "L" cells in the calendar.
  const [futureLeave, setFutureLeave] = React.useState<Set<string>>(new Set())

  const bounds = monthBounds(ym.y, ym.m)
  const isCurrent = today.slice(0, 7) === bounds.from.slice(0, 7)

  const load = React.useCallback(async () => {
    const b = monthBounds(ym.y, ym.m)
    const [s, h] = await Promise.all([
      loadSettings().catch(() => ({}) as AttendanceSettings),
      loadHolidays({ from: b.from, to: b.to }).catch(() => [] as Holiday[]),
    ])
    setSettings(s)
    setHols(h)
    void myRequests()
      .then((reqs) => {
        const nowKey = dayKey(Date.now())
        const set = new Set<string>()
        for (const r of reqs) {
          if (r.status !== "approved" || r.to_day <= nowKey) continue
          for (let d = r.from_day > nowKey ? r.from_day : addDays(nowKey, 1); d <= r.to_day; d = addDays(d, 1)) set.add(d)
        }
        setFutureLeave(set)
      })
      .catch(() => setFutureLeave(new Set()))
    try {
      setDays(await myDays({ from: b.from, to: b.to }))
      setNotice(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load your attendance."
      if (msg === NOT_SET_UP) {
        const p = await myPunches({ from: b.from, to: b.to }).catch(() => [])
        setDays(daysFromPunches(p, dayKey(Date.now())))
        setNotice("Absences, late marks and payable days appear once attendance rules are set up on the server.")
      } else {
        setNotice(msg)
        setDays((d) => d ?? [])
      }
    }
  }, [ym])

  React.useEffect(() => {
    setDays(null)
    void load()
  }, [load])

  // Pull to refresh on the page around it: reload this month, once per pull.
  const loadRef = React.useRef(load)
  loadRef.current = load
  const onLoadedRef = React.useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const firstLoad = React.useRef(true)
  React.useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false
      return
    }
    void loadRef.current().finally(() => onLoadedRef.current?.())
  }, [refreshKey])

  const entries = React.useMemo(() => monthEntries(monthBounds(ym.y, ym.m), days || [], hols, today), [ym, days, hols, today])
  const weeks = React.useMemo(() => monthGrid(ym.y, ym.m, days || []), [ym, days])
  const totals = React.useMemo(() => monthTotals(days || [], settings.lateRule), [days, settings.lateRule])
  const holidayByDay = React.useMemo(() => new Map(hols.map((h) => [h.day, h.name])), [hols])

  const shiftMonth = (delta: number) => {
    feedback.select()
    setYm(({ y, m }) => {
      const n = m + delta
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }
    })
  }

  const open = (day: string) => {
    feedback.tap()
    onOpen(day)
  }

  // Zoho's month counts. The rarer statuses appear only when they happened.
  const c = totals.counts
  const tiles: SummaryTileData[] = [
    { label: "Payable days", value: `${totals.payable}`, emphasis: true },
    { label: "Present", value: `${c.P + c.OD}`, status: "P" },
    { label: "Absent", value: `${c.A}`, status: "A" },
    { label: "Leave", value: `${c.L}`, status: "L" },
    { label: "Holidays", value: `${c.H || hols.filter((h) => h.day <= today).length}`, status: "H" },
    {
      label: "Late marks",
      value: `${totals.lates}`,
      status: "MP",
      note: totals.latePenalty ? `Less ${totals.latePenalty} day` : undefined,
    },
    ...(c.HD ? [{ label: "Half days", value: `${c.HD}`, status: "HD" as DayStatus }] : []),
    ...(c.MP ? [{ label: "Missed punch", value: `${c.MP}`, status: "MP" as DayStatus }] : []),
    ...(c.LOP ? [{ label: "Loss of pay", value: `${c.LOP}`, status: "LOP" as DayStatus }] : []),
    { label: "Total hours", value: hoursShort(totals.workedMin) },
  ]

  return (
    <>
      <Panel>
        <View style={styles.switcher}>
          <IconButton name="back" onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month" />
          <View style={styles.monthWords}>
            <Text style={[textVariants.cardTitle, { color: t.text }]}>{bounds.label}</Text>
            {totals.workedMin ? (
              <Text style={[textVariants.caption, { color: t.textTertiary }]}>{`${durationWords(totals.workedMin)} worked`}</Text>
            ) : null}
          </View>
          <IconButton name="forward" onPress={() => shiftMonth(1)} disabled={isCurrent} accessibilityLabel="Next month" />
        </View>
        <View style={styles.segment}>
          <SegmentedControl<ViewMode>
            options={[
              { key: "list", label: "List" },
              { key: "calendar", label: "Calendar" },
            ]}
            value={view}
            onChange={(v) => {
              feedback.select()
              setView(v)
            }}
          />
        </View>
        <View style={styles.legend}>
          {LEGEND.map((l) => {
            const tint = statusColors(t, l.status)
            return (
              <View key={l.label} style={[styles.legendChip, { backgroundColor: tint.bg }]}>
                <View style={[styles.legendDot, { backgroundColor: statusHue(t, l.status) }]} />
                <Text style={[styles.legendText, { color: tint.fg }]}>{l.label}</Text>
              </View>
            )
          })}
        </View>
      </Panel>

      {days === null ? (
        <>
          <DayRowsSkeleton />
          <TilesSkeleton />
        </>
      ) : (
        <>
          {view === "calendar" ? (
            <Panel>
              <View style={styles.calendar}>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map((w, i) => (
                    <Text key={i} style={[styles.dow, { color: i >= 5 ? t.textFaint : t.textTertiary }]}>
                      {w}
                    </Text>
                  ))}
                </View>
                {weeks.map((week, i) => (
                  <View key={i} style={styles.weekRow}>
                    {week.map((cell) => {
                      const future = cell.day > today
                      const rowStatus = cell.entry ? effectiveStatus(cell.entry) : null
                      // No row yet: a Sunday or a listed holiday still reads as what it is.
                      const status: DayStatus | null =
                        rowStatus ??
                        (cell.inMonth && holidayByDay.has(cell.day)
                          ? "H"
                          : cell.inMonth && !future && new Date(`${cell.day}T00:00:00Z`).getUTCDay() === 0
                            ? "WO"
                            : null)
                      const tint = status ? statusColors(t, status) : null
                      const planned = !status && cell.inMonth && futureLeave.has(cell.day)
                      const leaveTint = statusColors(t, "L")
                      const isToday = cell.day === today
                      return (
                        <Pressable
                          key={cell.day}
                          disabled={!cell.inMonth || future}
                          onPress={() => open(cell.day)}
                          accessibilityRole="button"
                          accessibilityLabel={`${dayLabel(cell.day)}${status ? `, ${STATUS_LABEL[status]}` : planned ? ", Leave planned" : ""}`}
                          style={styles.cell}
                        >
                          <View
                            style={[
                              styles.dateWell,
                              tint && { backgroundColor: tint.bg },
                              isToday && { borderWidth: 2, borderColor: t.primary },
                              planned && { borderWidth: 1.5, borderStyle: "dashed", borderColor: leaveTint.fg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.date,
                                { color: !cell.inMonth ? t.textHint : tint ? tint.fg : future ? t.textFaint : t.textSecondary },
                              ]}
                            >
                              {cell.date}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor: status ? statusHue(t, status) : planned ? statusHue(t, "L") : "transparent",
                                opacity: planned ? 0.5 : 1,
                              },
                            ]}
                          />
                        </Pressable>
                      )
                    })}
                  </View>
                ))}
              </View>
            </Panel>
          ) : (
            <Panel title="Days" meta={entries.length ? `${entries.length}` : undefined}>
              {entries.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="Nothing this month yet"
                  hint="Check in and your days appear here, each with its hours."
                />
              ) : (
                <View style={{ paddingBottom: spacing.sm }}>
                  {entries.map((e, i) => (
                    <React.Fragment key={e.day}>
                      {i > 0 && <RowSeparator />}
                      <DayListRow entry={e} settings={settings} today={e.day === today} now={now} onPress={() => open(e.day)} />
                    </React.Fragment>
                  ))}
                </View>
              )}
            </Panel>
          )}

          <Panel title="Summary" meta={bounds.label}>
            <SummaryTiles tiles={tiles} />
            {!!notice && <Text style={[textVariants.caption, styles.notice, { color: t.textTertiary }]}>{notice}</Text>}
          </Panel>
        </>
      )}
    </>
  )
}

const CELL_DATE = 34

const styles = StyleSheet.create({
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter - 10,
    paddingTop: spacing.md,
  },
  monthWords: { alignItems: "center", gap: 2 },
  segment: { paddingHorizontal: gutter, paddingTop: spacing.md },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: gutter,
    paddingTop: spacing.md,
    paddingBottom: gutter,
  },
  legendChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
  notice: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  calendar: { paddingHorizontal: gutter - 4, paddingTop: spacing.md, paddingBottom: gutter, gap: 4 },
  weekRow: { flexDirection: "row" },
  dow: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 11, lineHeight: 16, paddingBottom: 4 },
  cell: { flex: 1, alignItems: "center", paddingVertical: 3, gap: 3 },
  dateWell: { width: CELL_DATE, height: CELL_DATE, borderRadius: CELL_DATE / 2, alignItems: "center", justifyContent: "center" },
  date: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16, fontVariant: ["tabular-nums"] },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
})
