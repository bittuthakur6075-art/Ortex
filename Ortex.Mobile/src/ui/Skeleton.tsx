import React from "react"
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native"

import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"

/**
 * Loading placeholders, and the rule they follow.
 *
 * A skeleton is not a grey rectangle that says "wait". It is a PROMISE ABOUT
 * THE LAYOUT: what appears when the data lands must arrive in the shape the
 * placeholder drew, or the page jumps and the skeleton has made things worse
 * than a spinner would. So the pieces here mirror real components —
 * `SkeletonRow` is `ListRow`'s geometry to the pixel (38dp well, 20dp gutter,
 * 16dp vertical padding), `SkeletonPanel` is `Panel`'s.
 *
 * Three rules, taken from how the good ones actually behave (Zomato, eBay,
 * Babbel, AllTrails on Mobbin):
 *
 *   1. CHROME STAYS REAL. The app bar, the back arrow, the tab bar and the page
 *      title are not waiting on the network — they are known the moment the
 *      screen is pushed. Skeletonising them fakes uncertainty the app does not
 *      have, and costs the person the back arrow at exactly the moment a slow
 *      screen makes them want it.
 *   2. BARS OF UNEVEN WIDTH READ AS TEXT; full-width blocks read as images.
 *      A column of identical bars reads as neither, which is why the generic
 *      72dp blocks this file used to hand out told you nothing about what was
 *      coming.
 *   3. THE PAGE BREATHES AS ONE. Every block is driven by the single shared
 *      loop below rather than its own, so a screenful pulses in lockstep. Ten
 *      independent loops drift apart within a second or two and the page
 *      shimmers like static.
 *
 * The pulse is opacity, not a moving highlight: a sweeping gradient needs a
 * masked linear-gradient per block, and on a mid-range Android that is a real
 * cost on the exact screens that are slow already.
 */

// ---- the shared driver -----------------------------------------------------

const PULSE_MS = 850

const pulse = new Animated.Value(0)
let loop: Animated.CompositeAnimation | null = null
let mounted = 0

/**
 * Ref-counted so the loop runs only while something is on screen. An animation
 * left running behind a loaded page keeps the JS thread ticking for nothing.
 */
function useSharedPulse() {
  React.useEffect(() => {
    mounted += 1
    if (!loop) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: PULSE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: PULSE_MS,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      )
      loop.start()
    }
    return () => {
      mounted -= 1
      if (mounted === 0 && loop) {
        loop.stop()
        loop = null
        pulse.setValue(0)
      }
    }
  }, [])

  return pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] })
}

// ---- the primitive ---------------------------------------------------------

type BlockProps = {
  width?: number | `${number}%`
  height?: number
  radius?: number
  style?: StyleProp<ViewStyle>
}

/**
 * One placeholder block. Usage: `<Skeleton width="80%" height={16} radius={8} />`
 */
function Skeleton({ width = "100%", height = 16, radius: r = 8, style }: BlockProps) {
  const t = useTheme()
  const opacity = useSharedPulse()

  return (
    <Animated.View
      style={[{ width, height, borderRadius: r, backgroundColor: t.fieldBg, opacity }, style]}
    />
  )
}

export default React.memo(Skeleton)

// ---- composed shapes -------------------------------------------------------

/**
 * Title/subtitle widths cycle through a fixed set rather than being random:
 * random widths re-roll on every re-render and the placeholder visibly twitches
 * while it waits. Uneven, but the same uneven each time.
 */
const TITLE_WIDTHS = ["72%", "54%", "83%", "61%", "77%"] as const
const SUB_WIDTHS = ["41%", "33%", "48%", "37%", "44%"] as const

export type SkeletonRowProps = {
  /** Which leading slot the real row draws: the 38dp icon well, a photo, or none. */
  leading?: "well" | "photo" | "avatar" | "none"
  /** The real row's photo/avatar edge, when it is not the 38dp well. */
  leadingSize?: number
  /** The real row carries a right-hand figure and caption. */
  value?: boolean
  /** Index into the width cycle, so a column of rows is not a column of clones. */
  index?: number
}

/**
 * `ListRow`'s geometry as a placeholder. Keep the two in step: the padding and
 * the 38dp well below are ListRow's own, and a change there without a change
 * here is a list that jumps when it loads.
 */
export function SkeletonRow({
  leading = "well",
  leadingSize = 56,
  value = false,
  index = 0,
}: SkeletonRowProps) {
  const t = useTheme()
  const i = index % TITLE_WIDTHS.length

  return (
    <View style={[styles.row, { backgroundColor: t.surface }]}>
      {leading === "well" && <Skeleton width={38} height={38} radius={19} style={styles.lead} />}
      {leading === "avatar" && (
        <Skeleton width={leadingSize} height={leadingSize} radius={leadingSize / 2} style={styles.lead} />
      )}
      {leading === "photo" && (
        <Skeleton width={leadingSize} height={leadingSize} radius={radius.card} style={styles.lead} />
      )}

      <View style={styles.body}>
        <Skeleton width={TITLE_WIDTHS[i]} height={15} radius={7} />
        <Skeleton width={SUB_WIDTHS[i]} height={12} radius={6} style={{ marginTop: 7 }} />
      </View>

      {value && (
        <View style={styles.valueStack}>
          <Skeleton width={74} height={15} radius={7} />
          <Skeleton width={52} height={14} radius={7} style={{ marginTop: 6 }} />
        </View>
      )}
    </View>
  )
}

/**
 * A run of placeholder rows with the 2dp bands a real list carries between and
 * after its rows, so the loading list has the same rhythm as the loaded one.
 */
export function SkeletonList({
  count = 6,
  ...row
}: SkeletonRowProps & { count?: number }) {
  const t = useTheme()
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          <SkeletonRow {...row} index={i} />
          <View style={[styles.band, { backgroundColor: t.border }]} />
        </View>
      ))}
    </View>
  )
}

/**
 * `Panel`'s geometry as a placeholder: the small section label, then `lines`
 * rows of fact-shaped bars, then the panel's own band.
 */
export function SkeletonPanel({
  lines = 3,
  head = true,
  block,
}: {
  lines?: number
  /** Draw the section label above the content. */
  head?: boolean
  /** A media block (a photo, a chart) above the lines, this many dp tall. */
  block?: number
}) {
  const t = useTheme()
  return (
    <>
      <View style={[styles.panel, { backgroundColor: t.surface }]}>
        {head && <Skeleton width={96} height={11} radius={5} style={{ marginBottom: spacing.md }} />}
        {!!block && <Skeleton height={block} radius={radius.card} style={{ marginBottom: spacing.md }} />}
        {Array.from({ length: lines }, (_, i) => (
          <View key={i} style={i ? { marginTop: spacing.md } : undefined}>
            <Skeleton width={SUB_WIDTHS[i % SUB_WIDTHS.length]} height={11} radius={5} />
            <Skeleton
              width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]}
              height={14}
              radius={7}
              style={{ marginTop: 6 }}
            />
          </View>
        ))}
      </View>
      <View style={[styles.band, { backgroundColor: t.border }]} />
    </>
  )
}

const styles = StyleSheet.create({
  // ListRow's own metrics. Do not "tidy" these into tokens that differ from it.
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: gutter,
    paddingVertical: spacing.md,
    minHeight: 72,
  },
  lead: { marginRight: spacing.md },
  body: { flex: 1, minWidth: 0 },
  valueStack: { alignItems: "flex-end", marginLeft: spacing.md },
  band: { height: 2 },
  panel: { paddingHorizontal: gutter, paddingVertical: spacing.lg },
})
