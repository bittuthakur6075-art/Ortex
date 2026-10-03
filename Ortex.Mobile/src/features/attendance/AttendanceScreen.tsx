import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey, type DayStatus } from "@/domain/attendance"
import { ActionAdvisory, InfoChip, DayDone } from "@/features/attendance/attendanceUi"
import { DialHeroSkeleton, WeekSkeleton } from "@/features/attendance/AttendanceSkeletons"
import CheckButton from "@/features/attendance/CheckButton"
import { weekCells } from "@/features/attendance/days"
import { dayLabel, hoursShort, SECTION_TITLE } from "@/features/attendance/format"
import { DayTimelineBar, LiveTimer, ShiftBar } from "@/features/attendance/LiveProgress"
import MonthAttendance from "@/features/attendance/MonthAttendance"
import {
  autoPresentClock,
  dayTimeline,
  istMs,
  progressWords,
  shiftEnded,
  shiftMinutes,
  weekColumns,
  workedMs,
  punchWindow,
  punchWindowLabel,
} from "@/features/attendance/progress"
import {
  useAttendanceNotices,
  useAttendanceToday,
  useStartClock,
  useWeekDays,
} from "@/features/attendance/useAttendance"
import WeekStatusStrip, { StatusLegend } from "@/features/attendance/WeekStatusStrip"
import { feedback } from "@/lib/feedback"
import { shiftClock } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, ListRefreshControl } from "@/ui"
import { SquircleBackground } from "@/ui/Squircle"
import { CardRow, CardRows, SubHeader, Tag } from "@/ui/OneUi"
import Panel from "@/ui/Panel"

const TODAY = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Kolkata",
})

/**
 * Attendance, the page, laid out like Zoho People's attendance screen. On top,
 * today: the shift as a pill beside the state, the hours worked as a large
 * running "HH:MM:SS Hrs", one wide Check-in (green) or Check-out (red) button
 * that starts the same camera flow as ever, when you checked in or out and
 * where, and the day as a thin timeline. Then the week as a strip of status
 * coloured dates, then the month: its switcher, List / Calendar, the colour
 * legend, a row per day and the month's counts (MonthAttendance). Marking
 * attendance happens only here and on the Home card, only through the camera.
 */
