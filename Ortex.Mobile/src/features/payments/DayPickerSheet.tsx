import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { monthBounds, monthGrid } from "@/domain/attendance"
import { dayLabel } from "@/features/attendance/format"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { IconButton, Sheet } from "@/ui"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/**
 * One day from a month calendar, the same grid as Apply leave (`monthGrid`),
 * in a sheet. Days outside `min`..`max` (yyyy-mm-dd) cannot be picked.
 */
export default function DayPickerSheet({
  visible,
  value,
  min,
  max,
  onPick,
  onClose,
}: {
  visible: boolean
  value: string
  min: string
  max: string
  onPick: (day: string) => void
  onClose: () => void
}) {
  const t = useTheme()
  const [month, setMonth] = React.useState(() => value.slice(0, 7))
  React.useEffect(() => {
    if (visible) setMonth(value.slice(0, 7))
  }, [visible, value])

  const [y, m] = month.split("-").map(Number)
  const bounds = monthBounds(y, m)
  const weeks = monthGrid(y, m, [])
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    feedback.select()
    setMonth(d.toISOString().slice(0, 7))
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Payment date">
      <View style={styles.switcher}>
        <IconButton
          name="back"
          onPress={() => shift(-1)}
          disabled={bounds.from <= min}
          accessibilityLabel="Previous month"
        />
        <Text style={[textVariants.cardTitle, { color: t.text }]}>{bounds.label}</Text>
        <IconButton
          name="forward"
          onPress={() => shift(1)}
          disabled={bounds.to >= max}
          accessibilityLabel="Next month"
        />
      </View>
      <View style={styles.calendar}>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={[styles.dow, { color: t.textTertiary }]}>
              {w}
            </Text>
          ))}
        </View>
        {weeks.map((week, i) => (
          <View key={i} style={styles.weekRow}>
            {week.map((cell) => {
              const selected = cell.day === value
              const out = cell.day < min || cell.day > max
              return (
                <Pressable
                  key={cell.day}
                  disabled={!cell.inMonth || out}
                  onPress={() => {
                    feedback.select()
                    onPick(cell.day)
                    onClose()
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: out }}
                  accessibilityLabel={dayLabel(cell.day)}
                  style={[
                    styles.cell,
                    { backgroundColor: selected ? t.primary : "transparent" },
                    cell.day === max && !selected && { borderWidth: 2, borderColor: t.primary },
                    !cell.inMonth && { opacity: 0 },
                    cell.inMonth && out && { opacity: 0.3 },
                  ]}
                >
                  <Text style={[styles.date, { color: selected ? t.textOnPrimary : t.text }]}>{cell.date}</Text>
                </Pressable>
              )
            })}
          </View>
        ))}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  switcher: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: -10,
  },
  calendar: { paddingBottom: spacing.md, gap: 6 },
  weekRow: { flexDirection: "row", gap: 6 },
  dow: { flex: 1, textAlign: "center", fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
  cell: { flex: 1, aspectRatio: 1, borderRadius: radius.card, alignItems: "center", justifyContent: "center" },
  date: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16, fontVariant: ["tabular-nums"] },
})
