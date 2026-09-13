import React from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import type { StatusTone } from "@/theme/theme"
import { font } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

/**
 * The round-ended action under a record's name: Call, WhatsApp, Email, Quote,
 * Print, Preview. One Samsung-Contacts shape for every record page (customer
 * details and quotation details share it), so a rep's thumb learns it once.
 *
 * A solid 76 by 54 stadium in a saturated hue with a white Bold glyph, and the
 * verb under it. The fill is the SATURATED status token (`info`, `success`,
 * `warning`, `danger`), never a tone's `fg`: `fg` is the darkened step made for
 * text on a tinted well, and using it as a fill turns Call and WhatsApp muddy.
 */
export type ActionTone = StatusTone | "primary"

export default function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  icon: IconName
  label: string
  onPress: () => void
  disabled?: boolean
  tone?: ActionTone
}) {
  const t = useTheme()
  const fill: Record<ActionTone, string> = {
    primary: t.primary,
    blue: t.info,
    cyan: t.info,
    violet: t.primary,
    emerald: t.success,
    amber: t.warning,
    rose: t.danger,
    slate: t.muted,
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.root, { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}
    >
      <View style={[styles.pill, { backgroundColor: fill[tone] }]}>
        <Icon name={icon} size={22} color={t.textOnPrimary} variant="Bold" />
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: t.text }]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { alignItems: "center", width: 76 },
  pill: {
    width: 76,
    height: 54,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { marginTop: 7, fontSize: 12, fontFamily: font.semibold },
})
