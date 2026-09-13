import React from "react"
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native"
import { Defs, RadialGradient, Rect, Stop, Svg } from "react-native-svg"

/**
 * A soft light pooled behind the mark, breathing slowly.
 *
 * Mobbin's calmer launch screens (Pillow, Tiimo) give the flat field depth with a
 * glow rather than a pattern, and a glow is the one flourish that cannot fight the
 * mark: it is light BEHIND the letterforms, so the pure-white type is untouched and
 * the native splash's picture is still exactly what sits on top.
 *
 * It fades in rather than being present at the handoff — the native field is flat,
 * and a glow already there on the first JS frame would read as a flash. Scale and
 * opacity only, on the native driver, so a busy session check cannot stutter it.
 * Reduce-motion keeps the glow and drops the breathing.
 */
export default function BrandGlow({
  size,
  centerY = 0.5,
  breathe = true,
  arrived = false,
}: {
  /** Diameter of the pool in dp. */
  size: number
  /** Vertical centre as a fraction of the parent's height. */
  centerY?: number
  breathe?: boolean
  /** Already on screen from the previous brand-field screen: skip the fade-in. */
  arrived?: boolean
}) {
  const appear = React.useRef(new Animated.Value(arrived ? 1 : 0)).current
  const pulse = React.useRef(new Animated.Value(0)).current

  // Separate from the breathing below, so toggling `breathe` (the lock screen
  // stills the glow while the fingerprint prompt is up) never replays the fade.
  React.useEffect(() => {
    if (arrived) return
    Animated.timing(appear, {
      toValue: 1,
      duration: 450,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start()
  }, [appear, arrived])

  React.useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (cancelled || reduced || !breathe) return
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, {
              toValue: 1,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(pulse, {
              toValue: 0,
              duration: 2200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        )
        loop.start()
      })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [pulse, breathe])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={{
          position: "absolute",
          width: size,
          height: size,
          left: "50%",
          top: `${centerY * 100}%`,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity: appear,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1.06] }) }],
        }}
      >
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.22} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.08} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size} height={size} fill="url(#glow)" />
        </Svg>
      </Animated.View>
    </View>
  )
}
