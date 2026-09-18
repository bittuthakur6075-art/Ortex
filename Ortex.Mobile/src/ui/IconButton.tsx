import React from "react"
import { Animated, Pressable, StyleSheet, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import Icon, { type IconName, type IconVariant } from "@/ui/Icon"
import { usePressMotion } from "@/ui/motion"

type Props = {
  name: IconName
  onPress: () => void
  size?: number
  color?: string
  variant?: IconVariant
  disabled?: boolean
  style?: ViewStyle
  accessibilityLabel?: string
}

export default function IconButton({
  name,
  onPress,
  size = 22,
  color,
  variant,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const t = useTheme()
  const press = usePressMotion({ scale: 0.86, dim: 0.6 })
  return (
    <Pressable
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: t.accentTint, borderless: true, radius: 22 }}
      style={[styles.button, style, { opacity: disabled ? 0.35 : 1 }]}
    >
      {/* The glyph sinks inside a still touch box, so the ripple keeps its circle. */}
      <Animated.View style={press.style}>
        <Icon name={name} size={size} color={color ?? t.text} variant={variant} />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
})
