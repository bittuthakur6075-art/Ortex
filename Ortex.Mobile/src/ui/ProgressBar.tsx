import React, { memo, useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet, View } from "react-native"

import { useTheme } from "@/store/ThemeContext"

type Props = {
  /** 0 to 1. */
  progress: number
  color?: string
}

/**
 * Determinate progress bar. Usage: `<ProgressBar progress={uploaded / total} />`
 */
function ProgressBar({ progress, color }: Props) {
  const t = useTheme()
  const width = useRef(new Animated.Value(0)).current
  const clamped = Math.min(1, Math.max(0, progress))

  useEffect(() => {
    Animated.timing(width, {
      toValue: clamped,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [clamped, width])

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: t.accentSoft }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: color ?? t.accent,
            width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          },
        ]}
      />
    </View>
  )
}

export default memo(ProgressBar)

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
})
