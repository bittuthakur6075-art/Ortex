import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST, durationWords } from "@/domain/attendance"
import { useAttendanceToday, useStartClock } from "@/features/attendance/useAttendance"
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
 * (plan §6). States the day in words, then the one control whose label is the
 * state (Jobber), pocket-safe (Waymo).
 */
export default function AttendanceHomeCard() {
  const t = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const startClock = useStartClock()
  const { settings, summary, onDutySince, loading } = useAttendanceToday()

  const shift =
    settings.shift?.start && settings.shift?.end
      ? `Shift ${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : ""

  let headline: string
  let detail: string
  if (onDutySince) {
    headline = `On duty since ${clockIST(onDutySince)}`
    detail = `${durationWords(summary.workedMin)} today${summary.field ? " · Field" : summary.site ? ` · ${summary.site}` : ""}`
  } else if (summary.lastOut) {
    headline = `Clocked out at ${clockIST(summary.lastOut)}`
    detail = `${durationWords(summary.workedMin)} today`
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
      <View style={styles.body}>
        <View style={styles.state}>
          <View style={[styles.dot, { backgroundColor: onDutySince ? t.success : t.textFaint }]} />
          <View style={{ flex: 1 }}>
            <Text style={[textVariants.cardTitle, { color: t.text }]}>{headline}</Text>
            {!!detail && <Text style={[textVariants.small, { color: t.textTertiary }]}>{detail}</Text>}
          </View>
          {summary.flagged > 0 && <Icon name="warning" size={18} color={t.warning} />}
        </View>
        <SlideToConfirm
          label={onDutySince ? "Slide to clock out" : "Slide to clock in"}
          tone={onDutySince ? "danger" : "primary"}
          disabled={loading}
          hint={onDutySince ? "Takes a selfie and your location, then clocks you out" : "Takes a selfie and your location, then clocks you in"}
          onConfirm={() => void startClock(navigation, onDutySince ? "out" : "in")}
        />
      </View>
    </Panel>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  state: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
})
