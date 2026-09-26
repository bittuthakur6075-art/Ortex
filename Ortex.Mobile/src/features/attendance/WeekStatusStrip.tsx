import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { STATUS_LABEL, type DayStatus } from "@/domain/attendance"
import { dateOf, dayLabel, hoursShort, statusColors, statusHue } from "@/features/attendance/format"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"

export type WeekCell = {
  day: string
  /** "Mon" */
  label: string
  minutes: number
  today: boolean
  future: boolean
  /** What the day counts as, when the server (or the punches) say so. */
  status: DayStatus | null
  /** A coming holiday: drawn dashed, because it has not happened yet. */
  planned?: DayStatus | null
}

/**
 * Monday to Sunday as Zoho People draws it: the weekday, then the date on its
 * status colour (the tinted well with its readable ink), today ringed in the
 * brand, a short bar in the status colour, and the hours under each. A past day or today opens that day; a day
 * still to come is quiet and does nothing. Status is only drawn where a row
 * (or the punches) says what the day was; nothing is guessed.
 */
export default function WeekStatusStrip({
  cells,
  onOpen,
  compact = false,
}: {
  cells: WeekCell[]
  onOpen: (day: string) => void
  /** The Home card: letter and date only, today filled in the brand, no bar or hours. */
  compact?: boolean
}) {
  const t = useTheme()
  return (
    <View style={styles.row}>
      {cells.map((c) => {
        const colors = c.status ? statusColors(t, c.status) : null
        const planned = !c.status && c.planned ? statusColors(t, c.planned) : null
        const label = `${dayLabel(c.day)}${
          c.status ? `, ${STATUS_LABEL[c.status]}` : c.planned ? `, ${STATUS_LABEL[c.planned]}` : ""
        }${c.minutes ? `, ${hoursShort(c.minutes)} worked` : ""}`
        return (
          <Pressable
            key={c.day}
            disabled={c.future}
            onPress={() => {
              feedback.tap()
              onOpen(c.day)
            }}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={styles.col}
          >
            <Text
              style={[
                styles.dow,
                {
                  color: c.today ? t.primary : c.future ? t.textFaint : t.textTertiary,
                  fontFamily: c.today ? font.semibold : font.medium,
                },
              ]}
            >
              {c.label.slice(0, 1)}
            </Text>
            <View
              style={[
                styles.date,
                { backgroundColor: colors ? colors.bg : c.future ? "transparent" : t.fieldBg },
                planned && { borderWidth: 1.5, borderStyle: "dashed", borderColor: planned.fg },
                compact && styles.dateCompact,
                compact && c.future && !planned && { borderWidth: 1, borderColor: t.border },
                c.today &&
                  (compact
                    ? { backgroundColor: t.primary, borderWidth: 0 }
                    : { borderWidth: 2, borderColor: t.primary }),
              ]}
            >
              <Text
                style={[
                  styles.dateText,
                  {
                    color:
                      compact && c.today
                        ? t.textOnPrimary
                        : colors
                        ? colors.fg
                        : planned
                        ? planned.fg
                        : c.future
                        ? t.textFaint
                        : t.textSecondary,
                  },
                ]}
              >
                {dateOf(c.day)}
              </Text>
            </View>
            {!compact && (
              <>
                <View
                  style={[
                    styles.bar,
                    {
                      backgroundColor: c.status
                        ? statusHue(t, c.status)
                        : c.planned
                        ? statusHue(t, c.planned)
                        : c.future
                        ? "transparent"
                        : t.fieldBg,
                      opacity: !c.status && c.planned ? 0.5 : 1,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.hours,
                    { color: c.future ? t.textFaint : c.minutes ? t.textSecondary : t.textTertiary },
                  ]}
                >
                  {c.future ? " " : c.minutes ? hoursShort(c.minutes) : "0h"}
                </Text>
              </>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

/** The week strip's legend: only the statuses the strip actually shows. */
export function StatusLegend({ statuses }: { statuses: DayStatus[] }) {
  const t = useTheme()
  if (!statuses.length) return null
  return (
    <View style={styles.legend}>
      {statuses.map((s) => (
        <View key={s} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: statusHue(t, s) }]} />
          <Text style={[styles.legendText, { color: t.textTertiary }]}>{STATUS_LABEL[s]}</Text>
        </View>
      ))}
    </View>
  )
}

const DATE = 38

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  col: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 2 },
  dow: { fontSize: 12, lineHeight: 16 },
  date: { width: DATE, height: DATE, borderRadius: DATE / 2, alignItems: "center", justifyContent: "center" },
  dateCompact: { width: 36, height: 36, borderRadius: 18 },
  dateText: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18, fontVariant: ["tabular-nums"] },
  bar: { width: 20, height: 4, borderRadius: 2 },
  hours: { fontFamily: font.regular, fontSize: 10, lineHeight: 13, fontVariant: ["tabular-nums"] },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 6,
    columnGap: spacing.md,
    rowGap: spacing.xs,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
})
