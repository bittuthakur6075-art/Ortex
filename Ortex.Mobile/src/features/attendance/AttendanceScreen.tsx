import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey, type DayStatus } from "@/domain/attendance"
import { ActionAdvisory, InfoChip, DayDone } from "@/features/attendance/attendanceUi"
import { DialHeroSkeleton, WeekSkeleton } from "@/features/attendance/AttendanceSkeletons"
import CheckButton from "@/features/attendance/CheckButton"
import { weekCells } from "@/features/attendance/days"
import { dayLabel, hoursShort } from "@/features/attendance/format"
import { DayTimelineBar, LiveTimer } from "@/features/attendance/LiveProgress"
import MonthAttendance from "@/features/attendance/MonthAttendance"
import {
  dayTimeline,
  progressWords,
  shiftEnded,
  shiftMinutes,
  weekColumns,
  workedMs,
} from "@/features/attendance/progress"
import { useAttendanceNotices, useAttendanceToday, useStartClock, useWeekDays } from "@/features/attendance/useAttendance"
import WeekStatusStrip, { StatusLegend } from "@/features/attendance/WeekStatusStrip"
import { feedback } from "@/lib/feedback"
import { shiftClock } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, ListRefreshControl, Panel, Section, SectionRow } from "@/ui"

const TODAY = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })


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
  const { settings, punches, summary, onDutySince, loading, error, reload, now } = useAttendanceToday()
  const notices = useAttendanceNotices()
  const [monthKey, setMonthKey] = React.useState(0)
  const [refreshing, setRefreshing] = React.useState(false)

  // This week: the shared hook, so Home and this page cannot disagree.
  const nextHolidayDay = notices.nextHoliday?.day
  const { rows: weekDays, reload: loadWeek } = useWeekDays()

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = workedMs(today, punches, now)
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
  const where = summary.field ? "Field visit" : summary.site || ""
  const workedMin = worked.ms / 60000
  const kind = onDutySince ? "out" : "in"
  // One check-in and one check-out a day: after the check-out the day is done.
  const dayDone = !onDutySince && !!summary.lastOut

  // The line under the button: Zoho says when you checked in, or out.
  const stamp = onDutySince
    ? `Checked in at ${clockIST(summary.firstIn || onDutySince)}`
    : summary.lastOut
      ? `Last check-out ${clockIST(summary.lastOut)}`
      : "You have not checked in today"
  const state = onDutySince
    ? { label: "Checked in", tone: "success" as const }
    : summary.lastOut
      ? { label: "Checked out", tone: "neutral" as const }
      : { label: "Not checked in", tone: "warning" as const }
  const progress = summary.firstIn
    ? progressWords(workedMin, shiftMin, !onDutySince && shiftEnded(settings, today, now))
    : `${hoursShort(shiftMin)} shift`

  return (
    <AppScreen
      title="Attendance"
      subtitle={TODAY.format(new Date())}
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
            navigation.navigate("AttendanceCorrection", { day: notices.missedYesterday! })
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
              <View style={styles.chips}>
                <View>
                  <InfoChip icon="clock" align="start">
                    {shift ? `General shift · ${shift}` : "Shift not set"}
                  </InfoChip>
                </View>
                <InfoChip icon={onDutySince ? "tick" : "clock"} tone={state.tone} align="start">
                  {state.label}
                </InfoChip>
              </View>

              <View style={styles.timerBlock}>
                <View style={styles.timerRow}>
                  <LiveTimer baseMs={worked.ms} baseAt={now} running={!!onDutySince} style={[styles.timer, { color: t.text }]} />
                  <Text style={[styles.hrs, { color: t.textTertiary }]}>Hrs</Text>
                </View>
                <Text style={[textVariants.small, { color: t.textTertiary }]}>{progress}</Text>
              </View>

              {dayDone ? (
                <DayDone
                  inAt={summary.firstIn ? clockIST(summary.firstIn) : null}
                  outAt={clockIST(summary.lastOut!)}
                  onCorrect={() => navigation.navigate("AttendanceCorrection", { day: today, inAt: summary.firstIn, outAt: summary.lastOut })}
                />
              ) : (
                <CheckButton kind={kind} disabled={loading} onPress={() => void startClock(navigation, kind)} />
              )}

              <View style={styles.stampRow}>
                <Text style={[textVariants.smallStrong, { color: t.textSecondary, flexShrink: 1 }]} numberOfLines={1}>
                  {stamp}
                </Text>
                {where ? (
                  <InfoChip icon="address" tone={summary.field ? "neutral" : "success"} align="start">
                    {where}
                  </InfoChip>
                ) : null}
              </View>

              {summary.firstIn ? <DayTimelineBar timeline={timeline} /> : null}

              <Text style={[textVariants.caption, styles.center, { color: t.textTertiary }]}>
                Check-in reads the code on the office screen.
              </Text>
            </View>
          </Panel>

          <Panel title="This week" meta={`Target ${hoursShort(shiftMin)} a day`}>
            <View style={styles.week}>
              <WeekStatusStrip
                cells={week}
                onOpen={(day) => navigation.navigate("AttendanceDay", { day })}
              />
              <StatusLegend statuses={weekStatuses} />
            </View>
          </Panel>

          <MonthAttendance now={now} refreshKey={monthKey} onOpen={(day) => navigation.navigate("AttendanceDay", { day })} />

          <Section title="More">
            <SectionRow
              leadingIcon="calendar"
              leadingTone="success"
              title="Leave"
              subtitle="Balances, apply, and your requests"
              onPress={() => {
                feedback.tap()
                navigation.navigate("Leave")
              }}
            />
            {notices.admin && (
              <SectionRow
                leadingIcon="tick"
                leadingTone={notices.pending ? "warning" : "primary"}
                title="Approvals"
                subtitle={
                  notices.pending
                    ? `${notices.pending} waiting: leave, corrections and punches to review`
                    : "Nothing waiting for a decision"
                }
                onPress={() => {
                  feedback.tap()
                  navigation.navigate("AttendanceApprovals")
                }}
              />
            )}
          </Section>

          {notices.nextHoliday && (
            <ActionAdvisory tone="info" icon="calendar">
              {`Next holiday: ${notices.nextHoliday.name}, ${dayLabel(notices.nextHoliday.day)}`}
            </ActionAdvisory>
          )}

          <Panel padded>
            <Text style={[textVariants.small, { color: t.textTertiary }]}>
              {`Shift ${shift || "not set"}${settings.graceMin ? `, ${settings.graceMin} min grace` : ""}. Attendance is marked only in this app, by scanning the code on the office screen. No selfie is taken and your location is not read.`}
            </Text>
          </Panel>
        </>
      )}
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: gutter, paddingTop: gutter, paddingBottom: gutter, gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  timerBlock: { alignItems: "center", gap: 2, paddingVertical: spacing.sm },
  timerRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  timer: { fontFamily: font.semibold, fontSize: 44, lineHeight: 52, fontVariant: ["tabular-nums"] },
  hrs: { fontFamily: font.medium, fontSize: 16, lineHeight: 22 },
  stampRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, flexWrap: "wrap" },
  center: { textAlign: "center" },
  week: { paddingHorizontal: gutter - 6, paddingBottom: gutter },
})
