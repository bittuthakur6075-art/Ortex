import React from "react"
import { Animated } from "react-native"
import { Gesture } from "react-native-gesture-handler"

import { feedback } from "@/lib/feedback"

/**
 * The dashboard's motion system: one set of curves and springs, and the hooks
 * every chart moves with, so the whole page feels like one material.
 *
 * WHAT MAKES IT FLUID, and the rules that keep it that way:
 *
 *   1. NOTHING ANIMATES ON THE JS THREAD THAT CAN RUN NATIVELY. Every entrance,
 *      morph, tooltip move, crosshair and press is a transform or an opacity on
 *      the native driver, so a busy JS frame (a range recompute, a realtime
 *      refetch) cannot stutter it. The only JS-driven values are SVG props (the
 *      ring's arc) and the counting figures, which cannot be native.
 *   2. A GESTURE RE-RENDERS ONLY WHEN IT CROSSES ONTO A NEW POINT. Pan events
 *      arrive ~60 times a second; a chart used to set state on every one and
 *      redraw its SVG each time. Now the finger's position lives in a ref, the
 *      state changes once per data point, and what follows the finger between
 *      points is a native spring.
 *   3. DATA CHANGES MORPH, THEY DO NOT REPLAY. Switching 7 / 30 / 90 days used to
 *      reset every bar to zero and grow it again, a visible flash. A bar now
 *      FLIPs: it is laid out at its new length and scaled from old/new back to 1
 *      on a soft spring, so it glides from where it was. Only the first showing
 *      grows from the baseline.
 *   4. ONE VOCABULARY OF CURVES: `EASE` (expo-out, the same curve as
 *      theme/tokens `motion.easeOut`) for anything that arrives, `SPRING.soft` for
 *      data settling into place, `SPRING.follow` for things that track a finger,
 *      `SPRING.press` for things under a thumb. Springs are critically damped or
 *      close to it: the design system's rule is that motion decelerates and does
 *      not bounce.
 *   5. REDUCED MOTION IS HONOURED EVERYWHERE, by jumping straight to the end.
 *
 * GESTURES. A phone has no hover, so the finger is the pointer. Every chart takes
 * three gestures and they race, so exactly one wins:
 *   · a horizontal DRAG scrubs straight away (a vertical swipe fails it within
 *     12dp and the page scrolls as normal);
 *   · a HOLD (150ms) then drag scrubs in any direction;
 *   · a TAP pins the tooltip on that point until the next tap or 2.5s.
 * A selection haptic ticks each time the finger crosses onto a new point.
 * Callbacks are `runOnJS(true)`: the app ships no Reanimated.
 */

// ---- the vocabulary -------------------------------------------------------------------

// Promoted to ui/motion.ts so every primitive in the app moves the same way;
// re-exported here so the dashboard's imports are unchanged.
import { DURATION, EASE, SPRING, useReducedMotion } from "@/ui/motion"
export { DURATION, EASE, SPRING, useReducedMotion }

// ---- entrance ------------------------------------------------------------------------

/**
 * 0 → 1, native, ONCE when the component first shows. Later data changes are
 * the job of `useMorph`, never a replay from zero.
 */
export function useEntrance({ duration: ms = DURATION.enter, delay = 0 }: { duration?: number; delay?: number } = {}) {
  const reduce = useReducedMotion()
  const progress = React.useRef(new Animated.Value(reduce ? 1 : 0)).current
  React.useEffect(() => {
    if (reduce) {
      progress.setValue(1)
      return
    }
    const anim = Animated.timing(progress, { toValue: 1, duration: ms, delay, easing: EASE, useNativeDriver: true })
    anim.start()
    return () => anim.stop()
    // Deliberately once: see the doc comment.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])
  return progress
}

/**
 * A staggered child of one entrance: starts `index / (count - 1) * spread` of
 * the way in, so a grid of cells settles as one wave rather than all at once.
 */
export function staggered(progress: Animated.Value, index: number, count: number, spread = 0.45) {
  const start = count > 1 ? (index / (count - 1)) * spread : 0
  return progress.interpolate({
    inputRange: [start, Math.min(1, start + (1 - spread)), 1],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  })
}

/**
 * A soft arrival for a block of content (a panel appearing after its skeleton):
 * fades up 8dp. Returns the style to spread on an Animated.View.
 */
export function useFadeUp(order = 0) {
  const p = useEntrance({ duration: 520, delay: order * 60 })
  return {
    opacity: p,
    transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  }
}

// ---- morph ------------------------------------------------------------------------------

/**
 * The scale for a bar whose length is `fraction` of its track.
 *
 *   · first show: grows from 0 on EASE, `order` steps of stagger in, so a row of
 *     bars rises as one wave;
 *   · every later change: FLIP. The bar is already laid out at its new length,
 *     so the scale starts at old/new and springs to 1, the bar glides from its
 *     old length to its new one, natively, whatever the JS thread is doing.
 */
export function useMorph(fraction: number, order = 0) {
  const reduce = useReducedMotion()
  const scale = React.useRef(new Animated.Value(reduce ? 1 : 0)).current
  const prev = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (reduce) {
      scale.stopAnimation()
      scale.setValue(1)
      prev.current = fraction
      return
    }
    if (prev.current === null) {
      Animated.timing(scale, {
        toValue: 1,
        duration: DURATION.enter,
        delay: order * DURATION.stagger,
        easing: EASE,
        useNativeDriver: true,
      }).start()
    } else if (prev.current !== fraction && fraction > 0) {
      scale.stopAnimation((current) => {
        // Continue from wherever an interrupted morph had got to.
        const from = ((prev.current ?? fraction) / fraction) * (current || 1)
        prev.current = fraction
        scale.setValue(from)
        Animated.spring(scale, { toValue: 1, ...SPRING.soft, useNativeDriver: true }).start()
      })
      return
    }
    prev.current = fraction
  }, [fraction, reduce, scale, order])

  return scale
}

