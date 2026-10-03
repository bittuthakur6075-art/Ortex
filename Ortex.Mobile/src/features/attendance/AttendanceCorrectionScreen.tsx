import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { dayKey } from "@/domain/attendance"
import { DateBadge, InfoChip } from "@/features/attendance/attendanceUi"
import { clock12, dayLabel, istHHMM, istISO, stepClock } from "@/features/attendance/format"
import { feedback } from "@/lib/feedback"
import { loadSettings, myCorrections, requestCorrection } from "@/lib/attendance"
import type { StackScreenProps } from "@/navigation/types"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AppScreen, Button, Panel, SquircleBackground, Switch, TextField, useToast } from "@/ui"

const pad = (hhmm: string) => hhmm.padStart(5, "0")

/**
 * "I forgot to clock out at 6:30": the person's own request to correct one day
 * (regularise_request, migration 0034). An admin decides it; approving puts
 * the times in place of the punches they correct (0065), so the day recomputes
 * from the same source as any other. Asked on the phone only, like every other
 * attendance write.
 *
 * There is no native time picker in this app, so a time is stepped: 15 minutes
 * or an hour at a time, from what the day already knows. A check-in that was
 * never recorded starts unchosen: pre-filling the shift start would, once
 * approved, erase a late mark nobody asked to erase. Times stay on the day
 * itself; anything past midnight is an admin's to sort out, and the form says
 * so rather than guessing a date.
 */
export default function AttendanceCorrectionScreen({ navigation, route }: StackScreenProps<"AttendanceCorrection">) {
  const { day, inAt, outAt } = route.params
  const t = useTheme()
  const toast = useToast()

  const [useIn, setUseIn] = React.useState(!inAt)
  const [useOut, setUseOut] = React.useState(true)
  // Null until chosen: the stepper then starts from the shift start.
  const [inTime, setInTime] = React.useState<string | null>(inAt ? istHHMM(inAt) : null)
  const [inBase, setInBase] = React.useState("09:30")
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
        loadSettings().catch(() => null),
        myCorrections({ from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` }).catch(() => []),
      ])
      if (!alive) return
      if (s?.shift?.start) setInBase(pad(s.shift.start))
      if (!outAt && s?.shift?.end) setOutTime(pad(s.shift.end))
      const used = mine.filter((c) => c.status === "pending" || c.status === "approved").length
      setLeft({ used, cap: s?.correctionsPerMonth ?? 3 })
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
    if (useIn && !inTime) return "Choose the time you came in."
    if (useIn && useOut && inTime && outTime <= inTime) return "The time you left must be after the time you came in."
    if (isToday && ((useIn && inTime && inTime > nowHHMM) || (useOut && outTime > nowHHMM))) return "A time today cannot be later than now."
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
        inAt: useIn && inTime ? istISO(day, inTime) : null,
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
            switchLabel="Correct the time I came in"
            hint={inAt ? `Recorded: ${clock12(istHHMM(inAt))}` : "No clock-in was recorded"}
            enabled={useIn}
            onToggle={setUseIn}
            value={inTime}
            base={inBase}
            onChange={setInTime}
          />
          <View style={[styles.rule, { backgroundColor: t.divider }]} />
          <TimeRow
            label="Left at"
            switchLabel="Correct the time I left"
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

      <Panel title="What Happened">
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
        <View style={styles.error}>
          <SquircleBackground fill={t.dangerBg} radius={radius.card} />
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
  switchLabel,
  hint,
  enabled,
  onToggle,
  value,
  base,
  onChange,
}: {
  label: string
  switchLabel: string
  hint: string
  enabled: boolean
  onToggle: (v: boolean) => void
  /** Null: not chosen yet. The first step moves from `base`. */
  value: string | null
  base?: string
  onChange: (v: string) => void
}) {
  const t = useTheme()
  const step = (m: number) => {
    feedback.tap()
    onChange(stepClock(value ?? base ?? "09:30", m))
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.rowHead}>
        <View style={{ flex: 1 }}>
          <Text style={[textVariants.listTitle, { color: t.text }]}>{label}</Text>
          <Text style={[textVariants.caption, { color: t.textTertiary }]}>{hint}</Text>
        </View>
        <Switch value={enabled} onValueChange={onToggle} accessibilityLabel={switchLabel} />
      </View>
      {enabled && (
        <View style={styles.stepper}>
          <StepButton text="-1h" onPress={() => step(-60)} label={`${label}: one hour earlier`} />
          <StepButton text="-15m" onPress={() => step(-15)} label={`${label}: 15 minutes earlier`} />
          <View style={styles.time}>
            <SquircleBackground fill={t.fieldBg} radius={radius.card} />
            <Text style={[styles.timeText, { color: t.text }]} accessibilityLiveRegion="polite">
              {value ? clock12(value) : "Choose"}
            </Text>
          </View>
          <StepButton text="+15m" onPress={() => step(15)} label={`${label}: 15 minutes later`} />
          <StepButton text="+1h" onPress={() => step(60)} label={`${label}: one hour later`} />
        </View>
      )}
    </View>
  )
}

function StepButton({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  const t = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: t.accentTint, borderless: true, radius: 26 }}
      style={({ pressed }) => [styles.stepBtn, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.stepText, { color: t.primary }]}>{text}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: gutter, paddingBottom: spacing.md, gap: spacing.md },
  dayHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: gutter },
  rule: { height: 1 },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  time: {
    minWidth: 104,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  timeText: { fontFamily: font.semibold, fontSize: 20, lineHeight: 26 },
  stepBtn: { minWidth: 48, height: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  stepText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 19 },
  error: { marginHorizontal: gutter, marginTop: spacing.md, padding: 12 },
  footer: { paddingHorizontal: gutter, paddingTop: spacing.lg },
})
