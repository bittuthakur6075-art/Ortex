import React from "react"
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { motion, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"

/**
 * The one loader for a whole screen, and the rules it keeps.
 *
 * A list or a record page does NOT use this: those draw a skeleton
 * (`ui/Skeleton.tsx`, `ui/DetailSkeleton.tsx`), because the layout is known and a
 * placeholder of it is a better promise than any indicator. This is for the
 * screens whose layout is not known until the data lands (the startup splash,
 * an editor seeding its form, a document rendering) and where the honest thing
 * to show is "working on it".
 *
 * ⚠️ IT IS A BAR, NOT A SPINNER. A spinner has no direction and no end, which is
 * exactly how a hang looks. A segment travelling along a track reads as progress
 * being made, sits under the wordmark as a single line of the same width (a
 * spinner beside a wordmark is two unrelated shapes), and is the Material
 * indeterminate pattern One UI itself uses for page loads.
 *
 * ⚠️ NOTHING SHOWS FOR THE FIRST `REVEAL_DELAY` ms. Most loads here finish inside
 * that window (a cached collection, a warm session), and an indicator that
 * appears for 150ms and vanishes is a flicker, not feedback. Past that, it fades
 * in. Past `SLOW_AFTER` the label is replaced by `slowLabel`, because a rep on
 * one bar of signal staring at "Loading" for ten seconds cannot tell a slow
 * network from a frozen app, and that is the moment they force-close it.
 *
 * Only transforms and opacity animate, so the native driver runs the loop and a
 * busy JS thread (which is what a load is) cannot stutter it. Reduce-motion swaps
 * the travelling segment for a slow pulse of the whole bar.
 */

/** Hold everything back this long, so a fast load shows nothing at all. */
const REVEAL_DELAY = 400
/** Past this, say the connection is slow rather than repeating "Loading". */
const SLOW_AFTER = 8000
/** One pass of the segment across the track. */
const TRAVEL_MS = 1100
/** The segment's length as a share of the track. */
const SEGMENT_RATIO = 0.38

type Tone = "surface" | "brand"

type BarProps = {
  /** Track width in dp. The segment is sized from it. */
  width: number
  tone?: Tone
}

/** The indeterminate bar on its own, for a caller that lays out its own label. */
export function LoaderBar({ width, tone = "surface" }: BarProps) {
  const t = useTheme()
  const travel = React.useRef(new Animated.Value(0)).current
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((isReduced) => {
        if (cancelled) return
        setReduced(isReduced)
        loop = Animated.loop(
          isReduced
            ? Animated.sequence([
                Animated.timing(travel, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(travel, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
              ])
            : Animated.sequence([
                Animated.timing(travel, {
                  toValue: 1,
                  duration: TRAVEL_MS,
                  easing: Easing.bezier(...motion.easeInOut),
                  useNativeDriver: true,
                }),
                // Snap back unseen: at 0 the segment is parked off the left edge.
                Animated.timing(travel, { toValue: 0, duration: 0, useNativeDriver: true }),
                Animated.delay(180),
              ]),
        )
        loop.start()
      })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [travel])

  const brand = tone === "brand"
  const trackColor = brand ? "rgba(255,255,255,0.22)" : t.primary10
  const segmentColor = brand ? "#FFFFFF" : t.primary
  const segment = width * SEGMENT_RATIO

  return (
    <View style={[styles.track, { width, backgroundColor: trackColor }]}>
      <Animated.View
        style={[
          styles.segment,
          { backgroundColor: segmentColor },
          reduced
            ? { width, opacity: travel.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }) }
            : {
                width: segment,
                transform: [
                  { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [-segment, width] }) },
                ],
              },
        ]}
      />
    </View>
  )
}

type Props = {
  /** What is being waited on, in words: "Loading product", "Rendering". */
  label?: string
  /** Replaces the label once the wait passes `SLOW_AFTER`. */
  slowLabel?: string
  tone?: Tone
  /** Track width. Match it to whatever sits above the bar. */
  width?: number
  /** Skip the reveal delay, for a screen that has already been visible (the splash). */
  immediate?: boolean
  /** Fill and centre in the parent (default). Off when the caller places the block itself. */
  fill?: boolean
}

/**
 * The centred bar-and-label block. It fills its parent and centres itself, so a
 * screen renders `<ScreenLoader label="Loading product" />` in place of its body.
 */
export default function ScreenLoader({
  label,
  slowLabel = "Still working. The connection is slow.",
  tone = "surface",
  width = 148,
  immediate = false,
  fill = true,
}: Props) {
  const t = useTheme()
  const reveal = React.useRef(new Animated.Value(immediate ? 1 : 0)).current
  const [slow, setSlow] = React.useState(false)

  React.useEffect(() => {
    const fade = Animated.timing(reveal, {
      toValue: 1,
      duration: motion.slow,
      delay: immediate ? 0 : REVEAL_DELAY,
      easing: Easing.bezier(...motion.easeOut),
      useNativeDriver: true,
    })
    fade.start()
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER)
    return () => {
      fade.stop()
      clearTimeout(timer)
    }
  }, [reveal, immediate])

  const text = slow ? slowLabel : label
  const textColor = tone === "brand" ? "rgba(255,255,255,0.86)" : t.textSecondary

  return (
    <Animated.View
      style={[fill ? styles.fill : styles.inline, { opacity: reveal }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={text || "Loading"}
    >
      <LoaderBar width={width} tone={tone} />
      {text ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[textVariants.small, styles.label, { color: textColor, maxWidth: width * 1.8 }]}
        >
          {text}
        </Text>
      ) : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inline: {
    alignItems: "center",
  },
  track: {
    height: 3,
    borderRadius: 1.5,
    overflow: "hidden",
  },
  segment: {
    height: 3,
    borderRadius: 1.5,
  },
  label: {
    marginTop: spacing.md,
    textAlign: "center",
  },
})
