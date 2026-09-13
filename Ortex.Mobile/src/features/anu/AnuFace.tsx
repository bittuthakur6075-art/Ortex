import React from "react"
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from "react-native"

import type { AnuStatus } from "@/features/anu/useAnuSession"
import { useTheme } from "@/store/ThemeContext"

/**
 * Anu's face: assets/anu.jpg, the portrait photo the owner chose (2026-09-13),
 * cropped square to the face. Inside three flat rings that answer the
 * conversation.
 *
 * On a voice call the only proof the line is open is something reacting to
 * your own voice, so the rings are driven by the audio levels the engine posts:
 * they swell with the person's voice while Anu listens, and ripple in the brand
 * blue while she speaks. Connecting, they breathe. On an error they turn red.
 *
 * FLAT, NO GLOW: solid tinted rings with no blur, bloom or shadow, per the app's
 * design rules. Every transform and opacity runs on the native driver; the
 * levels themselves are glided there by useAnuSession.
 */

const PHOTO = require("../../../assets/anu.jpg")

export default function AnuFace({
  size,
  status,
  speaking,
  micLevel,
  outLevel,
}: {
  size: number
  status: AnuStatus
  speaking: boolean
  micLevel: Animated.Value
  outLevel: Animated.Value
}) {
  const t = useTheme()
  const breath = React.useRef(new Animated.Value(0)).current
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced)
  }, [])

  // A slow breath while connecting or idle, so the page is never frozen.
  React.useEffect(() => {
    if (reduced || status === "live") {
      breath.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [status, reduced, breath])

  const level = speaking ? outLevel : micLevel
  const tint = status === "error" ? t.danger : speaking ? t.primary : status === "live" ? t.primary : t.textTertiary
  const ringBase = status === "error" ? t.dangerBg : t.primary10

  const ring = (index: number) => {
    const gap = size * (0.12 + index * 0.13)
    const d = size + gap * 2
    const scale = Animated.add(
      breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + 0.03 * (index + 1)] }),
      level.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16 * (index + 1)], extrapolate: "clamp" }),
    )
    const opacity = level.interpolate({
      inputRange: [0, 1],
      outputRange: [0.55 - index * 0.16, 1 - index * 0.2],
      extrapolate: "clamp",
    })
    return (
      <Animated.View
        key={index}
        pointerEvents="none"
        style={[
          styles.ring,
          {
            width: d,
            height: d,
            borderRadius: d / 2,
            backgroundColor: index === 0 ? ringBase : "transparent",
            borderColor: tint,
            borderWidth: index === 0 ? 0 : 1.5,
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
    )
  }

  const box = size * 1.9

  return (
    <View style={[styles.box, { width: box, height: box }]} accessibilityLabel="Anu" accessibilityRole="image">
      {[2, 1, 0].map(ring)}
      <View style={[styles.photoFrame, { width: size, height: size, borderRadius: size / 2, borderColor: t.surface }]}>
        <Image source={PHOTO} style={{ width: size, height: size }} resizeMode="cover" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute" },
  photoFrame: { overflow: "hidden", borderWidth: 3 },
})
