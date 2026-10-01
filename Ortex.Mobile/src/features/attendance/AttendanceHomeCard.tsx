import { useNavigation } from "@react-navigation/native"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { clockIST, dayKey } from "@/domain/attendance"
import { ActionAdvisory, DayDone } from "@/features/attendance/attendanceUi"
import { LiveTimer, ShiftBar } from "@/features/attendance/LiveProgress"
import {
  autoPresentClock,
  countFromFor,
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
import { useAuth } from "@/store/AuthContext"
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
  const { session } = useAuth()
  const [expanded, setExpanded] = React.useState(false)

  const today = dayKey(now)
  const shiftMin = shiftMinutes(settings, today)
  const worked = workedMs(today, punches, now, countFromFor(settings, today))

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
  const hours = `of ${Math.round(shiftMin / 60)} h shift`
  const shiftStart = settings.shift?.start ? shiftClock(settings.shift.start) : ""
  const shiftEnd = settings.shift?.end ? shiftClock(settings.shift.end) : ""
  // The bar's end labels already show the shift, so the lines never repeat it.
  const noShift = shift ? null : "Shift not set"
  const shiftFrom = settings.shift?.start ? Date.parse(`${today}T${settings.shift.start}:00+05:30`) : NaN
  const shiftTo = settings.shift?.end ? Date.parse(`${today}T${settings.shift.end}:00+05:30`) : NaN
  // Where now falls in the shift, for the bar's tick; none once the day is done.
  const elapsed = dayDone || !(shiftTo > shiftFrom) ? undefined : (now - shiftFrom) / (shiftTo - shiftFrom)
  // Marked present by the Super Admin (0056): the server counts every working
  // day as P, so a day with no check-in is not "Missed", and with no punch of
  // their own the day runs by the shift clock (autoPresentClock).
  const auto = autoPresentClock(settings, session?.user?.id, today, notices.nextHoliday?.day === today, now)
  const autoPresent = !!auto
  const autoDay = !!auto && !loading && !onDutySince && !dayDone && auto.to > auto.from
  const autoRunning = autoDay && auto.running
  const shownMs = autoDay ? auto.ms : worked.ms
  const fraction = shiftMin > 0 ? shownMs / MINUTE / shiftMin : 0
  const shiftBegun = !!settings.shift?.start && now >= Date.parse(`${today}T${settings.shift.start}:00+05:30`)

  // The state: a pill, the bar's colour, and at most two lines that say the
  // rest. Each line adds something the pill and the bar do not already say.
  let pill: { label: string; tone: "success" | "neutral" | "warning" }
  let ring: string
  let line1: string
  let line2: string | null
  if (loading) {
    pill = { label: "Loading", tone: "neutral" }
    ring = t.primary
    line1 = "Checking today"
    line2 = noShift
  } else if (onDutySince) {
    pill = { label: summary.field ? "Field" : "On duty", tone: "success" }
    ring = closingSoon ? t.warning : t.success
    line1 = `In at ${clockIST(summary.firstIn || onDutySince)} · ${where}`
    line2 = progressWords(worked.ms / MINUTE, shiftMin, shiftEnded(settings, today, now))
  } else if (dayDone) {
    pill = { label: "Done", tone: "neutral" }
    ring = t.success
    line1 = `In ${summary.firstIn ? clockIST(summary.firstIn) : "not recorded"} · out ${clockIST(
      summary.lastOut!,
    )}`
    line2 = progressWords(worked.ms / MINUTE, shiftMin, shiftEnded(settings, today, now))
  } else if (autoRunning) {
    pill = { label: "On duty", tone: "success" }
    ring = t.success
    line1 = `In at ${shiftStart}`
    line2 = progressWords(shownMs / MINUTE, shiftMin, false)
  } else if (autoDay && auto.ended) {
    pill = { label: "Done", tone: "neutral" }
    ring = t.success
    line1 = `In ${shiftStart} · out ${shiftEnd}`
    line2 = progressWords(shownMs / MINUTE, shiftMin, true)
  } else if (autoPresent) {
    pill = { label: "Present", tone: "success" }
    ring = t.success
    line1 = shiftStart ? `Starts automatically at ${shiftStart}` : "Marked present for today"
    line2 = null
  } else if (now < win.open) {
    pill = { label: `Opens ${clockIST(win.open)}`, tone: "neutral" }
    ring = t.primary
    line1 = `Check-in opens at ${clockIST(win.open)}`
    line2 = noShift
  } else if (now > win.close) {
    pill = { label: "Missed", tone: "warning" }
    ring = t.primary
    line1 = "You did not check in today"
    line2 = null
  } else {
    pill = { label: "Not in", tone: "warning" }
    ring = t.primary
    line1 = shiftStart
      ? `Shift ${shiftBegun ? "started" : "starts"} at ${shiftStart}`
      : "Check in to start your day"
    line2 = noShift
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
        <View style={styles.flex} />
        <Tag label={pill.label} tone={pill.tone === "neutral" ? "neutral" : pill.tone} dot />
      </View>
      <View style={styles.body}>
        <View style={styles.facts}>
          <View style={styles.timeRow}>
            <LiveTimer
              baseMs={shownMs}
              baseAt={now}
              running={!!onDutySince || autoRunning}
              short
              style={[styles.bigTime, { color: t.text }]}
            />
            <Text style={[styles.unit, { color: t.textTertiary }]}>{hours}</Text>
          </View>
          <Text style={[styles.line1, { color: t.text }]} numberOfLines={1}>
            {line1}
          </Text>
          {line2 ? (
            <Text style={[styles.line2, { color: t.textSecondary }]} numberOfLines={1}>
              {line2}
            </Text>
          ) : null}
        </View>
        <View style={styles.barBlock}>
          <ShiftBar fraction={fraction} color={ring} elapsed={elapsed} />
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
        ) : shut || (autoPresent && !onDutySince) ? null : (
          // Outside the window the lines above say when it opens; a disabled
          // slider still read as one to slide (phone, 2026-09-27).
          <SlideToConfirm
            label={onDutySince ? "Slide to check out" : "Slide to check in"}
            tone={onDutySince ? "danger" : "primary"}
            disabled={loading}
            hint={onDutySince ? "Scan the office code to check out" : "Scan the office code to check in"}
            onConfirm={() => void startClock(navigation, kind, settings)}
          />
        )}

        <View style={styles.footer}>
          <Icon name="clock" size={16} color={closingSoon ? t.warningText : t.textSecondary} variant="Bulk" />
          <Text
            style={[styles.footerText, { color: closingSoon ? t.warningText : t.textSecondary }]}
            numberOfLines={1}
          >
            {`Check-in ${clockIST(win.open)} to ${clockIST(win.close)}`}
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
  flex: { flex: 1 },
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
  footerText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
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
