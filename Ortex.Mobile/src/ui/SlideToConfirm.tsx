import React from "react"
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { radius } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import Icon, { type IconName } from "@/ui/Icon"
import { SPRING, useReducedMotion } from "@/ui/motion"

/**
 * A pocket-safe confirm (Waymo's "Slide to start driving"): drag the thumb to
 * the end of the track to act. Clocking in is the one action in the app that
 * must never happen by a stray tap, and a slide is an intention a pocket cannot
 * make.
 *
 * Past 85% of the track it confirms, with a haptic; anything short springs back.
 * The thumb moves on the native driver. Under the OS reduce-motion setting (and
 * for anyone who cannot drag) it becomes press-and-hold for 600 ms instead,
 * with the track filling as the hold counts down.
 */

const THUMB = 52
const PAD = 4
const HOLD_MS = 600

type Tone = "primary" | "danger"

export default function SlideToConfirm({
  label,
  onConfirm,
  tone = "primary",
  icon = "forward",
  disabled = false,
  hint,
}: {
  label: string
  onConfirm: () => void
  tone?: Tone
  icon?: IconName
  disabled?: boolean
  /** Read by screen readers: what happens on confirm. */
  hint?: string
}) {
  const t = useTheme()
  const reduced = useReducedMotion()
  const fill = tone === "danger" ? t.danger : t.primary
  const well = tone === "danger" ? t.dangerBg : t.primary10
  const ink = tone === "danger" ? t.dangerText : t.primary

  const [width, setWidth] = React.useState(0)
  const max = Math.max(0, width - THUMB - PAD * 2)
  const x = React.useRef(new Animated.Value(0)).current
  const hold = React.useRef(new Animated.Value(0)).current
  const done = React.useRef(false)
  const maxRef = React.useRef(max)
  maxRef.current = max
  const confirmRef = React.useRef(onConfirm)
  confirmRef.current = onConfirm

  const reset = React.useCallback(() => {
    done.current = false
    Animated.spring(x, { toValue: 0, ...SPRING.soft, useNativeDriver: true }).start()
  }, [x])

  // Coming back to the screen after the flow: the thumb starts home again.
  React.useEffect(() => {
    if (!disabled) reset()
  }, [disabled, reset, label])

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: (_, g) => !disabled && Math.abs(g.dx) > 4,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => feedback.tap(),
        onPanResponderMove: (_, g) => {
          if (done.current) return
          x.setValue(Math.min(Math.max(0, g.dx), maxRef.current))
        },
        onPanResponderRelease: (_, g) => {
          if (done.current) return
          const m = maxRef.current
          if (m > 0 && g.dx >= m * 0.85) {
            done.current = true
            feedback.unlocked()
            Animated.timing(x, { toValue: m, duration: 120, useNativeDriver: true }).start(() => confirmRef.current())
          } else {
            Animated.spring(x, { toValue: 0, ...SPRING.soft, useNativeDriver: true }).start()
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(x, { toValue: 0, ...SPRING.soft, useNativeDriver: true }).start()
        },
      }),
    [disabled, x],
  )

  // ---- press and hold (reduced motion) ----
  const holdAnim = React.useRef<Animated.CompositeAnimation | null>(null)
  const startHold = () => {
    if (disabled) return
    feedback.tap()
    holdAnim.current = Animated.timing(hold, { toValue: 1, duration: HOLD_MS, useNativeDriver: true })
    holdAnim.current.start(({ finished }) => {
      if (!finished) return
      feedback.unlocked()
      hold.setValue(0)
      confirmRef.current()
    })
  }
  const endHold = () => {
    holdAnim.current?.stop()
    hold.setValue(0)
  }

  const labelOpacity = x.interpolate({ inputRange: [0, Math.max(1, max * 0.6)], outputRange: [1, 0], extrapolate: "clamp" })
  const trail = x.interpolate({ inputRange: [0, Math.max(1, max)], outputRange: [0, 1], extrapolate: "clamp" })

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: disabled ? t.mutedBg : well }]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      // Screen readers get a plain double-tap, not a drag they cannot perform.
      onAccessibilityTap={() => !disabled && onConfirm()}
    >
      {/* The part of the track the thumb has crossed, drawn as a scaled fill so
          it stays on the native driver. */}
      {!reduced && width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.trail,
            {
              backgroundColor: fill,
              width,
              opacity: trail.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
            },
          ]}
        />
      )}
      {reduced && width > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.trail,
            {
              backgroundColor: fill,
              width,
              opacity: 0.22,
              transform: [{ translateX: -width / 2 }, { scaleX: hold }, { translateX: width / 2 }],
            },
          ]}
        />
      )}

      <Animated.Text
        style={[
          textVariants.button,
          styles.label,
          { color: disabled ? t.textTertiary : ink, opacity: reduced ? 1 : labelOpacity },
        ]}
        numberOfLines={1}
      >
        {reduced ? label.replace(/^Slide/, "Hold") : label}
      </Animated.Text>

      {reduced ? (
        <Pressable
          onPressIn={startHold}
          onPressOut={endHold}
          disabled={disabled}
          style={[styles.thumb, { backgroundColor: disabled ? t.textTertiary : fill }]}
        >
          <Icon name={icon} size={24} color={t.textOnPrimary} />
        </Pressable>
      ) : (
        <Animated.View
          {...responder.panHandlers}
          style={[
            styles.thumb,
            { backgroundColor: disabled ? t.textTertiary : fill, transform: [{ translateX: x }] },
          ]}
        >
          <Icon name={icon} size={24} color={t.textOnPrimary} />
        </Animated.View>
      )}
      {disabled ? <Text style={styles.hidden}>{label}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    height: THUMB + PAD * 2,
    borderRadius: radius.pill,
    justifyContent: "center",
    overflow: "hidden",
  },
  trail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
  },
  label: {
    position: "absolute",
    left: THUMB + PAD * 2,
    right: PAD * 4,
    textAlign: "center",
  },
  thumb: {
    position: "absolute",
    left: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0 },
})
