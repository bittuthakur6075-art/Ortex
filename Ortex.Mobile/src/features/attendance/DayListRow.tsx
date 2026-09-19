import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { clockIST, STATUS_LABEL } from "@/domain/attendance"
import { dateOf, dayLabel, hoursShort, statusColors, statusHue, weekdayShort } from "@/features/attendance/format"
import { spanOnShift, type MonthEntry } from "@/features/attendance/month"
import type { ShiftSettings } from "@/features/attendance/progress"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"

const pct = (f: number) => `${(Math.min(1, Math.max(0, f)) * 100).toFixed(2)}%` as `${number}%`

/**
 * One day in the month list, Zoho People's signature row: the date column (the
 * day of the month large, its weekday under it), then the day itself, either a
 * timeline across the shift with the worked span in the status colour and the
 * check-in and check-out times at its two ends, or, for a weekend, holiday,
 * leave or absent day, a tinted band with the word. The hours sit on the right.
 * The whole row opens the day.
 */
export default function DayListRow({
  entry,
  settings,
  today,
  now,
  onPress,
}: {
  entry: MonthEntry
  settings: ShiftSettings
  today: boolean
  now: number
  onPress: () => void
}) {
  const t = useTheme()
  const press = usePressMotion({ scale: 1, dim: 0.7 })
  const row = entry.row
  const minutes = row?.worked_min || 0
  const status = entry.kind === "empty" ? null : entry.status
  const hue = status ? statusHue(t, status) : t.borderStrong

  let middle: React.ReactNode
  let spoken: string
  if (entry.kind === "worked") {
    const span = spanOnShift(entry.day, row?.first_in, row?.last_out, settings, now)
    const inAt = row?.first_in ? clockIST(row.first_in) : "-"
    const outAt = row?.last_out ? clockIST(row.last_out) : today ? "Now" : "No check-out"
    spoken = `${STATUS_LABEL[entry.status]}, in ${inAt}, out ${outAt}`
    middle = (
      <View style={styles.timeline}>
        <View style={[styles.track, { backgroundColor: t.fieldBg }]}>
          {span && (
            <View
              style={[
                styles.fill,
                { left: pct(span.left), width: pct(span.width), backgroundColor: hue, opacity: span.open ? 0.75 : 1 },
              ]}
            />
          )}
        </View>
        <View style={styles.ends}>
          <Text style={[styles.time, { color: t.textSecondary }]} numberOfLines={1}>
            {inAt}
          </Text>
          {row?.late ? (
            <Text style={[styles.time, { color: t.warningText }]} numberOfLines={1}>
              {`Late ${hoursShort(row.late_min || 0)}`}
            </Text>
          ) : entry.status !== "P" ? (
            <Text style={[styles.time, { color: statusColors(t, entry.status).fg }]} numberOfLines={1}>
              {STATUS_LABEL[entry.status]}
            </Text>
          ) : null}
          <Text style={[styles.time, { color: row?.last_out ? t.textSecondary : t.warningText }]} numberOfLines={1}>
            {outAt}
          </Text>
        </View>
      </View>
    )
  } else if (entry.kind === "band") {
    const c = statusColors(t, entry.status)
    spoken = entry.label
    middle = (
      <View style={[styles.band, { backgroundColor: c.bg }]}>
        <View style={[styles.bandDot, { backgroundColor: hue }]} />
        <Text style={[textVariants.captionStrong, { color: c.fg, flexShrink: 1 }]} numberOfLines={1}>
          {entry.label}
        </Text>
      </View>
    )
  } else {
    spoken = "Nothing recorded"
    middle = (
      <View style={styles.timeline}>
        <View style={[styles.track, { backgroundColor: t.fieldBg }]} />
        <Text style={[styles.time, { color: t.textTertiary }]}>{today ? "Not checked in yet" : "Nothing recorded"}</Text>
      </View>
    )
  }

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(entry.day)}, ${spoken}${minutes ? `, ${hoursShort(minutes)} worked` : ""}`}
      style={[styles.row, { backgroundColor: t.surface }, press.style]}
    >
      <View style={styles.date}>
        <Text style={[styles.dateNum, { color: today ? t.primary : t.text }]}>{dateOf(entry.day)}</Text>
        <Text style={[styles.dateDow, { color: today ? t.primary : t.textTertiary }]}>
          {today ? "TODAY" : weekdayShort(entry.day).toUpperCase()}
        </Text>
      </View>
      <View style={styles.middle}>{middle}</View>
      <View style={styles.value}>
        <Text style={[styles.hours, { color: minutes ? t.text : t.textFaint }]}>{minutes ? hoursShort(minutes) : "0h"}</Text>
        <Text style={[textVariants.caption, { color: t.textTertiary }]}>Hrs</Text>
      </View>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: gutter, paddingVertical: 12 },
  date: { width: 40, alignItems: "center" },
  dateNum: { fontFamily: font.bold, fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"] },
  dateDow: { fontFamily: font.semibold, fontSize: 10, lineHeight: 13, letterSpacing: 0.4 },
  middle: { flex: 1, minWidth: 0 },
  timeline: { gap: 6 },
  track: { height: 8, borderRadius: 4, overflow: "hidden", position: "relative" },
  fill: { position: "absolute", top: 0, bottom: 0, borderRadius: 4 },
  ends: { flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  time: { fontFamily: font.medium, fontSize: 11, lineHeight: 14, fontVariant: ["tabular-nums"] },
  band: { flexDirection: "row", alignItems: "center", gap: 8, height: 34, borderRadius: 10, paddingHorizontal: 12 },
  bandDot: { width: 7, height: 7, borderRadius: 3.5 },
  value: { width: 56, alignItems: "flex-end" },
  hours: { fontFamily: font.semibold, fontSize: 15, lineHeight: 20, fontVariant: ["tabular-nums"] },
})
