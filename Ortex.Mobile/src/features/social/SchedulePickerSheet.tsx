import React from "react"
import { ScrollView, StyleSheet, Text, View } from "react-native"

import { SUGGESTED_TIMES, scheduleDays, scheduleTimes, whenLabel } from "@/domain/social"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { Button, Chip, Sheet } from "@/ui"

/**
 * When a post goes out: a day, then a time. Built from chips rather than a
 * native date picker (none is installed, and a native module means a new APK):
 * the next 14 days, the half hours from 7 am to 10:30 pm, and three suggested
 * slots. Today only offers times at least 20 minutes away, because the publish
 * sweep runs every 15 minutes.
 */
export default function SchedulePickerSheet({
  visible,
  value,
  onClose,
  onPick,
}: {
  visible: boolean
  value: string | null
  onClose: () => void
  /** An ISO time, or null for "no schedule, publish by hand". */
  onPick: (iso: string | null) => void
}) {
  const t = useTheme()
  // A fresh "now" each time the sheet opens, so today's times are current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = React.useMemo(() => new Date(), [visible])
  const days = React.useMemo(() => scheduleDays(now), [now])

  const initialDay = React.useMemo(() => {
    if (!value) return days[0]?.key
    const d = new Date(value)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    return days.some((x) => x.key === key) ? key : days[0]?.key
  }, [value, days])

  const [dayKey, setDayKey] = React.useState(initialDay)
  React.useEffect(() => {
    if (visible) setDayKey(initialDay)
  }, [visible, initialDay])

  const day = days.find((d) => d.key === dayKey) ?? days[0]
  const times = React.useMemo(() => (day ? scheduleTimes(day.date, now) : []), [day, now])
  const suggested = times.filter((x) => SUGGESTED_TIMES.includes(x.key))
  const selectedKey = value ? new Date(value).toTimeString().slice(0, 5) : ""
  const sameDay = value && initialDay === dayKey

  const pick = (at: Date) => {
    feedback.select()
    onPick(at.toISOString())
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Schedule">
      {value ? (
        <Text style={[textVariants.caption, styles.current, { color: t.textSecondary }]}>Now set for {whenLabel(value)}</Text>
      ) : null}

      <Text style={[textVariants.captionStrong, styles.label, { color: t.text }]}>Day</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        {days.map((d) => (
          <Chip
            key={d.key}
            label={d.label}
            active={d.key === dayKey}
            onPress={() => {
              feedback.select()
              setDayKey(d.key)
            }}
          />
        ))}
      </ScrollView>

      {suggested.length > 0 && (
        <>
          <Text style={[textVariants.captionStrong, styles.label, { color: t.text }]}>Good times to post</Text>
          <View style={styles.wrap}>
            {suggested.map((x) => (
              <Chip key={x.key} label={x.label} icon="star" active={Boolean(sameDay && selectedKey === x.key)} onPress={() => pick(x.at)} />
            ))}
          </View>
        </>
      )}

      <Text style={[textVariants.captionStrong, styles.label, { color: t.text }]}>Time</Text>
      {times.length ? (
        <View style={styles.wrap}>
          {times.map((x) => (
            <Chip key={x.key} label={x.label} small active={Boolean(sameDay && selectedKey === x.key)} onPress={() => pick(x.at)} />
          ))}
        </View>
      ) : (
        <Text style={[textVariants.caption, styles.empty, { color: t.textTertiary }]}>
          No times left today. Pick another day.
        </Text>
      )}

      <View style={styles.footer}>
        <Button
          label={value ? "Remove schedule (publish by hand)" : "No schedule (publish by hand)"}
          variant="secondary"
          fullWidth
          onPress={() => {
            feedback.select()
            onPick(null)
          }}
        />
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  current: { paddingHorizontal: gutter, marginBottom: spacing.xs },
  label: { paddingHorizontal: gutter, marginTop: spacing.sm, marginBottom: spacing.xs },
  rail: { paddingHorizontal: gutter, gap: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: gutter },
  empty: { paddingHorizontal: gutter },
  footer: { paddingHorizontal: gutter, paddingTop: spacing.lg, paddingBottom: spacing.sm },
})
