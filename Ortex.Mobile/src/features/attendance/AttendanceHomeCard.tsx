import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey } from "@/domain/attendance"
import { ActionAdvisory } from "@/features/attendance/attendanceUi"
import { dayLabel } from "@/features/attendance/format"
import { DayTimelineBar, ProgressRing } from "@/features/attendance/LiveProgress"
import { dayTimeline, progressWords, shiftMinutes, workedMs } from "@/features/attendance/progress"
import { useAttendanceNotices, useAttendanceToday, useStartClock } from "@/features/attendance/useAttendance"
import { feedback } from "@/lib/feedback"
import { shiftClock } from "@/lib/attendance"
import type { RootStackParamList } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon from "@/ui/Icon"
import Panel from "@/ui/Panel"
import SlideToConfirm from "@/ui/SlideToConfirm"

/**
 * Attendance on Home, the first thing under the title: clocking in is the most
 * frequent action in the app for every role, so it is one slide from launch
 * (plan §6). A small ring of the shift done with its live timer (Zoho People),
 * the day in words, a thin timeline, then the one control whose label is the
 * state (Jobber), pocket-safe (Waymo). A missed clock-out yesterday is one tap
 * from its correction.
 */
export default function AttendanceHomeCard() {
  const t = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const startClock = useStartClock()
  const { settings, punches, summary, onDutySince, loading, now } = useAttendanceToday()
  const notices = useAttendanceNotices()

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = workedMs(today, punches, now)
  const timeline = dayTimeline(today, punches, settings, now)

  const shift =
    settings.shift?.start && settings.shift?.end
      ? `Shift ${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : ""

  let headline: string
  let detail: string
  if (onDutySince) {
    headline = `On duty since ${clockIST(onDutySince)}`
    detail = `${progressWords(worked.ms / 60000, shiftMin)}${summary.field ? " · Field" : summary.site ? ` · ${summary.site}` : ""}`
  } else if (summary.lastOut) {
    headline = `Clocked out at ${clockIST(summary.lastOut)}`
    detail = progressWords(worked.ms / 60000, shiftMin)
  } else {
    headline = loading ? "Checking today" : "Not clocked in yet"
    detail = shift
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
        <View style={styles.state}>
          <ProgressRing
            workedMs={worked.ms}
            computedAt={now}
            running={!!onDutySince}
            shiftMin={shiftMin}
            size={64}
            stroke={6}
            compact
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[textVariants.cardTitle, { color: t.text }]}>{headline}</Text>
            {!!detail && <Text style={[textVariants.small, { color: t.textTertiary }]}>{detail}</Text>}
          </View>
          {summary.flagged > 0 && <Icon name="warning" size={18} color={t.warning} />}
        </View>
        {summary.firstIn ? <DayTimelineBar timeline={timeline} compact /> : null}
        <SlideToConfirm
          label={onDutySince ? "Slide to clock out" : "Slide to clock in"}
          tone={onDutySince ? "danger" : "primary"}
          disabled={loading}
          hint={onDutySince ? "Takes a selfie and your location, then clocks you out" : "Takes a selfie and your location, then clocks you in"}
          onConfirm={() => void startClock(navigation, onDutySince ? "out" : "in")}
        />
        {notices.nextHoliday && (
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            {`Next holiday: ${notices.nextHoliday.name}, ${dayLabel(notices.nextHoliday.day)}`}
          </Text>
        )}
      </View>
    </Panel>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  state: { flexDirection: "row", alignItems: "center", gap: spacing.md },
})
