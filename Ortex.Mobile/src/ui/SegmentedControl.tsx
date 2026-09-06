import React, { memo, useEffect, useRef, useState } from "react"
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { motion, radius } from "@/theme/tokens"
import { font } from "@/theme/typography"

export type SegmentOption<T extends string = string> = {
  key: T
  label: string
}

type Props<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
}

/**
 * Sliding segmented control with an accent-soft lens behind the active
 * segment, like GlassTabBar's lens. Usage:
 * `<SegmentedControl options={[{key:'grid',label:'Grid'},{key:'list',label:'List'}]} value={viewMode} onChange={setViewMode} />`
 *
 * ONE DRIVER, EVERY CHANNEL. A single `slide` value carries the lens across AND
 * cross-fades the labels, so the highlight and the type that sits in it move as
 * one thing. The label swap used to be a hard switch from medium to bold at the
 * moment of the press — the lens glided and the words snapped, which is what
 * made the control read as two animations fighting. Now each segment draws both
 * weights stacked and fades between them on the same curve.
 *
 * The curve is `motion.easeOut` over `motion.normal`, NOT a spring: the design
 * system's rule is that motion is quick and gently decelerating and never
 * bounces, and the old spring overshot its target by a pixel or two at the end
 * of every move.
 *
 * NO SHADOW, deliberately. The lens is a flat accent tint on a filled track —
 * depth in this app comes from layered planes and hairlines. The tab capsule's
 * `barShadow` is the only shadow in the app; see theme/tokens.ts `elevation()`.
 */
function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const t = useTheme()
  const [width, setWidth] = useState(0)
  const index = Math.max(
    0,
    options.findIndex((o) => o.key === value),
  )
  const slide = useRef(new Animated.Value(index)).current

  useEffect(() => {
    Animated.timing(slide, {
      toValue: index,
      duration: motion.normal,
      easing: Easing.bezier(...motion.easeOut),
      useNativeDriver: true,
    }).start()
  }, [index, slide])

  const segmentWidth = options.length > 0 ? width / options.length : 0
  // A one-option control has a degenerate input range, and interpolate() throws
  // on one that does not increase.
  const stops = options.length > 1 ? options.map((_, i) => i) : [0, 1]
  const translateX = slide.interpolate({
    inputRange: stops,
    outputRange: stops.map((i) => i * segmentWidth),
  })

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: t.fieldBg }]}
    >
      {segmentWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.lens,
            {
              width: segmentWidth,
              backgroundColor: t.primary10,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {options.map((option, i) => {
        const active = option.key === value
        // 1 when the lens is over this segment, 0 once it has left — clamped to
        // its neighbours so a three-way move fades the segments it passes.
        const on = slide.interpolate({
          inputRange: options.length > 1 ? [i - 1, i, i + 1] : [-1, 0, 1],
          outputRange: [0, 1, 0],
          extrapolate: "clamp",
        })
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={styles.segment}
          >
            {/* Both weights are laid out in the same box, the bold one absolutely
                positioned over the medium, so the crossfade cannot reflow the
                label — a font swap mid-animation would jog the text sideways. */}
            <Animated.Text
              numberOfLines={1}
              style={[styles.label, { color: t.textSecondary, opacity: Animated.subtract(1, on) }]}
            >
              {option.label}
            </Animated.Text>
            <Animated.Text
              numberOfLines={1}
              pointerEvents="none"
              style={[styles.label, styles.labelActive, { color: t.primary, opacity: on }]}
            >
              {option.label}
            </Animated.Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default memo(SegmentedControl) as typeof SegmentedControl

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    // Both corners are FULLY round, outer and inner: at 16/12 the 4dp inset left
    // a visibly squarer lens inside a rounder track, which reads as two shapes
    // rather than one control with something sliding in it.
    borderRadius: radius.pill,
    padding: 4,
    height: 44,
  },
  lens: {
    position: "absolute",
    top: 4,
    bottom: 4,
    borderRadius: radius.pill,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 13.5,
    fontFamily: font.medium,
  },
  // Stacked on the resting label, not laid out beside it.
  labelActive: {
    position: "absolute",
    fontFamily: font.bold,
  },
})
