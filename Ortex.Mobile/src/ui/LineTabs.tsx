import React, { memo, useEffect, useRef, useState } from "react"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { motion, size } from "@/theme/tokens"
import { font } from "@/theme/typography"
import type { SegmentOption } from "@/ui/SegmentedControl"

/**
 * An underline tab strip, for a switch that has left the content and become
 * part of the app bar.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\components\base\AppTabsLine.js.
 *
 * NOT A `SegmentedControl` VARIANT. The pill is a control sitting in content: it
 * has a track and reads as a thing you operate. This strip is CHROME: no
 * container, it lives on the bar's own plane and reads as where you are. The two
 * are used together on one screen — the pill scrolls away and this pins under
 * the bar in its place (AppScreen's `stickyBar`) — so they must be told apart at
 * a glance, which one component with a `tone` flag would have made impossible.
 *
 * Both run their indicator on the SAME curve (`motion.normal` / `motion.easeOut`)
 * so whichever of the two a rep touches, the switch moves the same way. Capnix
 * used a spring here; this app's motion rule is that nothing bounces, so it
 * follows SegmentedControl instead. Retune one, retune both.
 */

/**
 * Short because it sits UNDER the 56dp bar rather than beside it: a 44 strip put
 * ~13dp of air between the bar and the label, so the tabs read as a separate
 * band. `HIT_SLOP` gives the touch target back without giving the air back —
 * HEIGHT + 2 × HIT_SLOP must equal `size.touchMin`.
 */
const HEIGHT = 30
const HIT_SLOP = (size.touchMin - HEIGHT) / 2
const INDICATOR_HEIGHT = 3

type Props<T extends string> = {
  options: SegmentOption<T>[]
  value: T
  onChange: (next: T) => void
  style?: StyleProp<ViewStyle>
}

function LineTabs<T extends string>({ options, value, onChange, style }: Props<T>) {
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

  const count = Math.max(1, options.length)
  const cellWidth = width / count
  // interpolate() throws on a range that does not increase, which one option is.
  const stops = options.length > 1 ? options.map((_, i) => i) : [0, 1]

  return (
    // The caller's style (the gutter) goes on an OUTER box and the cells and
    // indicator are measured INSIDE it: measured on the padded box, the
    // indicator was a third of the padding wider and started at the screen
    // edge, so it sat left of a label that was itself centred.
    <View style={style}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={styles.row}>
        {options.map((option, i) => {
          const active = option.key === value
          // Two stacked copies of the label, the active one faded in as the
          // indicator arrives: a hard colour swap lands before the indicator does.
          const on = slide.interpolate({
            inputRange: options.length > 1 ? [i - 1, i, i + 1] : [-1, 0, 1],
            outputRange: [0, 1, 0],
            extrapolate: "clamp",
          })
          return (
            <Pressable
              key={option.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              hitSlop={{ top: HIT_SLOP, bottom: HIT_SLOP }}
              // A tick only when the switch actually MOVES.
              onPress={() => {
                if (!active) feedback.select()
                onChange(option.key)
              }}
              style={styles.cell}
            >
              <Animated.Text
                numberOfLines={1}
                style={[styles.label, { color: t.textSecondary, opacity: Animated.subtract(1, on) }]}
              >
                {option.label}
              </Animated.Text>
              {/* The bold copy fills the whole cell and centres ITSELF, with the
                cell's own padding. An absolutely positioned Text with no insets
                is placed at the content box's start, not centred by the parent's
                alignItems, so the active label sat off to one side. */}
              <Animated.View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.activeLayer, { opacity: on }]}
              >
                <Text numberOfLines={1} style={[styles.label, styles.labelActive, { color: t.primary }]}>
                  {option.label}
                </Text>
              </Animated.View>
            </Pressable>
          )
        })}

        {/* Drawn LAST so it sits over the strip's bottom rule rather than under
          it, and rounded on top only: a mark applied to the rule, which is what
          an underline tab is, not a very short pill. */}
        {cellWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: cellWidth,
                backgroundColor: t.primary,
                transform: [
                  {
                    translateX: slide.interpolate({
                      inputRange: stops,
                      outputRange: stops.map((i) => i * cellWidth),
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
      </View>
    </View>
  )
}

export default memo(LineTabs) as typeof LineTabs

const styles = StyleSheet.create({
  row: { height: HEIGHT, flexDirection: "row" },
  cell: {
    flex: 1,
    height: HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    // The indicator owns the bottom 3dp; centring in the WHOLE row would sit the
    // label 1.5dp low against its own rule.
    paddingBottom: INDICATOR_HEIGHT,
  },
  // Android pads ascent and descent asymmetrically, which drops the label inside
  // its box. Same fix as the app bar title.
  label: {
    fontSize: 13.5,
    fontFamily: font.medium,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  labelActive: { fontFamily: font.bold },
  activeLayer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingBottom: INDICATOR_HEIGHT,
  },
  indicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: INDICATOR_HEIGHT,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
})
