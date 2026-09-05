import React from "react"
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { radius, spacing, state } from "@/theme/tokens"
import { SquircleBackground, type SquircleCorners } from "@/ui/Squircle"

/**
 * A content surface.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppCard.jsx.
 *
 * Two forms:
 *
 *   default   — `radius.card` (12) with a hairline border on `surface`. 12, NOT
 *               One UI's 26: at 26 the corner swallows the 2px gutter between
 *               grouped rows and the group reads as a stack of lozenges rather
 *               than one object.
 *   squircle  — transparent background with the fill drawn by SquircleBackground
 *               at `radius.lg` (20) and 100% smoothing, and NO border: the
 *               borderless "floating on a wash" look.
 *
 * The squircle form DRAWS, it does not clip — see Squircle.tsx. Anything relying
 * on clipping its children to the corner wants the default form.
 */

type Props = {
  children: React.ReactNode
  onPress?: () => void
  /** 16 by default; pass 0 for a card that manages its own padding. */
  padding?: number
  /** Sit on the inset plane rather than the surface. */
  inset?: boolean
  /** Draw the 100%-smoothed corner instead of a bordered rectangle. */
  squircle?: boolean
  squircleRadius?: number
  squircleCorners?: SquircleCorners
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

export default function Card({
  children,
  onPress,
  padding = spacing.md,
  inset = false,
  squircle = false,
  squircleRadius,
  squircleCorners,
  style,
  accessibilityLabel,
}: Props) {
  const c = useTheme()
  const fill = inset ? c.surfaceInset : c.surface
  const corner = squircleRadius ?? radius.lg

  const body = squircle ? (
    <>
      <SquircleBackground fill={fill} radius={corner} corners={squircleCorners} />
      <View style={{ padding }}>{children}</View>
    </>
  ) : (
    <View style={{ padding }}>{children}</View>
  )

  const boxStyle: StyleProp<ViewStyle> = [
    squircle
      ? { backgroundColor: "transparent", borderRadius: corner }
      : {
          backgroundColor: fill,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          overflow: "hidden",
        },
    style,
  ]

  if (!onPress) return <View style={boxStyle}>{body}</View>

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [boxStyle, { opacity: pressed ? state.pressedOpacity : 1 }]}
    >
      {body}
    </Pressable>
  )
}
