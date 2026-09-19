import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import {
  clockIST,
  dayKey,
  durationWords,
  effectiveStatus,
  monthBounds,
  monthGrid,
  monthTotals,
  STATUS_LABEL,
  summarizeDays,
  type AttendanceDay,
  type DayStatus,
} from "@/domain/attendance"
import { StatusChip, StatusPill } from "@/features/attendance/attendanceUi"
import { dayLabel, statusColors } from "@/features/attendance/format"
import { loadSettings, myDays, myPunches, NOT_SET_UP, type AttendanceSettings } from "@/lib/attendance"
import { myRequests } from "@/lib/leave"
import { addDays } from "@/features/leave/leaveFormat"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import {
  AppScreen,
  Badge,
  DataNotice,
  EmptyState,
  IconButton,
  ListRefreshControl,
  ListRow,
  Panel,
  RowSeparator,
  SkeletonPanel,
} from "@/ui"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const LEGEND: DayStatus[] = ["P", "OD", "HD", "A", "MP", "L", "WO", "H"]

/**
 * Until migration 0034 computes day rows, a month can still be drawn from the
 * punches alone: a day with a counted clock-in is present (field, if every
 * punch was), and an in left open on a past day is a missed punch. No absences
 * and no late marks, because those need the rules the server applies.
 */
function daysFromPunches(punches: Awaited<ReturnType<typeof myPunches>>, today: string): AttendanceDay[] {
  return summarizeDays(punches)
    .filter((d) => d.firstIn)
    .map((d) => ({
      user_id: "",
      day: d.day,
      status: (d.open && d.day < today ? "MP" : d.field ? "OD" : "P") as DayStatus,
      first_in: d.firstIn,
      last_out: d.lastOut,
      worked_min: d.workedMin,
      late: false,
      late_min: 0,
      flags: [],
    }))
}

/**
 * My attendance, a month at a time: the calendar with each day's status on its
 * colour (Bevel), a legend (Peerspace), the month's totals in the words payroll
 * uses, then every day as a row. A day opens its timeline.
 */
