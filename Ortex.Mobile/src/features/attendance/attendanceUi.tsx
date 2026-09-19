import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { STATUS_LABEL, type DayStatus } from "@/domain/attendance"
import { statusColors } from "@/features/attendance/format"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"

/**
 * Small pieces shared by the attendance screens (phase 2): the status chip, the
 * tappable advisory, and the IST date/time helpers the correction form needs.
 * Kept here, not in domain/attendance.ts, because that file is mirrored to the
 * console line for line and these are phone-only.
 */

/** "P" on its tinted well: the code a register reads, with its name for screen readers. */
export function StatusChip({ status, size = "md" }: { status: DayStatus; size?: "sm" | "md" }) {
  const t = useTheme()
  const c = statusColors(t, status)
  return (
    <View
      accessibilityLabel={STATUS_LABEL[status]}
      style={[styles.chip, size === "sm" && styles.chipSm, { backgroundColor: c.bg }]}
    >
      <Text style={[size === "sm" ? styles.chipTextSm : styles.chipText, { color: c.fg }]}>{status}</Text>
    </View>
  )
}

/** "Present" with its chip: a badge whose words say what the code means. */
export function StatusPill({ status }: { status: DayStatus }) {
  const t = useTheme()
  const c = statusColors(t, status)
  return (
    <View style={[styles.pill, { backgroundColor: c.bg }]}>
      <Text style={[textVariants.caption, { color: c.fg, fontFamily: font.semibold }]}>{STATUS_LABEL[status]}</Text>
    </View>
  )
}

/**
 * An advisory that is also the action: "You did not clock out yesterday.
 * Request a correction" is one tap to the form, not a sentence to act on
 * elsewhere. Loose content between panels, so it carries the page gutter.
 */
export function ActionAdvisory({
  tone,
  icon,
  children,
  onPress,
}: {
  tone: "warning" | "info"
  icon: IconName
  children: string
  onPress?: () => void
}) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.985, dim: 0.85 })
  const fill = tone === "warning" ? t.warningBg : t.iconWell
  const ink = tone === "warning" ? t.warningText : t.primary
  const body = (
    <>
      <Icon name={icon} size={18} color={ink} variant="Bulk" />
      <Text style={[textVariants.small, styles.advisoryText, { color: ink }]}>{children}</Text>
      {onPress ? <Icon name="forward" size={16} color={ink} /> : null}
    </>
  )
  if (!onPress) return <View style={[styles.advisory, { backgroundColor: fill }]}>{body}</View>
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      style={[styles.advisory, { backgroundColor: fill }, press.style]}
    >
      {body}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  chip: { minWidth: 30, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  chipSm: { minWidth: 24, height: 16, paddingHorizontal: 4, borderRadius: 8 },
  chipText: { fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
  chipTextSm: { fontFamily: font.bold, fontSize: 9, lineHeight: 12 },
  pill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  advisory: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.card,
    marginHorizontal: gutter,
    marginBottom: spacing.sm,
  },
  advisoryText: { flex: 1 },
})

/**
 * Clock-ins saved on the phone with no signal (lib/attendanceQueue.ts): how
 * many are waiting, a tap to send them now, and why one could not be sent.
 */
export function QueueAdvisory({
  queue,
}: {
  queue: { items: unknown[]; syncing: boolean; lastIssue: string | null; sendNow: () => Promise<void> }
}) {
  const n = queue.items.length
  return (
    <>
      {n > 0 && (
        <ActionAdvisory tone="warning" icon="refresh" onPress={queue.syncing ? undefined : () => void queue.sendNow()}>
          {queue.syncing
            ? "Sending your saved clock-in"
            : `${n} ${n === 1 ? "clock-in" : "clock-ins"} waiting to send. Tap to send now.`}
        </ActionAdvisory>
      )}
      {!!queue.lastIssue && n === 0 && (
        <ActionAdvisory tone="warning" icon="warning">
          {`A saved clock-in could not be sent: ${queue.lastIssue}`}
        </ActionAdvisory>
      )}
    </>
  )
}
