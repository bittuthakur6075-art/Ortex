import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { STATUS_LABEL, type DayStatus } from "@/domain/attendance"
import { dateOf, statusColors, statusHue, weekdayShort } from "@/features/attendance/format"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"

/**
 * Small pieces shared by the attendance screens: the status chip and pill, the
 * tappable advisory, the shift chip, the date badge and the month's tiles.
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
      <View style={[styles.pillDot, { backgroundColor: statusHue(t, status) }]} />
      <Text style={[textVariants.caption, { color: c.fg, fontFamily: font.semibold }]}>{STATUS_LABEL[status]}</Text>
    </View>
  )
}

/**
 * A small fact on a pill: the shift ("Shift · 9:30 AM to 6:30 PM"), a site.
 * Zoho People heads its check-in screen with the shift as exactly this.
 */
export function InfoChip({
  icon,
  children,
  tone = "neutral",
  align = "center",
}: {
  icon: IconName
  children: string
  tone?: "neutral" | "success" | "danger" | "warning"
  align?: "center" | "start"
}) {
  const t = useTheme()
  const fill =
    tone === "success" ? t.successBg : tone === "danger" ? t.dangerBg : tone === "warning" ? t.warningBg : t.surfaceInset
  const ink =
    tone === "success" ? t.successText : tone === "danger" ? t.dangerText : tone === "warning" ? t.warningText : t.textSecondary
  const glyph = tone === "success" ? t.success : tone === "danger" ? t.danger : tone === "warning" ? t.warning : t.textTertiary
  return (
    <View style={[styles.info, { backgroundColor: fill, alignSelf: align === "start" ? "flex-start" : "center" }]}>
      <Icon name={icon} size={14} color={glyph} variant="Bulk" />
      <Text style={[textVariants.captionStrong, { color: ink, flexShrink: 1 }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  )
}

/**
 * The date as a register reads it: the day of the month over its weekday, on
 * the inset plane (Zoho People's list rows lead with exactly this). Today is
 * drawn in the brand.
 */
export function DateBadge({ day, today = false }: { day: string; today?: boolean }) {
  const t = useTheme()
  return (
    <View style={[styles.date, { backgroundColor: today ? t.primary10 : t.surfaceInset }]}>
      <Text style={[styles.dateNum, { color: today ? t.primary : t.text }]}>{dateOf(day)}</Text>
      <Text style={[styles.dateDow, { color: today ? t.primary : t.textTertiary }]}>{weekdayShort(day).toUpperCase()}</Text>
    </View>
  )
}

export type SummaryTileData = {
  label: string
  value: string
  /** The status whose hue marks the tile; none for a plain figure. */
  status?: DayStatus
  /** The one figure the row is about (payable days): drawn on the brand well. */
  emphasis?: boolean
  /** A second line under the label, in warning ink: "Less 0.5 day". */
  note?: string
}

/**
 * A month's figures as counted tiles, three to a row (Zoho People's month
 * summary). A tile nested inside a panel stays rounded: that is the one place a
 * card shape still belongs.
 */
export function SummaryTiles({ tiles }: { tiles: SummaryTileData[] }) {
  const t = useTheme()
  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => (
        <View key={tile.label} style={styles.tileSlot}>
          <View
            accessibilityLabel={`${tile.label}: ${tile.value}${tile.note ? `, ${tile.note}` : ""}`}
            style={[styles.tile, { backgroundColor: tile.emphasis ? t.primary10 : t.surfaceInset }]}
          >
            <Text style={[styles.tileValue, { color: tile.emphasis ? t.primary : t.text }]}>{tile.value}</Text>
            <View style={styles.tileLabel}>
              {tile.status ? <View style={[styles.tileDot, { backgroundColor: statusHue(t, tile.status) }]} /> : null}
              <Text
                style={[textVariants.caption, { color: tile.emphasis ? t.primary : t.textTertiary, flexShrink: 1 }]}
                numberOfLines={1}
              >
                {tile.label}
              </Text>
            </View>
            {tile.note ? (
              <Text style={[textVariants.caption, { color: t.warningText }]} numberOfLines={1}>
                {tile.note}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
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

const styles = StyleSheet.create({
  chip: { minWidth: 30, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  chipSm: { minWidth: 24, height: 16, paddingHorizontal: 4, borderRadius: 8 },
  chipText: { fontFamily: font.bold, fontSize: 12, lineHeight: 16 },
  chipTextSm: { fontFamily: font.bold, fontSize: 9, lineHeight: 12 },
  pill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  date: { width: 48, height: 52, borderRadius: radius.card, alignItems: "center", justifyContent: "center" },
  dateNum: { fontFamily: font.bold, fontSize: 18, lineHeight: 22, fontVariant: ["tabular-nums"] },
  dateDow: { fontFamily: font.semibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.4 },
  tiles: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: gutter - 4, paddingBottom: gutter - 4 },
  tileSlot: { width: "33.333%", padding: 4 },
  tile: { borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 12, gap: 2, minHeight: 72 },
  tileValue: { fontFamily: font.bold, fontSize: 20, lineHeight: 26, fontVariant: ["tabular-nums"] },
  tileLabel: { flexDirection: "row", alignItems: "center", gap: 6 },
  tileDot: { width: 7, height: 7, borderRadius: 3.5 },
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
