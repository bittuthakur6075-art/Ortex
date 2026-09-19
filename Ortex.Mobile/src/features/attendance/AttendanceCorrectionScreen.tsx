import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { dayKey } from "@/domain/attendance"
import { DateBadge, InfoChip } from "@/features/attendance/attendanceUi"
import { clock12, dayLabel, istHHMM, istISO, stepClock } from "@/features/attendance/format"
import { feedback } from "@/lib/feedback"
import { loadSettings, myCorrections, requestCorrection } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, Button, IconButton, Panel, Switch, TextField, useToast } from "@/ui"

/**
 * "I forgot to clock out at 6:30": the person's own request to correct one day
 * (regularise_request, migration 0034). An admin decides it; approving applies
 * the times as punches, so the day recomputes from the same source as any
 * other. Asked on the phone only, like every other attendance write.
 *
 * There is no native time picker in this app, so a time is stepped: 15 minutes
 * or an hour at a time, from a sensible start (what the day already knows, or
 * the shift). Times stay on the day itself; anything past midnight is an
 * admin's to sort out, and the form says so rather than guessing a date.
 */
export default function AttendanceCorrectionScreen({ navigation, route }: StackScreenProps<"AttendanceCorrection">) {
  const { day, inAt, outAt } = route.params
  const t = useTheme()
  const toast = useToast()

  const [useIn, setUseIn] = React.useState(!inAt)
  const [useOut, setUseOut] = React.useState(true)
  const [inTime, setInTime] = React.useState(inAt ? istHHMM(inAt) : "09:30")
  const [outTime, setOutTime] = React.useState(outAt ? istHHMM(outAt) : "18:30")
  const [reason, setReason] = React.useState("")
  const [left, setLeft] = React.useState<{ used: number; cap: number } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Start from the shift the Super Admin set, when the day has nothing better.
  React.useEffect(() => {
    let alive = true
    void (async () => {
      const month = day.slice(0, 7)
      const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
      const [s, mine] = await Promise.all([
        loadSettings(),
        myCorrections({ from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` }).catch(() => []),
      ])
      if (!alive) return
      if (!inAt && s.shift?.start) setInTime(s.shift.start)
      if (!outAt && s.shift?.end) setOutTime(s.shift.end)
      const used = mine.filter((c) => c.status === "pending" || c.status === "approved").length
      setLeft({ used, cap: s.correctionsPerMonth ?? 3 })
    })()
    return () => {
      alive = false
    }
  }, [day, inAt, outAt])

  // The moment the form opened, read once (not on every render).
  const [openedAt] = React.useState(() => Date.now())
  const isToday = day === dayKey(openedAt)
  const nowHHMM = istHHMM(openedAt)

  const problem = (() => {
    if (!useIn && !useOut) return "Choose the time you came in, the time you left, or both."
    if (useIn && useOut && outTime <= inTime) return "The time you left must be after the time you came in."
    if (isToday && ((useIn && inTime > nowHHMM) || (useOut && outTime > nowHHMM))) return "A time today cannot be later than now."
    if (reason.trim().length < 3) return "Say briefly what happened, so the admin can approve it."
    if (left && left.used >= left.cap) return `You have used all ${left.cap} corrections for this month.`
    return null
  })()

  const submit = async () => {
    if (problem) {
      setError(problem)
      feedback.error()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestCorrection({
        day,
        inAt: useIn ? istISO(day, inTime) : null,
        outAt: useOut ? istISO(day, outTime) : null,
        reason,
      })
      feedback.created()
      toast.show({ message: "Correction sent. An admin will review it.", tone: "success" })
      navigation.goBack()
    } catch (e) {
      feedback.error()
      setError(e instanceof Error ? e.message : "Your correction was not sent. Try again.")
      setBusy(false)
    }
  }

  const remaining = left ? Math.max(0, left.cap - left.used) : null

  return (
    <AppScreen title="Request correction" subtitle={dayLabel(day)} back onBack={() => navigation.goBack()} inTabs={false}>
      <Panel>
        <View style={styles.dayHead}>
          <DateBadge day={day} today={isToday} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[textVariants.listTitle, { color: t.text }]}>Attendance correction</Text>
            <Text style={[textVariants.small, { color: t.textSecondary }]}>
              {`Recorded: in ${inAt ? clock12(istHHMM(inAt)) : "none"}, out ${outAt ? clock12(istHHMM(outAt)) : "none"}`}
            </Text>
            {remaining !== null && (
              <InfoChip icon="edit" tone={remaining ? "neutral" : "warning"} align="start">
                {`${remaining} of ${left!.cap} corrections left this month`}
              </InfoChip>
            )}
          </View>
        </View>
      </Panel>
      <Panel title="Times" meta="India time">
        <View style={styles.body}>
          <TimeRow
            label="Came in at"
            hint={inAt ? `Recorded: ${clock12(istHHMM(inAt))}` : "No clock-in was recorded"}
            enabled={useIn}
            onToggle={setUseIn}
            value={inTime}
            onChange={setInTime}
          />
          <View style={[styles.rule, { backgroundColor: t.divider }]} />
          <TimeRow
            label="Left at"
            hint={outAt ? `Recorded: ${clock12(istHHMM(outAt))}` : "No clock-out was recorded"}
            enabled={useOut}
            onToggle={setUseOut}
            value={outTime}
            onChange={setOutTime}
          />
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>
            Times stay on this day. Left after midnight? Ask an admin to correct it for you.
          </Text>
        </View>
      </Panel>

      <Panel title="What happened">
        <View style={styles.body}>
          <TextField
            value={reason}
            onChangeText={(v) => {
              setReason(v)
              setError(null)
            }}
            placeholder="For example: phone battery died before I could clock out"
            multiline
            maxLength={500}
          />
        </View>
      </Panel>

      {!!error && (
        <View style={[styles.error, { backgroundColor: t.dangerBg }]}>
          <Text style={[textVariants.small, { color: t.dangerText }]}>{error}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Button label="Send correction" onPress={() => void submit()} loading={busy} fullWidth />
      </View>
    </AppScreen>
  )
}

function TimeRow({
  label,
  hint,
  enabled,
  onToggle,
  value,
  onChange,
}: {
  label: string
  hint: string
  enabled: boolean
  onToggle: (v: boolean) => void
  value: string
  onChange: (v: string) => void
}) {
  const t = useTheme()
  const step = (m: number) => {
    feedback.tap()
    onChange(stepClock(value, m))
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.rowHead}>
        <View style={{ flex: 1 }}>
          <Text style={[textVariants.listTitle, { color: t.text }]}>{label}</Text>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{hint}</Text>
        </View>
        <Switch value={enabled} onValueChange={onToggle} />
      </View>
      {enabled && (
        <View style={styles.stepper}>
          <IconButton name="minus" onPress={() => step(-60)} accessibilityLabel={`${label}: one hour earlier`} />
          <IconButton name="minus" size={16} onPress={() => step(-15)} accessibilityLabel={`${label}: 15 minutes earlier`} />
          <View style={[styles.time, { backgroundColor: t.fieldBg }]}>
            <Text style={[styles.timeText, { color: t.text }]} accessibilityLiveRegion="polite">
              {clock12(value)}
            </Text>
          </View>
          <IconButton name="add" size={16} onPress={() => step(15)} accessibilityLabel={`${label}: 15 minutes later`} />
          <IconButton name="add" onPress={() => step(60)} accessibilityLabel={`${label}: one hour later`} />
        </View>
      )}
      {enabled && (
        <Text style={[textVariants.caption, styles.stepHint, { color: t.textTertiary }]}>
          Small buttons move 15 minutes, large ones an hour.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  dayHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: gutter },
  rule: { height: 1 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  time: {
    minWidth: 120,
    height: 48,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  timeText: { fontFamily: font.semibold, fontSize: 22, lineHeight: 28 },
  stepHint: { textAlign: "center" },
  error: { marginHorizontal: gutter, marginTop: spacing.md, padding: 12, borderRadius: radius.card },
  footer: { paddingHorizontal: gutter, paddingTop: spacing.lg },
})