export default function AttendanceScreen({ navigation }: StackScreenProps<"Attendance">) {
  const t = useTheme()
  const startClock = useStartClock()
  const { settings, settingsLoaded, punches, summary, onDutySince, loading, error, reload, now, countFrom } =
    useAttendanceToday()
  const notices = useAttendanceNotices()
  const { session } = useAuth()
  const [monthKey, setMonthKey] = React.useState(0)
  const [refreshing, setRefreshing] = React.useState(false)

  // This week: the shared hook, so Home and this page cannot disagree.
  const nextHolidayDay = notices.nextHoliday?.day
  const { rows: weekDays, reload: loadWeek } = useWeekDays()

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = workedMs(today, punches, now, countFrom)
  const timeline = dayTimeline(today, punches, settings, now)
  const holiday = nextHolidayDay
  const liveMin = Math.round(worked.ms / 60000)
  const week = React.useMemo(
    () => weekCells(weekColumns(weekDays, liveMin, now), weekDays, holiday),
    [weekDays, liveMin, now, holiday],
  )
  const weekStatuses = React.useMemo(() => {
    const seen = new Set<DayStatus>()
    for (const c of week) {
      if (c.status) seen.add(c.status)
      if (c.planned) seen.add(c.planned)
    }
    return [...seen]
  }, [week])

  const shift =
    settings.shift?.start && settings.shift?.end
      ? `${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : ""
  // "Office", not the check-in station's name, as on the Home card.
  const where = summary.field ? "Field visit" : "Office"
  const win = punchWindow(settings, now)
  const weekMin = week.reduce((sum, c) => sum + c.minutes, 0)
  const workedMin = worked.ms / 60000
  const kind = onDutySince ? "out" : "in"
  // One check-in and one check-out a day: after the check-out the day is done.
  const dayDone = !onDutySince && !!summary.lastOut

  const state = onDutySince
    ? { label: "Checked in", tone: "success" as const }
    : summary.lastOut
    ? { label: "Checked out", tone: "neutral" as const }
    : { label: "Not checked in", tone: "warning" as const }
  // Present by default (0056) with no punch: the day runs by the shift clock, as on Home.
  const auto = autoPresentClock(settings, session?.user?.id, today, holiday === today, now)
  const autoDay = !!auto && !onDutySince && !dayDone && auto.to > auto.from
  const shownMs = autoDay ? auto.ms : worked.ms
  const running = !!onDutySince || (autoDay && auto.running)
  const shiftFrom = settings.shift?.start ? istMs(today, settings.shift.start) : NaN
  const shiftTo = settings.shift?.end ? istMs(today, settings.shift.end) : NaN
  // Where now falls in the shift, the bar's tick (as on the Home card); none once the day is done.
  const elapsed = dayDone || !(shiftTo > shiftFrom) ? undefined : (now - shiftFrom) / (shiftTo - shiftFrom)
  const autoState = autoDay
    ? auto.ended
      ? { label: "Day complete", tone: "neutral" as const }
      : { label: "Present", tone: "success" as const }
    : null
  const progress = autoDay
    ? auto.started
      ? progressWords(shownMs / 60000, shiftMin, auto.ended)
      : `Starts automatically at ${shiftClock(settings.shift!.start)}`
    : summary.firstIn
    ? progressWords(workedMin, shiftMin, !onDutySince && shiftEnded(settings, today, now))
    : `${hoursShort(shiftMin)} shift`

  return (
    <AppScreen
      title="Attendance"
      subtitle={TODAY.format(new Date(now))}
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
              await Promise.all([reload(), notices.reload(), loadWeek()])
              setMonthKey((k) => k + 1)
              setRefreshing(false)
            }}
          />
        ),
      }}
    >
      <DataNotice error={error} onRetry={() => void reload()} />
      {notices.missedYesterday && (
        <ActionAdvisory
          tone="warning"
          icon="warning"
          onPress={() => {
            feedback.tap()
            // The recorded check-in goes with it, so approving the check-out
            // cannot quietly replace a late check-in with the shift start.
            navigation.navigate("AttendanceCorrection", {
              day: notices.missed!.day,
              inAt: notices.missed!.inAt,
              outAt: null,
            })
          }}
        >
          You did not clock out yesterday. Request a correction
        </ActionAdvisory>
      )}
      {loading ? (
        <>
          <DialHeroSkeleton />
          <WeekSkeleton />
        </>
      ) : (
        <>
          <Panel>
            <View style={styles.hero}>
              <View style={styles.headRow}>
                <InfoChip
                  icon={onDutySince || autoState ? "tick" : "clock"}
                  tone={(autoState || state).tone}
                  align="start"
                >
                  {(autoState || state).label}
                </InfoChip>
                <Text
                  style={[textVariants.caption, styles.shift, { color: t.textTertiary }]}
                  numberOfLines={1}
                >
                  {shift ? `General shift · ${shift}` : settingsLoaded ? "Shift not set" : ""}
                </Text>
              </View>

              <View style={styles.ringWrap}>
                <LiveTimer
                  baseMs={shownMs}
                  baseAt={now}
                  running={running}
                  style={[styles.bigTime, { color: t.text }]}
                />
                <View style={styles.barWide}>
                  <ShiftBar
                    fraction={shiftMin > 0 ? shownMs / 60000 / shiftMin : 0}
                    color={running || dayDone || autoDay ? t.success : t.primary}
                    elapsed={elapsed}
                  />
                  {settings.shift?.start && settings.shift?.end ? (
                    <View style={styles.ticks}>
                      <Text style={[styles.tick, { color: t.textTertiary }]}>
                        {shiftClock(settings.shift.start)}
                      </Text>
                      <Text style={[styles.tick, { color: t.textTertiary }]}>
                        {shiftClock(settings.shift.end)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[textVariants.small, { color: t.textTertiary }]}>{progress}</Text>
              </View>

              <View style={styles.stamps}>
                <Stamp
                  label="Check-in"
                  value={
                    summary.firstIn
                      ? clockIST(summary.firstIn)
                      : autoDay && auto.started
                      ? clockIST(auto.from)
                      : "Not yet"
                  }
                  sub={summary.firstIn ? where : autoDay ? "Automatic" : `From ${clockIST(win.open)}`}
                  dot={summary.firstIn || (autoDay && auto.started) ? t.success : t.textFaint}
                />
                <Stamp
                  label="Check-out"
                  value={
                    dayDone
                      ? clockIST(summary.lastOut!)
                      : autoDay && auto.ended
                      ? clockIST(auto.to)
                      : "Not yet"
                  }
                  sub={
                    dayDone || (autoDay && auto.ended)
                      ? "Day complete"
                      : autoDay
                      ? "At the shift end"
                      : "Any time before midnight"
                  }
                  dot={dayDone || (autoDay && auto.ended) ? t.success : t.textFaint}
                />
              </View>

              {summary.firstIn ? <DayTimelineBar timeline={timeline} /> : null}

              {dayDone ? (
                <DayDone
                  inAt={summary.firstIn ? clockIST(summary.firstIn) : null}
                  outAt={clockIST(summary.lastOut!)}
                  onCorrect={() =>
                    navigation.navigate("AttendanceCorrection", {
                      day: today,
                      inAt: summary.firstIn,
                      outAt: summary.lastOut,
                    })
                  }
                />
              ) : autoDay ? null : (
                <CheckButton
                  kind={kind}
                  disabled={loading}
                  shut={punchWindowLabel(settings, now, kind)}
                  onPress={() => void startClock(navigation, kind, settings)}
                />
              )}

              <Text style={[textVariants.caption, styles.center, { color: t.textTertiary }]}>
                {`Check-in ${clockIST(win.open)} to ${clockIST(
                  win.close,
                )} · check-out any time · scan the office QR code`}
              </Text>
            </View>
          </Panel>

          <Panel
            title="This Week"
            titleStyle={SECTION_TITLE}
            meta={`${hoursShort(weekMin)} worked · target ${hoursShort(shiftMin)} a day`}
          >
            <View style={styles.week}>
              <WeekStatusStrip cells={week} onOpen={(day) => navigation.navigate("AttendanceDay", { day })} />
              <StatusLegend statuses={weekStatuses} />
            </View>
          </Panel>

          <MonthAttendance
            now={now}
            refreshKey={monthKey}
            onOpen={(day) => navigation.navigate("AttendanceDay", { day })}
          />

          <Panel title="More" titleStyle={SECTION_TITLE}>
            <CardRows>
              <CardRow
                icon="calendar"
                tone="violet"
                title="Leave"
                subtitle="Balances, apply, and your requests"
                onPress={() => navigation.navigate("Leave")}
              />
              {notices.admin ? (
                <CardRow
                  icon="tick"
                  tone={notices.pending ? "warning" : "primary"}
                  title="Approvals"
                  subtitle={
                    notices.pending
                      ? "Leave, corrections and punches to review"
                      : "Nothing waiting for a decision"
                  }
                  trailing={
                    notices.pending ? <Tag label={`${notices.pending} waiting`} tone="primary" /> : undefined
                  }
                  onPress={() => navigation.navigate("AttendanceApprovals")}
                />
              ) : null}
              {notices.admin ? (
                <CardRow
                  icon="team"
                  title="Team Attendance"
                  subtitle="Who is in today, and who is not yet"
                  onPress={() => navigation.navigate("TeamAttendance")}
                />
              ) : null}
            </CardRows>
          </Panel>

          {/* The last section: its own title, no band under it (nothing follows). */}
          {notices.nextHoliday && (
            <View style={styles.holiday}>
              <SubHeader flush title="Next Holiday" titleStyle={SECTION_TITLE} />
              <CardRow
                icon="calendar"
                tone="violet"
                title={notices.nextHoliday.name}
                subtitle={dayLabel(notices.nextHoliday.day)}
              />
            </View>
          )}
        </>
      )}
    </AppScreen>
  )
}

/** One of the two tiles under the ring: when you checked in, or out, and the fact beside it. */
function Stamp({ label, value, sub, dot }: { label: string; value: string; sub: string; dot: string }) {
  const t = useTheme()
  return (
    <View style={styles.stamp}>
      <SquircleBackground fill={t.surfaceInset} radius={18} />
      <View style={styles.stampHead}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>{label}</Text>
      </View>
      <Text style={[styles.stampValue, { color: t.text }]}>{value}</Text>
      <Text style={[textVariants.caption, { color: t.textTertiary }]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingVertical: spacing.lg, gap: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  shift: { flex: 1, textAlign: "right" },
  bigTime: {
    fontFamily: font.semibold,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  barWide: { alignSelf: "stretch", gap: 6 },
  ticks: { flexDirection: "row", justifyContent: "space-between" },
  tick: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, fontVariant: ["tabular-nums"] },
  ringWrap: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  stamps: { flexDirection: "row", gap: spacing.sm },
  stamp: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  stampHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  stampValue: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] },
  center: { textAlign: "center" },
  week: { paddingHorizontal: gutter - 8, paddingBottom: spacing.md },
  holiday: { paddingTop: spacing.md, paddingBottom: spacing.lg },
})
