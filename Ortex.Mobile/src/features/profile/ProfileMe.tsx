import { useFocusEffect } from "@react-navigation/native"
import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { dayKey } from "@/domain/attendance"
import { roleLabel } from "@/domain/modules"
import { hoursShort } from "@/features/attendance/format"
import { workedMs } from "@/features/attendance/progress"
import { useAttendanceToday } from "@/features/attendance/useAttendance"
import { feedback } from "@/lib/feedback"
import * as leave from "@/lib/leave"
import { latestPayslip } from "@/lib/pay"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Avatar, PanelBand } from "@/ui"

const SINCE = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" })
const PAYDAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })

type Tone = "success" | "warning" | "neutral"
type Stat = { key: string; label: string; value: string; sub: string; tone: Tone; onPress: () => void }

/**
 * The head of Profile (Figma "Profile V2"): the face beside the name, the email,
 * the role and when the person joined, then their day in three figures:
 * attendance today, leave left, the last payday. Each figure opens its page,
 * which is why the three rows that used to say the same thing are gone.
 *
 * The figures are read the same way their pages read them, so they can never
 * disagree: `useAttendanceToday` for today, `balances()` for leave (paid types
 * only, since loss of pay is not a balance) and `latestPayslip()` for pay.
 */
export default function ProfileMe({
  name,
  email,
  photo,
  role,
  joined,
  onPhoto,
  onOpen,
}: {
  name: string
  email: string
  photo?: string
  role?: string
  joined?: string
  onPhoto: () => void
  onOpen: (screen: "Attendance" | "Leave" | "Pay") => void
}) {
  const t = useTheme()
  const { summary, punches, onDutySince, now, loading } = useAttendanceToday()
  const [left, setLeft] = React.useState<{ days: number; pending: number } | null>(null)
  const [paidOn, setPaidOn] = React.useState<string | null | undefined>(undefined)

  useFocusEffect(
    React.useCallback(() => {
      let alive = true
      void leave
        .balances()
        .then((rows) => {
          if (!alive) return
          const paid = rows.filter((r) => r.paid)
          setLeft({
            days: paid.reduce((s, r) => s + (r.available || 0), 0),
            pending: paid.reduce((s, r) => s + (r.pending || 0), 0),
          })
        })
        .catch(() => alive && setLeft(null))
      void latestPayslip().then((s) => alive && setPaidOn(s?.released_at ?? null))
      return () => {
        alive = false
      }
    }, []),
  )

  const worked = workedMs(dayKey(now), punches, now).ms / 60000
  const stats: Stat[] = [
    {
      key: "attendance",
      label: "Attendance",
      value: loading ? "…" : onDutySince || summary.lastOut ? hoursShort(worked) : "Not in",
      sub: onDutySince ? "Checked in" : summary.lastOut ? "Checked out" : "Not checked in",
      tone: onDutySince ? "success" : summary.lastOut ? "neutral" : "warning",
      onPress: () => onOpen("Attendance"),
    },
    {
      key: "leave",
      label: "Leave",
      value: left ? `${Number(left.days.toFixed(1))} days` : "…",
      sub: left?.pending ? `${left.pending} pending` : "None pending",
      tone: left?.pending ? "warning" : "neutral",
      onPress: () => onOpen("Leave"),
    },
    {
      key: "pay",
      label: "Pay",
      value: paidOn === undefined ? "…" : paidOn ? PAYDAY.format(new Date(paidOn)) : "None yet",
      sub: paidOn ? "Last payday" : "No payslip yet",
      tone: "neutral",
      onPress: () => onOpen("Pay"),
    },
  ]
  const dot: Record<Tone, string> = { success: t.success, warning: t.warning, neutral: t.textFaint }
  const ink: Record<Tone, string> = {
    success: t.successText,
    warning: t.warningText,
    neutral: t.textTertiary,
  }

  return (
    <>
      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <View style={styles.who}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            hitSlop={6}
            onPress={() => {
              feedback.tap()
              onPhoto()
            }}
          >
            <Avatar name={name} uri={photo} size={72} edit />
          </Pressable>
          <View style={styles.whoText}>
            <Text style={[textVariants.subtitle, { color: t.text }]} numberOfLines={1}>
              {name}
            </Text>
            {!!email && email !== name && (
              <Text style={[textVariants.small, { color: t.textSecondary }]} numberOfLines={1}>
                {email}
              </Text>
            )}
            <View style={styles.roleRow}>
              {!!role && (
                <View style={[styles.role, { backgroundColor: t.primary10 }]}>
                  <Text style={[textVariants.captionStrong, { color: t.primary }]}>{roleLabel(role)}</Text>
                </View>
              )}
              {!!joined && (
                <Text style={[textVariants.caption, { color: t.textTertiary }]}>{`Since ${SINCE.format(
                  new Date(joined),
                )}`}</Text>
              )}
            </View>
          </View>
        </View>

        <View style={[styles.rule, { backgroundColor: t.border }]} />

        <View style={styles.stats}>
          {stats.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => {
                feedback.tap()
                s.onPress()
              }}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}: ${s.value}, ${s.sub}`}
              style={({ pressed }) => [
                styles.stat,
                i === 0 ? styles.firstStat : { borderLeftWidth: 1, borderLeftColor: t.border },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[textVariants.sectionLabel, { color: t.textTertiary }]}>
                {s.label.toUpperCase()}
              </Text>
              <Text style={[textVariants.subtitle, { color: t.text }]} numberOfLines={1}>
                {s.value}
              </Text>
              <View style={styles.subRow}>
                <View style={[styles.dot, { backgroundColor: dot[s.tone] }]} />
                <Text style={[textVariants.caption, { color: ink[s.tone] }]} numberOfLines={1}>
                  {s.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
      <PanelBand />
    </>
  )
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: gutter, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.md },
  who: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  whoText: { flex: 1, minWidth: 0, gap: 2 },
  roleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, marginTop: 4 },
  role: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  rule: { height: StyleSheet.hairlineWidth },
  stats: { flexDirection: "row" },
  stat: { flex: 1, minWidth: 0, gap: 2, paddingHorizontal: spacing.sm },
  firstStat: { paddingLeft: 0 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