/** An opacity that eases between two states (a dimmed column, a lit segment). */
export function useFade(on: boolean, dimmed = 0.3) {
  const v = React.useRef(new Animated.Value(on ? 1 : dimmed)).current
  React.useEffect(() => {
    Animated.timing(v, { toValue: on ? 1 : dimmed, duration: DURATION.fade, easing: EASE, useNativeDriver: true }).start()
  }, [on, dimmed, v])
  return v
}

/**
 * A native value that follows a JS number: jumps when `jump` is true (the first
 * point of a new scrub, so nothing slides in from a stale place), springs
 * otherwise.
 */
export function useFollow(target: number, jump: boolean) {
  const reduce = useReducedMotion()
  const v = React.useRef(new Animated.Value(target)).current
  React.useEffect(() => {
    if (jump || reduce) {
      v.stopAnimation()
      v.setValue(target)
      return
    }
    Animated.spring(v, { toValue: target, ...SPRING.follow, useNativeDriver: true }).start()
  }, [target, jump, reduce, v])
  return v
}

/**
 * A cheap cross-fade for something that has to redraw rather than morph (the
 * pace chart's SVG paths): on each change after the first it dips to 35% and
 * eases back, so the new shape reads as the old one settling, not a cut.
 */
export function useRedraw(key: unknown) {
  const reduce = useReducedMotion()
  const v = React.useRef(new Animated.Value(1)).current
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (reduce) return
    v.setValue(0.35)
    Animated.timing(v, { toValue: 1, duration: 360, easing: EASE, useNativeDriver: true }).start()
  }, [key, reduce, v])
  return v
}

// ---- the scrub gesture ---------------------------------------------------------------

export type Point = { x: number; y: number }

/**
 * Drag, hold-and-drag or tap on a chart, reduced to the data key under the
 * finger. State changes ONCE per new key (not per pan event), which is what keeps
 * a chart from redrawing 60 times a second while it is being read.
 */
export function useScrub<K>({ resolve }: { resolve: (p: Point) => K | null }) {
  const [active, setActive] = React.useState<{ key: K; fresh: boolean } | null>(null)
  const pinned = React.useRef(false)
  const lastKey = React.useRef<string | null>(null)
  const showing = React.useRef(false)
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolveRef = React.useRef(resolve)
  resolveRef.current = resolve

  const clearTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = null
  }
  const move = React.useCallback((p: Point) => {
    clearTimer()
    const key = resolveRef.current(p)
    if (key === null) return
    const id = JSON.stringify(key)
    if (id === lastKey.current && showing.current) return
    const fresh = !showing.current
    lastKey.current = id
    showing.current = true
    feedback.select()
    setActive({ key, fresh })
  }, [])
  const release = React.useCallback((after: number) => {
    clearTimer()
    hideTimer.current = setTimeout(() => {
      lastKey.current = null
      showing.current = false
      pinned.current = false
      setActive(null)
    }, after)
  }, [])

  React.useEffect(() => clearTimer, [])

  const gesture = React.useMemo(() => {
    const start = (e: Point) => {
      pinned.current = false
      move(e)
    }
    const swipe = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .runOnJS(true)
      .onStart((e) => start({ x: e.x, y: e.y }))
      .onUpdate((e) => move({ x: e.x, y: e.y }))
      .onEnd(() => release(900))
    const hold = Gesture.Pan()
      .activateAfterLongPress(150)
      .runOnJS(true)
      .onStart((e) => start({ x: e.x, y: e.y }))
      .onUpdate((e) => move({ x: e.x, y: e.y }))
      .onEnd(() => release(900))
    const tap = Gesture.Tap()
      .maxDuration(250)
      .runOnJS(true)
      .onEnd((e, success) => {
        if (!success) return
        const key = resolveRef.current({ x: e.x, y: e.y })
        // Tapping the point that is already pinned puts it away.
        if (key !== null && pinned.current && JSON.stringify(key) === lastKey.current) {
          release(0)
          return
        }
        pinned.current = true
        move({ x: e.x, y: e.y })
        release(2500)
      })
    return Gesture.Race(swipe, hold, tap)
  }, [move, release])

  return { active, gesture, dismiss: () => release(0) }
}
