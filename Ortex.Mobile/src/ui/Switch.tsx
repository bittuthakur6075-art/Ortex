import React, { memo } from "react"
import { StyleSheet, Switch as RNSwitch, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"

type Props = {
  value: boolean
  onValueChange: (next: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
}

/**
 * Themed switch, optionally with a settings-row label. Usage:
 * `<Switch value={sound} onValueChange={setSound} label="Sound effects" description="Play a sound on actions" />`
 */
function Switch({ value, onValueChange, label, description, disabled }: Props) {
  const t = useTheme()

  const control = (
    <RNSwitch
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      trackColor={{ false: t.cardBorder, true: t.accentSoft }}
      thumbColor={value ? t.accent : t.textTertiary}
      ios_backgroundColor={t.cardBorder}
    />
  )

  if (!label) return control

  return (
    <View style={[styles.row, { opacity: disabled ? 0.5 : 1 }]}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: t.text }]}>{label}</Text>
        {!!description && <Text style={[styles.description, { color: t.textTertiary }]}>{description}</Text>}
      </View>
      {control}
    </View>
  )
}

export default memo(Switch)

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  text: {
    flex: 1,
    marginRight: 12,
  },
  label: {
    fontSize: 15.5,
    fontFamily: font.medium,
  },
  description: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: font.regular,
  },
})
