import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey } from "@/domain/attendance"
import { ActionAdvisory, DayDone } from "@/features/attendance/attendanceUi"
import { dayLabel } from "@/features/attendance/format"
import { LiveTimer, ShiftBar } from "@/features/attendance/LiveProgress"
import {
  progressWords,
  punchWindow,
  punchWindowLabel,
  shiftEnded,
  shiftMinutes,
  weekColumns,
  workedMs,
} from "@/features/attendance/progress"
import { weekCells } from "@/features/attendance/days"
import WeekStatusStrip from "@/features/attendance/WeekStatusStrip"
import {
  useAttendanceNotices,
  useAttendanceToday,
  useStartClock,
  useWeekDays,
} from "@/features/attendance/useAttendance"
import { feedback } from "@/lib/feedback"
import { shiftClock } from "@/lib/attendance"
import type { RootStackParamList } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { fontFamily, textVariants } from "@/theme/typography"
import Icon from "@/ui/Icon"
import { Card, Tag } from "@/ui/OneUi"
import SlideToConfirm from "@/ui/SlideToConfirm"

const MINUTE = 60000
/** How long before the window closes an open day starts warning. */
const CLOSING_SOON_MIN = 30

/**
 * Attendance on Home, the first thing under the title: clocking in is the most
 * frequent action in the app for every role, so it is one slide from launch.
 *
 * The compact card (Figma "V3 · Attendance card"): a ring of the shift done
 * with the live time inside and the facts beside it, this week as the date
 * strip, at most one problem with its fix, the one control, and the punch
 * window as the last line, so nobody learns the rule from a refusal. Check-in
 * is open from 8:50 AM to 9 PM (`punchWindow`, migration 0049); outside it the
 * slider says when it opens. Check-out has no window, but an open day resets at
 * midnight, so the last half hour before midnight warns.
 */