export default function AttendanceHistoryScreen({ navigation }: StackScreenProps<"AttendanceHistory">) {
  const t = useTheme()
  const [today] = React.useState(() => dayKey(Date.now()))
  const [ym, setYm] = React.useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [days, setDays] = React.useState<AttendanceDay[] | null>(null)
  const [settings, setSettings] = React.useState<AttendanceSettings>({})
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  // Approved leave still to come: dotted "L" cells, so upcoming leave shows
  // before attendance_days has a row for it (rows exist only once a day starts).
  const [futureLeave, setFutureLeave] = React.useState<Set<string>>(new Set())

  const bounds = monthBounds(ym.y, ym.m)
  const isCurrent = today.slice(0, 7) === bounds.from.slice(0, 7)

  const load = React.useCallback(async () => {
    const b = monthBounds(ym.y, ym.m)
    setSettings(await loadSettings())
    void myRequests()
      .then((reqs) => {
        const now = dayKey(Date.now())
        const s = new Set<string>()
        for (const r of reqs) {
          if (r.status !== "approved" || r.to_day <= now) continue
          for (let d = r.from_day > now ? r.from_day : addDays(now, 1); d <= r.to_day; d = addDays(d, 1)) s.add(d)
        }
        setFutureLeave(s)
      })
      .catch(() => setFutureLeave(new Set()))
    try {
      setDays(await myDays({ from: b.from, to: b.to }))
      setError(null)
      setNotice(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load your attendance."
      if (msg === NOT_SET_UP) {
        // Draw the month from punches; say what is missing rather than failing.
        try {
          const p = await myPunches({ from: b.from, to: b.to })
          setDays(daysFromPunches(p, dayKey(Date.now())))
          setNotice("Absences, late marks and payable days appear once attendance rules are set up on the server.")
          setError(null)
          return
        } catch (e2) {
          setError(e2 instanceof Error ? e2.message : msg)
        }
      } else {
        setError(msg)
      }
      setDays((d) => d ?? [])
    }
  }, [ym])

  React.useEffect(() => {
    setDays(null)
    void load()
  }, [load])

  const weeks = React.useMemo(() => monthGrid(ym.y, ym.m, days || []), [ym, days])
  const totals = React.useMemo(() => monthTotals(days || [], settings.lateRule), [days, settings.lateRule])
  const list = React.useMemo(() => [...(days || [])].sort((a, b) => (a.day < b.day ? 1 : -1)), [days])

  const shiftMonth = (delta: number) => {
    feedback.select()
    setYm(({ y, m }) => {
      const n = m + delta
      return n < 1 ? { y: y - 1, m: 12 } : n > 12 ? { y: y + 1, m: 1 } : { y, m: n }
    })
  }

  const open = (day: string) => {
    feedback.tap()
    navigation.navigate("AttendanceDay", { day })
  }

  const facts: [string, string][] = [
    ["Present", `${totals.counts.P}`],
    ["Field", `${totals.counts.OD}`],
    ["Half days", `${totals.counts.HD}`],
    ["Absent", `${totals.counts.A}`],
    ["Missed punches", `${totals.counts.MP}`],
    ["Late", `${totals.lates}${totals.latePenalty ? ` (−${totals.latePenalty} day)` : ""}`],
  ]

  return (
    <AppScreen
      title="My attendance"
      subtitle={bounds.label}
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      list={{
        data: [],
        renderItem: () => null,
        refreshControl: (
          <ListRefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await load()
              setRefreshing(false)
            }}
          />
        ),
      }}
    >
      <DataNotice error={error} onRetry={() => void load()} />

      <View style={styles.switcher}>
        <IconButton name="back" onPress={() => shiftMonth(-1)} accessibilityLabel="Previous month" />
        <Text style={[textVariants.cardTitle, { color: t.text }]}>{bounds.label}</Text>
        <IconButton
          name="forward"
          onPress={() => shiftMonth(1)}
          disabled={isCurrent}
          accessibilityLabel="Next month"
        />
      </View>

      {days === null ? (
        <>
          <SkeletonPanel lines={5} block={260} />
          <SkeletonPanel lines={3} />
        </>
      ) : (
        <>
          <Panel title="Calendar">
            <View style={styles.calendar}>
              <View style={styles.weekRow}>
                {WEEKDAYS.map((w) => (
                  <Text key={w} style={[styles.dow, { color: t.textTertiary }]}>
                    {w}
                  </Text>
                ))}
              </View>
              {weeks.map((week, i) => (
                <View key={i} style={styles.weekRow}>
                  {week.map((cell) => {
                    const status = cell.entry ? effectiveStatus(cell.entry) : null
                    const colors = status ? statusColors(t, status) : null
                    const planned = !status && cell.inMonth && futureLeave.has(cell.day)
                    const leaveTint = statusColors(t, "L")
                    const isToday = cell.day === today
                    const future = cell.day > today
                    return (
                      <Pressable
                        key={cell.day}
                        disabled={!cell.inMonth || future}
                        onPress={() => open(cell.day)}
                        accessibilityRole="button"
                        accessibilityLabel={`${dayLabel(cell.day)}${status ? `, ${STATUS_LABEL[status]}` : ""}`}
                        style={[
                          styles.cell,
                          { backgroundColor: colors ? colors.bg : cell.inMonth ? t.fieldBg : "transparent" },
                          isToday && { borderWidth: 2, borderColor: t.primary },
                          planned && { borderWidth: 1.5, borderStyle: "dashed", borderColor: leaveTint.fg },
                          !cell.inMonth && { opacity: 0.35 },
                        ]}
                      >
                        <Text style={[styles.date, { color: colors ? colors.fg : future ? t.textFaint : t.textSecondary }]}>
                          {cell.date}
                        </Text>
                        {status && <Text style={[styles.code, { color: colors!.fg }]}>{status}</Text>}
                        {planned && <Text style={[styles.code, { color: leaveTint.fg }]}>L</Text>}
                      </Pressable>
                    )
                  })}
                </View>
              ))}
              {/* The floating legend (Peerspace): what each colour means. */}
              <View style={[styles.legend, { backgroundColor: t.surfaceInset }]}>
                {LEGEND.map((s) => (
                  <View key={s} style={styles.legendItem}>
                    <StatusChip status={s} size="sm" />
                    <Text style={[textVariants.caption, { color: t.textTertiary }]}>{STATUS_LABEL[s]}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Panel>

          <Panel title="This month" meta={durationWords(totals.workedMin)}>
            <View style={styles.facts}>
              {facts.map(([label, value]) => (
                <View key={label} style={styles.fact}>
                  <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
                  <Text style={[textVariants.bodyStrong, { color: t.text }]}>{value}</Text>
                </View>
              ))}
            </View>
            <View style={[styles.payable, { backgroundColor: t.iconWell }]}>
              <Text style={[textVariants.small, { color: t.primary }]}>Payable days</Text>
              <Text style={[styles.payableValue, { color: t.primary }]}>{totals.payable}</Text>
            </View>
            {!!notice && (
              <Text style={[textVariants.caption, styles.notice, { color: t.textTertiary }]}>{notice}</Text>
            )}
          </Panel>

          <Panel title="Days" meta={list.length ? `${list.length}` : undefined}>
            {list.length === 0 ? (
              <EmptyState
                icon="calendar"
                title="Nothing this month yet"
                hint="Clock in from Home and your days appear here, each with its status and hours."
              />
            ) : (
              list.map((d, i) => {
                const s = effectiveStatus(d)
                const span = d.first_in
                  ? `${clockIST(d.first_in)} to ${d.last_out ? clockIST(d.last_out) : "no clock-out"}`
                  : STATUS_LABEL[s]
                return (
                  <React.Fragment key={d.day}>
                    {i > 0 && <RowSeparator />}
                    <ListRow
                      title={dayLabel(d.day)}
                      subtitle={span}
                      value={d.worked_min ? durationWords(d.worked_min) : ""}
                      leading={<StatusChip status={s} />}
                      valueSub={
                        d.late ? (
                          <Badge label={`Late ${durationWords(d.late_min || 0)}`} tone="warning" />
                        ) : (
                          <StatusPill status={s} />
                        )
                      }
                      onPress={() => open(d.day)}
                    />
                  </React.Fragment>
                )
              })
            )}
          </Panel>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter - 10,
    paddingBottom: spacing.sm,
  },
  calendar: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: 6 },
  weekRow: { flexDirection: "row", gap: 6 },
  dow: { flex: 1, textAlign: "center", fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
  },
  date: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16, fontVariant: ["tabular-nums"] },
  code: { fontFamily: font.bold, fontSize: 9, lineHeight: 11 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.card,
    marginTop: spacing.xs,
    justifyContent: "center",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  facts: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter, rowGap: spacing.md },
  fact: { width: "33.33%", gap: 2 },
  payable: {
    marginHorizontal: gutter,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  payableValue: { fontFamily: font.bold, fontSize: 22, lineHeight: 28, fontVariant: ["tabular-nums"] },
  notice: { paddingHorizontal: gutter, paddingBottom: spacing.md },
})
