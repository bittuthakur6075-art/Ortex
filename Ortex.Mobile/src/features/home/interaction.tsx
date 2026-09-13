import React from "react"
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"

import { DURATION, EASE, SPRING, useFadeUp, useFollow, useReducedMotion } from "@/features/home/motion"

/** The dashboard's interactive pieces: the finger tooltip, counting figures and press feedback. The gestures and timing behind them, and why, are in motion.ts. */

// ---- counting number ----------------------------------------------------------------

/**
 * A figure that counts to its value, from zero on first show, from the old
 * value when it changes, so a range switch visibly moves the number rather
 * than swapping one string for another. Formatting is the caller's (₹1.2L,
 * "42%"), applied to every intermediate frame.
 */
export function CountUp({
  value,
  format,
  style,
  duration = 650,
  numberOfLines = 1,
  adjustsFontSizeToFit,
}: {
  value: number
  format: (n: number) => string
  style?: StyleProp<TextStyle>
  duration?: number
  numberOfLines?: number
  adjustsFontSizeToFit?: boolean
}) {
  const reduce = useReducedMotion()
  const [shown, setShown] = React.useState(reduce ? value : 0)
  const from = React.useRef(reduce ? value : 0)

  React.useEffect(() => {
    if (reduce || !Number.isFinite(value)) {
      from.current = value
      setShown(value)
      return
    }
    const start = from.current
    const began = Date.now()
    let frame = 0
    const tick = () => {
      const p = Math.min(1, (Date.now() - began) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const next = start + (value - start) * eased
      from.current = next
      setShown(next)
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration, reduce])

  return (
    <Text style={style} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit}>
      {format(shown)}
    </Text>
  )
}

// ---- press feedback ------------------------------------------------------------------

/**
 * A Pressable that gives under the thumb: a quick spring down to 0.96 and back,
 * plus the light haptic every press in the app carries. For tiles, shortcuts and
 * the call button, anything that is a target rather than a row.
 */
export function PressScale({
  onPress,
  children,
  style,
  scaleTo = 0.96,
  accessibilityLabel,
  accessibilityRole = "button",
  hitSlop,
}: {
  onPress?: () => void
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  scaleTo?: number
  accessibilityLabel?: string
  accessibilityRole?: "button" | "link"
  hitSlop?: number
}) {
  const scale = React.useRef(new Animated.Value(1)).current
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, ...SPRING.press, useNativeDriver: true }).start()
  return (
    <Pressable
      onPress={() => {
        feedback.tap()
        onPress?.()
      }}
      onPressIn={() => to(scaleTo)}
      onPressOut={() => to(1)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
      disabled={!onPress}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  )
}

// ---- the tooltip bubble ----------------------------------------------------------------

export type TooltipRow = { color?: string; label: string; value: string; line?: boolean }

/**
 * The bubble a finger raises on a chart: inverse ink (dark on a light page,
 * light on a dark one) so it separates from every mark under it with no shadow,
 * a title, one row per series with its key, and an optional footer line.
 *
 * It MOVES NATIVELY. The bubble is laid out once at the chart's origin and
 * placed with translateX/translateY that spring between data points
 * (`SPRING.follow`), so it glides from day to day instead of jumping, and a busy
 * JS thread cannot make it stutter. The first point of a new scrub (`fresh`)
 * places it without a slide, so it never flies in from where it was last time.
 * Appearing is a spring from 0.94 plus a fade; leaving is a quicker fade.
 */
export function ChartTooltip({
  visible,
  fresh = false,
  x,
  y,
  bounds,
  title,
  rows,
  footer,
}: {
  visible: boolean
  /** The first point of this touch: place it, do not slide it there. */
  fresh?: boolean
  /** The data point, in the chart's own coordinates. */
  x: number
  y: number
  /** The chart's width, to keep the bubble on screen. */
  bounds: number
  title: string
  rows: TooltipRow[]
  footer?: string
}) {
  const t = useTheme()
  const reduce = useReducedMotion()
  const [size, setSize] = React.useState({ w: 0, h: 0 })
  const show = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    if (reduce) {
      show.setValue(visible ? 1 : 0)
      return
    }
    if (visible) Animated.spring(show, { toValue: 1, ...SPRING.pop, useNativeDriver: true }).start()
    else Animated.timing(show, { toValue: 0, duration: DURATION.fade, easing: EASE, useNativeDriver: true }).start()
  }, [visible, reduce, show])

  const ARROW = 6
  const left = Math.max(0, Math.min(bounds - size.w, x - size.w / 2))
  const top = y - size.h - ARROW - 8
  const arrow = Math.max(10, Math.min(size.w - 10, x - left)) - ARROW

  const tx = useFollow(left, fresh || !size.w)
  const ty = useFollow(top, fresh || !size.h)
  const ax = useFollow(arrow, fresh || !size.w)

  const bg = t.text
  const fg = t.textInverse

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout
        if (width !== size.w || height !== size.h) setSize({ w: width, h: height })
      }}
      style={[
        styles.bubble,
        {
          backgroundColor: bg,
          // Hidden until measured, so the first frame is never in the wrong place.
          opacity: size.w ? show : 0,
          transform: [
            { translateX: tx },
            { translateY: Animated.add(ty, show.interpolate({ inputRange: [0, 1], outputRange: [6, 0] })) },
            { scale: show.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${title}. ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}${footer ? `. ${footer}` : ""}`}
    >
      <Text style={[textVariants.captionStrong, { color: fg, opacity: 0.72 }]} numberOfLines={1}>
        {title}
      </Text>
      {rows.map((r) => (
        <View key={r.label} style={styles.bubbleRow}>
          {r.color ? (
            <View style={[r.line ? styles.bubbleLine : styles.bubbleSwatch, { backgroundColor: r.color }]} />
          ) : null}
          <Text style={[textVariants.caption, styles.bubbleLabel, { color: fg }]} numberOfLines={1}>
            {r.label}
          </Text>
          <Text style={[textVariants.smallStrong, { color: fg }]}>{r.value}</Text>
        </View>
      ))}
      {footer ? (
        <Text style={[textVariants.captionStrong, styles.bubbleFooter, { color: fg }]} numberOfLines={1}>
          {footer}
        </Text>
      ) : null}
      <Animated.View
        style={[
          styles.arrow,
          {
            borderTopColor: bg,
            borderLeftWidth: ARROW,
            borderRightWidth: ARROW,
            borderTopWidth: ARROW,
            transform: [{ translateX: ax }],
          },
        ]}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  bubble: {
    position: "absolute",
    left: 0,
    top: 0,
    zIndex: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 120,
    maxWidth: 240,
  },
  bubbleRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 6 },
  bubbleSwatch: { width: 8, height: 8, borderRadius: 2 },
  bubbleLine: { width: 12, height: 2, borderRadius: 1 },
  bubbleLabel: { flex: 1, marginRight: spacing.sm },
  bubbleFooter: { marginTop: 6 },
  arrow: {
    position: "absolute",
    left: 0,
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
})

/**
 * A block of content arriving after its skeleton: fades up 8dp on EASE instead
 * of popping in, with `order` steps of stagger so stacked panels arrive in
 * reading order.
 */
export function FadeIn({ children, order = 0 }: { children: React.ReactNode; order?: number }) {
  const style = useFadeUp(order)
  return <Animated.View style={style}>{children}</Animated.View>
}