export default function AttendanceHomeCard({ collapse = false }: { collapse?: boolean } = {}) {
  const t = useTheme()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const startClock = useStartClock()
  const { settings, punches, summary, onDutySince, loading, now } = useAttendanceToday()
  const notices = useAttendanceNotices()
  const [expanded, setExpanded] = React.useState(false)

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = workedMs(today, punches, now)

  // THIS WEEK, from the same hook as the Attendance page, so the two strips
  // can never disagree.
  const { rows: weekDays } = useWeekDays()
  const nextHolidayDay = notices.nextHoliday?.day
  const liveMin = Math.round(worked.ms / 60000)
  const week = React.useMemo(
    () => weekCells(weekColumns(weekDays, liveMin, now), weekDays, nextHolidayDay),
    [weekDays, liveMin, now, nextHolidayDay],
  )

  const win = punchWindow(settings, now)
  const kind = onDutySince ? "out" : "in"
  const shut = punchWindowLabel(settings, now, kind)
  const dayDone = !onDutySince && !!summary.lastOut
  // An open day resets at midnight IST (0049): warn in the half hour before.
  const midnight = Date.parse(`${today}T00:00:00+05:30`) + 24 * 60 * MINUTE
  const closingSoon = !!onDutySince && now >= midnight - CLOSING_SOON_MIN * MINUTE
  const shift =
    settings.shift?.start && settings.shift?.end
      ? `${shiftClock(settings.shift.start)} to ${shiftClock(settings.shift.end)}`
      : null
  // "Office", not the check-in station's name: the person was at work, not at a door.
  const where = summary.field ? "Field visit" : "Office"
  const hours = `of ${Math.round(shiftMin / 60)} h`
  const fraction = shiftMin > 0 ? worked.ms / MINUTE / shiftMin : 0
  const shiftStart = settings.shift?.start ? shiftClock(settings.shift.start) : ""
  const shiftEnd = settings.shift?.end ? shiftClock(settings.shift.end) : ""

  // The state: a pill, the ring's colour, and two lines that say the rest.
  let pill: { label: string; tone: "success" | "neutral" | "warning" }
  let ring: string
  let line1: string
  let line2: string
  if (loading) {
    pill = { label: "Checking", tone: "neutral" }
    ring = t.primary
    line1 = "Checking today"
    line2 = shift ? `Shift ${shift}` : "Shift not set"
  } else if (onDutySince) {
    pill = { label: summary.field ? "Field visit" : "Checked in", tone: "success" }
    ring = closingSoon ? t.warning : t.success
    line1 = `In at ${clockIST(summary.firstIn || onDutySince)} · ${where}`
    line2 = progressWords(worked.ms / MINUTE, shiftMin, shiftEnded(settings, today, now))
  } else if (dayDone) {
    pill = { label: "Checked out", tone: "neutral" }
    ring = t.success
    line1 = `In ${summary.firstIn ? clockIST(summary.firstIn) : "not recorded"} · out ${clockIST(
      summary.lastOut!,
    )}`
    line2 = progressWords(worked.ms / MINUTE, shiftMin, shiftEnded(settings, today, now))
  } else if (now < win.open) {
    pill = { label: "Not open yet", tone: "neutral" }
    ring = t.primary
    line1 = `Check-in opens at ${clockIST(win.open)}`
    line2 = shift ? `Shift ${shift}` : "Shift not set"
  } else {
    pill = { label: "Not checked in", tone: "warning" }
    ring = t.primary
    line1 = "You have not checked in today"
    line2 = shift ? `Shift ${shift}` : "Shift not set"
  }

  const open = (fn: () => void) => () => {
    feedback.tap()
    fn()
  }

  if (collapse && onDutySince && !expanded) {
    return (
      <Card style={styles.mini}>
        <Pressable
          onPress={() => {
            feedback.tap()
            setExpanded(true)
          }}
          accessibilityRole="button"
          accessibilityLabel={`${pill.label}, ${line1}. Show today's attendance`}
          style={styles.miniRow}
        >
          <View style={[styles.miniWell, { backgroundColor: t.successBg }]}>
            <Icon name="clock" size={20} color={ring} variant="Bulk" />
          </View>
          <View style={styles.facts}>
            <View style={styles.miniTop}>
              <LiveTimer
                baseMs={worked.ms}
                baseAt={now}
                running
                short
                style={[styles.miniTime, { color: t.text }]}
              />
              <Text style={[styles.miniState, { color: t.successText }]}>{pill.label}</Text>
            </View>
            <Text style={[styles.line2, { color: t.textTertiary }]} numberOfLines={1}>
              {line1}
            </Text>
          </View>
          <Text
            onPress={() => void startClock(navigation, "out", settings)}
            suppressHighlighting
            accessibilityRole="button"
            style={[styles.miniOut, { backgroundColor: t.dangerBg, color: t.dangerText }]}
          >
            Check out
          </Text>
        </Pressable>
        <View style={styles.miniBar}>
          <ShiftBar fraction={fraction} color={ring} height={6} />
        </View>
      </Card>
    )
  }

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: t.text }]}>Attendance</Text>
        <Text style={[styles.shift, { color: t.textTertiary }]} numberOfLines={1}>
          {shift || "Shift not set"}
        </Text>
        <Tag label={pill.label} tone={pill.tone === "neutral" ? "neutral" : pill.tone} dot />
      </View>
      <View style={styles.body}>
        <View style={styles.facts}>
          <View style={styles.timeRow}>
            <LiveTimer
              baseMs={worked.ms}
              baseAt={now}
              running={!!onDutySince}
              short
              style={[styles.bigTime, { color: t.text }]}
            />
            <Text style={[styles.unit, { color: t.textTertiary }]}>{`hrs ${hours}`}</Text>
          </View>
          <Text style={[styles.line1, { color: t.text }]} numberOfLines={1}>
            {line1}
          </Text>
          <Text style={[styles.line2, { color: t.textSecondary }]} numberOfLines={1}>
            {line2}
          </Text>
        </View>
        <View style={styles.barBlock}>
          <ShiftBar fraction={fraction} color={ring} />
          {shiftStart && shiftEnd ? (
            <View style={styles.ticks}>
              <Text style={[styles.tick, { color: t.textTertiary }]}>{shiftStart}</Text>
              <Text style={[styles.tick, { color: t.textTertiary }]}>{shiftEnd}</Text>
            </View>
          ) : null}
        </View>

        <WeekStatusStrip
          compact
          cells={week}
          onOpen={(day) => navigation.navigate("AttendanceDay", { day })}
        />

        {/* One problem at a time, each with its fix. */}
        {closingSoon ? (
          <ActionAdvisory inCard tone="warning" icon="clock">
            Check out before midnight. After that the day resets and needs a correction
          </ActionAdvisory>
        ) : notices.missedYesterday ? (
          <ActionAdvisory
            inCard
            tone="warning"
            icon="warning"
            onPress={open(() =>
              navigation.navigate("AttendanceCorrection", { day: notices.missedYesterday! }),
            )}
          >
            You did not clock out yesterday. Request a correction
          </ActionAdvisory>
        ) : null}

        {dayDone ? (
          <DayDone
            inAt={summary.firstIn ? clockIST(summary.firstIn) : null}
            outAt={clockIST(summary.lastOut!)}
            onCorrect={open(() =>
              navigation.navigate("AttendanceCorrection", {
                day: today,
                inAt: summary.firstIn,
                outAt: summary.lastOut,
              }),
            )}
          />
        ) : (
          <SlideToConfirm
            label={shut || (onDutySince ? "Slide to check out" : "Slide to check in")}
            tone={onDutySince ? "danger" : "primary"}
            disabled={loading || !!shut}
            hint={onDutySince ? "Scan the office code to check out" : "Scan the office code to check in"}
            onConfirm={() => void startClock(navigation, kind, settings)}
          />
        )}

        <View style={styles.footer}>
          <Icon name="clock" size={14} color={closingSoon ? t.warningText : t.textTertiary} />
          <Text
            style={[textVariants.caption, { color: closingSoon ? t.warningText : t.textTertiary, flex: 1 }]}
            numberOfLines={1}
          >
            {`Open ${clockIST(win.open)} to ${clockIST(win.close)} · out any time`}
            {notices.nextHoliday
              ? ` · ${notices.nextHoliday.name}, ${dayLabel(notices.nextHoliday.day)}`
              : ""}
          </Text>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Attendance history"
            onPress={open(() => navigation.navigate("Attendance"))}
          >
            <Text style={[textVariants.smallStrong, { color: t.primary }]}>History ›</Text>
          </Pressable>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { paddingTop: 14, paddingBottom: 12, marginTop: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  title: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 20 },
  shift: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 17 },
  body: { paddingHorizontal: 16, gap: 12 },
  timeRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  bigTime: { fontFamily: fontFamily.semibold, fontSize: 32, lineHeight: 38, letterSpacing: -0.4 },
  unit: { fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 18 },
  barBlock: { gap: 6 },
  ticks: { flexDirection: "row", justifyContent: "space-between" },
  tick: { fontFamily: fontFamily.regular, fontSize: 11.5, lineHeight: 14 },
  miniWell: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  miniBar: { paddingHorizontal: 14, paddingTop: 10 },
  facts: { flex: 1, gap: 3 },
  line1: { fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 21 },
  line2: { fontFamily: fontFamily.regular, fontSize: 13.5, lineHeight: 18 },
  footer: { flexDirection: "row", alignItems: "center", gap: 6 },
  mini: { paddingVertical: 12, marginTop: spacing.sm },
  miniRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 },
  miniTop: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  miniTime: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 24 },
  miniState: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 17 },
  miniOut: {
    borderRadius: 999,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontFamily: fontFamily.semibold,
    fontSize: 13.5,
  },
})
