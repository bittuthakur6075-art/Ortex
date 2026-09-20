import React from "react"
import { StyleSheet, Text } from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon from "@/ui/Icon"
import { AnimatedPressable, usePressMotion } from "@/ui/motion"

/**
 * Zoho People's one control on the attendance screen: a wide pill that says
 * what it will do, green "Check-in" or red "Check-out". It only starts the
 * existing camera flow (scan the office code, server punch); nothing is marked on
 * the tap itself, so a stray tap costs a screen, not a punch.
 */
export default function CheckButton({
  kind,
  disabled = false,
  onPress,
}: {
  kind: "in" | "out"
  disabled?: boolean
  onPress: () => void
}) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.97, dim: 0.9 })
  const fill = disabled ? t.mutedBg : kind === "in" ? t.success : t.danger
  const ink = disabled ? t.textTertiary : "#FFFFFF"
  const label = kind === "in" ? "Check-in" : "Check-out"
  return (
    <AnimatedPressable
      disabled={disabled}
      onPress={() => {
        feedback.tap()
        onPress()
      }}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Opens the scanner for the office code.`}
      accessibilityState={{ disabled }}
      style={[styles.button, { backgroundColor: fill }, press.style]}
    >
      <Icon name={kind === "in" ? "fingerprint" : "logout"} size={20} color={ink} variant="Bulk" />
      <Text style={[styles.label, { color: ink }]}>{label}</Text>
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  button: {
    height: 54,
    borderRadius: 27,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    alignSelf: "stretch",
  },
  label: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
})
