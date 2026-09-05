import React, { memo } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger"
export type ButtonSize = "sm" | "md" | "lg"

type Props = {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  loading?: boolean
  disabled?: boolean
  fullWidth?: boolean
  style?: ViewStyle
  accessibilityLabel?: string
}

const SIZES: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; fontSize: number; iconSize: number }
> = {
  sm: { height: 36, paddingHorizontal: 14, fontSize: 13, iconSize: 16 },
  md: { height: 46, paddingHorizontal: 18, fontSize: 15, iconSize: 18 },
  lg: { height: 54, paddingHorizontal: 22, fontSize: 16.5, iconSize: 20 },
}

/**
 * Primary button used across the app. Usage:
 * `<Button label="Save" onPress={onSave} variant="primary" icon="tick" />`
 */
function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth,
  style,
  accessibilityLabel,
}: Props) {
  const t = useTheme()
  const dims = SIZES[size]
  const isDisabled = disabled || loading

  const tones = {
    primary: { bg: t.accent, pressedBg: t.accentPressed, text: "#FFFFFF", border: "transparent" },
    secondary: { bg: t.accentSoft, pressedBg: t.accentSoft, text: t.accent, border: "transparent" },
    outline: { bg: "transparent", pressedBg: t.ripple, text: t.text, border: t.cardBorder },
    ghost: { bg: "transparent", pressedBg: t.ripple, text: t.text, border: "transparent" },
    danger: { bg: t.danger, pressedBg: t.danger, text: "#FFFFFF", border: "transparent" },
  }[variant]

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      android_ripple={variant === "ghost" || variant === "outline" ? { color: t.ripple } : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          height: dims.height,
          paddingHorizontal: dims.paddingHorizontal,
          backgroundColor: pressed && !isDisabled ? tones.pressedBg : tones.bg,
          borderColor: tones.border,
          borderWidth: tones.border === "transparent" ? 0 : 1,
          opacity: isDisabled ? 0.45 : pressed ? 0.9 : 1,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tones.text} size="small" />
      ) : (
        <View style={styles.content}>
          {icon && (
            <View style={styles.icon}>
              <Icon name={icon} size={dims.iconSize} color={tones.text} />
            </View>
          )}
          <Text numberOfLines={1} style={[styles.label, { color: tones.text, fontSize: dims.fontSize }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export default memo(Button)

const styles = StyleSheet.create({
  base: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 8,
  },
  label: {
    fontFamily: font.semibold,
  },
})
