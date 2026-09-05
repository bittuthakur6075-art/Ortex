import React, { useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet, Text, View } from "react-native"

import { palette } from "@/theme/theme"
import { font } from "@/theme/typography"

const DOTS = [0, 1, 2]

/**
 * Branded startup screen shown while the session resolves and the fonts load.
 * Uses the RN Animated driver only — no reanimated dependency — and draws the
 * wordmark as type rather than an image, so there is no asset to keep in step
 * with the brand and nothing to decode before the first frame.
 */
export default function AppLoader({ label = "Ortex Sales" }: { label?: string }) {
  const breathe = useRef(new Animated.Value(0)).current
  const dots = useRef(DOTS.map(() => new Animated.Value(0))).current

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    pulse.start()

    const bounces = dots.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 380,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 380,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay((DOTS.length - index) * 140),
        ]),
      ),
    )
    bounces.forEach((b) => b.start())

    return () => {
      pulse.stop()
      bounces.forEach((b) => b.stop())
    }
  }, [breathe, dots])

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] })
  const glow = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] })

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale }] }]} />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Text style={styles.mark}>Ortex</Text>
      </Animated.View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.dots}>
        {dots.map((value, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }],
              },
            ]}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.primary,
  },
  glow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: palette.white,
    opacity: 0.25,
  },
  mark: {
    fontSize: 42,
    letterSpacing: -1,
    color: palette.white,
    fontFamily: font.extrabold,
  },
  label: {
    marginTop: 10,
    fontSize: 14,
    color: palette.primary20,
    fontFamily: font.medium,
  },
  dots: {
    flexDirection: "row",
    marginTop: 28,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginHorizontal: 4,
    backgroundColor: palette.white,
  },
})
