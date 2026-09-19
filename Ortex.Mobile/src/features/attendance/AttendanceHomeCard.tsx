import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey } from "@/domain/attendance"
import { ActionAdvisory, InfoChip, QueueAdvisory, DayDone } from "@/features/attendance/attendanceUi"
import { dayLabel } from "@/features/attendance/format"
import { DayTimelineBar, LiveTimer } from "@/features/attendance/LiveProgress"
import { dayTimeline, progressWords, shiftEnded, shiftMinutes, workedMs } from "@/features/attendance/progress"
import { useAttendanceNotices, useAttendanceToday, useStartClock } from "@/features/attendance/useAttendance"
import { feedback } from "@/lib/feedback"
import { shiftClock } from "@/lib/attendance"
import type { RootStackParamList } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon from "@/ui/Icon"
import Panel from "@/ui/Panel"
import SlideToConfirm from "@/ui/SlideToConfirm"

/**
 * Attendance on Home, the first thing under the title: clocking in is the most
 * frequent action in the app for every role, so it is one slide from launch
 * (plan §6). Laid out like Zoho People's check-in card: the shift as a chip
 * and the state as a pill, the worked time as the large figure, the first
 * clock-in and where under it, a thin timeline, then the one control whose
 * label is the state (Jobber), pocket-safe (Waymo). A missed clock-out yesterday is one tap
 * from its correction.
 */
export default function AttendanceHomeCard() {
  const t = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const startClock = useStartClock()
  const { settings, punches, summary, onDutySince, loading, now, queue } = useAttendanceToday()
  const notices = useAttendanceNotices()

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = workedMs(today, punches, now)
  const timeline = dayTimeline(today, punches, settings, now)


  const shift =
    settings.shift?.start && settings.shift?.end
      ? `General shift · ${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : "Shift not set"
  const where = summary.field ? "Field visit" : summary.site || ""

  // The state as a pill, and one line that says the rest.
  let state: { label: string; tone: "success" | "neutral" | "warning" }
  let detail: string
  if (onDutySince) {
    state = { label: "Checked in", tone: "success" }
    detail = `Checked in at ${clockIST(summary.firstIn || onDutySince)}${where ? ` · ${where}` : ""} · ${progressWords(worked.ms / 60000, shiftMin)}`
  } else if (summary.lastOut) {
    state = { label: "Checked out", tone: "neutral" }
    detail = `Last check-out ${clockIST(summary.lastOut)}, in at ${summary.firstIn ? clockIST(summary.firstIn) : "not recorded"} · ${progressWords(worked.ms / 60000, shiftMin, shiftEnded(settings, today, now))}`
  } else {
    state = { label: loading ? "Checking" : "Not checked in", tone: loading ? "neutral" : "warning" }
    detail = loading ? "Checking today" : "You have not checked in today"
  }

  return (
    <Panel
      title="Attendance"
      action={
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          onPress={() => {
            feedback.tap()
            navigation.navigate("Attendance")
          }}
        >
          <Text style={[textVariants.smallStrong, { color: t.primary }]}>My attendance</Text>
        </Pressable>
      }
    >
      <QueueAdvisory queue={queue} />
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
      <View style={styles.body}>
        <View style={styles.chips}>
          <View>
            <InfoChip icon="clock" align="start">
              {shift}
            </InfoChip>
          </View>
          <InfoChip icon={onDutySince ? "tick" : "clock"} tone={state.tone} align="start">
            {state.label}
          </InfoChip>
        </View>

        <View style={styles.figureRow}>
          <View style={styles.figure}>
            <LiveTimer baseMs={worked.ms} baseAt={now} running={!!onDutySince} style={[styles.timer, { color: t.text }]} />
            <Text style={[styles.hrs, { color: t.textTertiary }]}>Hrs</Text>
          </View>
          {summary.flagged > 0 && <Icon name="warning" size={18} color={t.warning} />}
        </View>
        <Text style={[textVariants.small, { color: t.textTertiary, marginTop: -spacing.sm }]} numberOfLines={2}>
          {detail}
        </Text>

        {summary.firstIn ? <DayTimelineBar timeline={timeline} compact /> : null}
        {!onDutySince && summary.lastOut ? (
          <DayDone
            inAt={summary.firstIn ? clockIST(summary.firstIn) : null}
            outAt={clockIST(summary.lastOut)}
            onCorrect={() => {
              feedback.tap()
              navigation.navigate("AttendanceCorrection", { day: today, inAt: summary.firstIn, outAt: summary.lastOut })
            }}
          />
        ) : (
          <SlideToConfirm
            label={onDutySince ? "Slide to check out" : "Slide to check in"}
            tone={onDutySince ? "danger" : "primary"}
            disabled={loading}
            hint={onDutySince ? "Takes a selfie and your location, then checks you out" : "Takes a selfie and your location, then checks you in"}
            onConfirm={() => void startClock(navigation, onDutySince ? "out" : "in")}
          />
        )}
        <View style={styles.footer}>
          <Text style={[textVariants.caption, { color: t.textTertiary, flex: 1 }]} numberOfLines={1}>
            {notices.nextHoliday
              ? `Next holiday: ${notices.nextHoliday.name}, ${dayLabel(notices.nextHoliday.day)}`
              : ""}
          </Text>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Leave: balances and apply"
            onPress={() => {
              feedback.tap()
              navigation.navigate("Leave")
            }}
          >
            <Text style={[textVariants.smallStrong, { color: t.primary }]}>Leave</Text>
          </Pressable>
        </View>
      </View>
    </Panel>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  figureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  figure: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  timer: { fontFamily: font.semibold, fontSize: 32, lineHeight: 40, fontVariant: ["tabular-nums"] },
  hrs: { fontFamily: font.medium, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
})
