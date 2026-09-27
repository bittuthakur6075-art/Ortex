import React from "react"
import { Pressable, ScrollView, StyleSheet, Text } from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter } from "@/theme/tokens"
import { fontFamily } from "@/theme/typography"

/**
 * Filter chips that carry their counts ("Sent 12"), so a filter never opens
 * onto an empty list (Figma "Quotations and Leads · One UI lists"). One row that
 * scrolls sideways; the chosen chip is filled with the heading navy.
 */
export default function CountChips<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; count: number }[]
  value: K
  onChange: (key: K) => void
}) {
  const t = useTheme()
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <Pressable
            key={o.key}
            onPress={() => {
              feedback.select()
              onChange(o.key)
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}, ${o.count}`}
            style={[styles.chip, { backgroundColor: on ? t.text : t.surfaceInset }]}
          >
            <Text style={[styles.label, { color: on ? t.surfaceRaised : t.text }]}>{o.label}</Text>
            <Text style={[styles.count, { color: on ? t.textHint : t.textTertiary }]}>{o.count}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: gutter, paddingBottom: 14 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  label: { fontFamily: fontFamily.semibold, fontSize: 13.5, lineHeight: 17 },
  count: { fontFamily: fontFamily.medium, fontSize: 13.5, lineHeight: 17, fontVariant: ["tabular-nums"] },
})
