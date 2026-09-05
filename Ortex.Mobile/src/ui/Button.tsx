import React from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import type { Colors } from "@/theme/theme"
import { radius, size as sizes, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { SquircleBackground } from "@/ui/Squircle"

/**
 * Every action in the app.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppButton.jsx.
 *
 * Shape: a ROUNDED RECTANGLE whose corner steps down with its height — lg 50/10,
 * md 48/8, sm 30/6 (`radius.button*`) — drawn at Figma's 100% smoothing (see
 * Squircle.tsx). Not a capsule: buttons, fields and cards stay in one family of
 * shapes rather than capsules sitting on boxes.
 *
 * `loading` carries BOTH the spinner and the disabled state, and the label stays
 * put rather than swapping to "Saving…" — a label that changes width reflows the
 * footer it sits in.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "outline-danger"
  | "warning"
export type ButtonSize = "sm" | "md" | "lg"

function variantStyle(c: Colors, variant: ButtonVariant, disabled: boolean) {
  // A disabled control is drawn from the theme's muted plane rather than by
  // dropping opacity on the live colours: a translucent brand over a card reads
  // as a rendering fault, not as "unavailable".
  if (disabled) return { bg: c.mutedBg, border: "transparent", fg: c.textTertiary }

  switch (variant) {
    case "secondary":
      // Tonal brand: the ramp's Primary-10 fill, no border, primary text.
      return { bg: c.primary10, border: "transparent", fg: c.primary }
    case "outline":
      return { bg: "transparent", border: c.borderStrong, fg: c.text }
    case "ghost":
      return { bg: "transparent", border: "transparent", fg: c.primary }
    case "danger":
      return { bg: c.danger, border: "transparent", fg: "#FFFFFF" }
    case "outline-danger":
      return { bg: "transparent", border: c.danger, fg: c.danger }
    case "warning":
      return { bg: c.warningBg, border: "transparent", fg: c.warning }
    default:
      return { bg: c.primary, border: "transparent", fg: c.textOnPrimary }
  }
}

type Props = {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  trailingIcon?: IconName
  loading?: boolean
  disabled?: boolean
  /** Stretch to the width of the parent. */
  fullWidth?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

export default function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: Props) {
  const c = useTheme()
  const isDisabled = disabled || loading
  const tone = variantStyle(c, variant, isDisabled)

  const height = size === "md" ? sizes.buttonMd : size === "sm" ? sizes.buttonSm : sizes.buttonLg
  const paddingHorizontal = size === "md" ? spacing.md : size === "sm" ? spacing.sm : spacing.lg
  const textStyle =
    size === "lg" ? textVariants.button : size === "md" ? textVariants.buttonSm : textVariants.buttonXs
  const iconSize = size === "lg" ? 20 : 16
  const cornerRadius = size === "md" ? radius.buttonMd : size === "sm" ? radius.buttonSm : radius.buttonLg

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={isDisabled}
      onPress={
        onPress
          ? () => {
              feedback.tap()
              onPress()
            }
          : undefined
      }
      style={({ pressed }) => [
        styles.button,
        {
          height,
          paddingHorizontal,
          // The FILL and BORDER are drawn by SquircleBackground below, on the
          // 100%-smoothed corner. Painting them here as well would put a
          // circular-cornered rectangle behind the squircle and show as a hard
          // edge at each corner. The radius stays because it is the silhouette
          // SquircleBackground falls back to for the one frame before it has
          // measured itself.
          borderRadius: cornerRadius,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          // Press feedback is a quick dim, not a ripple ring.
          opacity: pressed && !isDisabled ? state.pressedOpacity : 1,
        },
        style,
      ]}
    >
      <SquircleBackground
        fill={tone.bg}
        stroke={tone.border === "transparent" ? undefined : tone.border}
        strokeWidth={1}
        radius={cornerRadius}
      />

      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <>
          {icon ? (
            <View style={{ marginRight: spacing.sm }}>
              <Icon name={icon} size={iconSize} color={tone.fg} variant="Bold" />
            </View>
          ) : null}
          <Text numberOfLines={1} style={[textStyle, { color: tone.fg }]}>
            {label}
          </Text>
          {trailingIcon ? (
            <View style={{ marginLeft: spacing.sm }}>
              <Icon name={trailingIcon} size={iconSize} color={tone.fg} variant="Bold" />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
})
