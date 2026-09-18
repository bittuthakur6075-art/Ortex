import React from "react"
import { AccessibilityInfo, Animated, Easing, Pressable } from "react-native"

/**
 * The app's ONE motion vocabulary, after One UI 8's: quick off the mark, a long
 * gentle landing, springs that settle without bouncing, and every value on the
 * native driver so a busy JS frame cannot stutter it.
 *
 * It started as the dashboard's (features/home/motion.ts, which re-exports this)
 * and was promoted when every primitive in ui/ took the same press and arrival
 * motion, so a button on a form and a tile on Home give under the thumb alike.
 *
 * Reduced motion is honoured everywhere by jumping straight to the end state.
 */

/** Expo-out: fast off the mark, long gentle landing. theme/tokens `motion.easeOut`. */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1)

export const SPRING = {
  /** Data settling to a new value: a bar morphing, a chart re-drawing. */
  soft: { stiffness: 170, damping: 26, mass: 1 },
  /** Something tracking a finger between data points: quick, no overshoot. */
  follow: { stiffness: 520, damping: 44, mass: 0.7 },
  /** Under a thumb. */
  press: { stiffness: 420, damping: 30, mass: 0.6 },
  /** A bubble appearing. */
  pop: { stiffness: 360, damping: 26, mass: 0.7 },
  /** A page's content settling after the push: One UI's soft, unhurried landing. */
  page: { stiffness: 210, damping: 28, mass: 0.9 },
} as const

export const DURATION = { enter: 680, fade: 220, stagger: 32 } as const

// ---- reduced motion ----------------------------------------------------------------

let reduceMotion = false
const reduceListeners = new Set<(v: boolean) => void>()
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceMotion = v
    reduceListeners.forEach((cb) => cb(v))
  })
  .catch(() => {})
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => {
  reduceMotion = v
  reduceListeners.forEach((cb) => cb(v))
})

export function isReducedMotion(): boolean {
  return reduceMotion
}

export function useReducedMotion(): boolean {
  const [v, setV] = React.useState(reduceMotion)
  React.useEffect(() => {
    reduceListeners.add(setV)
    return () => {
      reduceListeners.delete(setV)
    }
  }, [])
  return v
}

// ---- press ---------------------------------------------------------------------------

/**
 * A Pressable whose `style` may carry Animated values. Its style must be a plain
 * style (not the `({ pressed }) => …` function form); the pressed state is the
 * animation's job instead.
 */
export const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/**
 * One UI's press: the target SINKS under the thumb (a small scale down and a
 * slight fade) on a quick spring, and springs back when the finger lifts. It
 * replaces the instant opacity flip the kit used to do, which read as a blink.
 *
 * `scale` is the pressed size (1 = none, for full-bleed rows where a visible
 * shrink would expose the page edges); `dim` the pressed opacity.
 */
export function usePressMotion({ scale = 0.97, dim = 0.85 }: { scale?: number; dim?: number } = {}) {
  const reduce = useReducedMotion()
  const p = React.useRef(new Animated.Value(0)).current
  const to = React.useCallback(
    (v: number) => {
      if (reduce) {
        // Keep the feedback, lose the movement: the dim still says "pressed".
        p.setValue(v)
        return
      }
      Animated.spring(p, { toValue: v, ...SPRING.press, useNativeDriver: true }).start()
    },
    [p, reduce],
  )
  const style = React.useMemo(
    () => ({
      opacity: p.interpolate({ inputRange: [0, 1], outputRange: [1, dim] }),
      transform: [
        { scale: reduce ? 1 : p.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) },
      ],
    }),
    [p, dim, scale, reduce],
  )
  return {
    style,
    onPressIn: React.useCallback(() => to(1), [to]),
    onPressOut: React.useCallback(() => to(0), [to]),
  }
}

// ---- page arrival ---------------------------------------------------------------------

/**
 * 0 → 1 when a screen first mounts: the clock its title and sections settle on.
 * Native, spring-driven, skipped under reduced motion.
 *
 * A re-render never replays it. Only a change of `replayKey` does, for a screen
 * that swaps its whole content in place (the login flow's steps), which should
 * land again the way a new page would.
 */
export function useArrival(replayKey?: string | number) {
  const reduce = useReducedMotion()
  const progress = React.useRef(new Animated.Value(reduce ? 1 : 0)).current
  React.useEffect(() => {
    if (reduce) {
      progress.setValue(1)
      return
    }
    progress.setValue(0)
    const anim = Animated.spring(progress, { toValue: 1, ...SPRING.page, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
    // Only the key: a re-render must never replay the arrival.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [replayKey])
  return progress
}

/** How many sections cascade; anything below the fold arrives with the last. */
const CASCADE_MAX = 6
/** The share of the arrival each successive section waits before it moves. */
const CASCADE_STEP = 0.07
/** How far a section rises as it settles. */
const RISE = 14

/**
 * The style of the `index`th block of an arriving page: it fades in and rises
 * RISE dp, starting a step after the block above it, so a page lands top to
 * bottom as one wave rather than all at once.
 */
export function arrivalStyle(progress: Animated.Value, index: number) {
  const start = Math.min(index, CASCADE_MAX) * CASCADE_STEP
  return {
    opacity: progress.interpolate({
      inputRange: [start, Math.min(1, start + 0.45)],
      outputRange: [0, 1],
      extrapolate: "clamp" as const,
    }),
    transform: [
      {
        translateY: progress.interpolate({
          inputRange: [start, 1],
          outputRange: [RISE, 0],
          extrapolate: "clamp" as const,
        }),
      },
    ],
  }
}
