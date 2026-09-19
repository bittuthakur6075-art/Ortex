import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey, summarizeDays } from "@/domain/attendance"
import { ActionAdvisory } from "@/features/attendance/attendanceUi"
import { dayLabel } from "@/features/attendance/format"
import { DayTimelineBar, ProgressRing, WeekStrip } from "@/features/attendance/LiveProgress"
import {
  dayTimeline,
  progressWords,
  shiftMinutes,
  weekColumns,
  weekStart,
  workedMs,
} from "@/features/attendance/progress"
import PunchRow from "@/features/attendance/PunchRow"
import { useAttendanceNotices, useAttendanceToday, useStartClock } from "@/features/attendance/useAttendance"
import { feedback } from "@/lib/feedback"
import { myDays, myPunches, shiftClock } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, DataNotice, ImageViewer, ListRefreshControl, Panel, Section, SectionRow, SkeletonPanel } from "@/ui"
import SlideToConfirm from "@/ui/SlideToConfirm"

const TODAY = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })

/**
 * Attendance, the page: today in full (a ring of the shift done with a live
 * timer, the day as a timeline, the one slide, every punch with its selfie),
 * this week in columns, then the way to past days, corrections and (admins)
 * approvals. Marking attendance happens only here and on the Home card, and
 * only through the camera flow.
 */
export default function AttendanceScreen({ navigation }: StackScreenProps<"Attendance">) {
  const t = useTheme()
  const startClock = useStartClock()
  const { settings, punches, summary, onDutySince, loading, error, reload, now } = useAttendanceToday()
  const notices = useAttendanceNotices()
  const [photo, setPhoto] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [weekDays, setWeekDays] = React.useState<{ day: string; worked_min: number }[]>([])

  // This week's hours: the day rows (0034), or, until they exist, the punches.
  const loadWeek = React.useCallback(async () => {
    const from = weekStart(Date.now())
    const to = dayKey(Date.now())
    try {
      const rows = await myDays({ from, to })
      if (rows.length) {
        setWeekDays(rows.map((r) => ({ day: r.day, worked_min: r.worked_min || 0 })))
        return
      }
    } catch {
      /* not set up yet: fall back below */
    }
    const p = await myPunches({ from, to }).catch(() => [])
    setWeekDays(summarizeDays(p).map((d) => ({ day: d.day, worked_min: d.workedMin })))
  }, [])

  useFocusEffect(
    React.useCallback(() => {
      void loadWeek()
    }, [loadWeek]),
  )

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = React.useMemo(() => workedMs(today, punches, now), [today, punches, now])
  const timeline = React.useMemo(() => dayTimeline(today, punches, settings, now), [today, punches, settings, now])
  const week = React.useMemo(
    () => weekColumns(weekDays, Math.round(worked.ms / 60000), now),
    [weekDays, worked.ms, now],
  )

  const todays = [...summary.punches].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const shift =
    settings.shift?.start && settings.shift?.end
      ? `${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : "Not set"
  const where = summary.field ? "Field" : summary.site || ""
  const stateLine = summary.firstIn
    ? `Clocked in at ${clockIST(summary.firstIn)}${where ? ` · ${where}` : ""}`
    : `Not clocked in yet · Shift ${shift}`

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
          <SkeletonPanel lines={3} block={200} />
          <SkeletonPanel lines={3} />
        </>
      ) : (
        <>
          <Panel title="Today">
            <View style={styles.today}>
              <View style={styles.ring}>
                <ProgressRing
                  workedMs={worked.ms}
                  computedAt={now}
                  running={!!onDutySince}
                  shiftMin={shiftMin}
                  size={208}
                  stroke={14}
                />
              </View>
              <View style={styles.words}>
                <Text style={[textVariants.cardTitle, { color: t.text, textAlign: "center" }]}>
                  {summary.firstIn ? progressWords(worked.ms / 60000, shiftMin) : "Your day has not started"}
                </Text>
                <Text style={[textVariants.small, { color: t.textTertiary, textAlign: "center" }]}>{stateLine}</Text>
              </View>
              <DayTimelineBar timeline={timeline} />
              <SlideToConfirm
                label={onDutySince ? "Slide to clock out" : "Slide to clock in"}
                tone={onDutySince ? "danger" : "primary"}
                hint="Takes a selfie and your location"
                onConfirm={() => void startClock(navigation, onDutySince ? "out" : "in")}
              />
            </View>
          </Panel>

          <Panel title="This week" meta={`Target ${Math.round((shiftMin / 60) * 10) / 10}h a day`}>
            <View style={styles.week}>
              <WeekStrip columns={week} targetMin={shiftMin} />
            </View>
          </Panel>

          <Panel title="Today's punches" meta={todays.length ? `${todays.length}` : undefined}>
            {todays.length === 0 ? (
              <Text style={[textVariants.small, styles.empty, { color: t.textTertiary }]}>
                Nothing yet. Your clock-ins and clock-outs appear here, each with its selfie.
              </Text>
            ) : (
              <View style={{ paddingTop: spacing.xs }}>
                {todays.map((p, i) => (
                  <PunchRow key={p.id} punch={p} last={i === todays.length - 1} onOpenPhoto={setPhoto} />
                ))}
              </View>
            )}
          </Panel>

          <Section title="More">
            <SectionRow
              leadingIcon="calendar"
              title="My attendance"
              subtitle="Your month, day by day, with hours and selfies"
              onPress={() => {
                feedback.tap()
                navigation.navigate("AttendanceHistory")
              }}
            />
            {notices.admin && (
              <SectionRow
                leadingIcon="tick"
                leadingTone={notices.pending ? "warning" : "primary"}
                title="Approvals"
                subtitle={
                  notices.pending
                    ? `${notices.pending} waiting: corrections and punches to review`
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
              {`Shift ${shift}${settings.graceMin ? `, ${settings.graceMin} min grace` : ""}. Attendance is marked only in this app, with a selfie and your location at that moment. Your location is never tracked at other times.`}
            </Text>
          </Panel>
        </>
      )}
      <ImageViewer visible={!!photo} images={photo ? [photo] : []} onClose={() => setPhoto(null)} />
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  today: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  ring: { alignItems: "center", paddingTop: spacing.sm },
  words: { gap: 2, alignItems: "center" },
  week: { paddingHorizontal: gutter, paddingBottom: spacing.md },
  empty: { paddingHorizontal: gutter, paddingBottom: spacing.md },
})
