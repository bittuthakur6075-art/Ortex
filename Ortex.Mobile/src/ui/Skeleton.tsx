import React, { memo, useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet } from "react-native"

import { useTheme } from "@/store/ThemeContext"

type Props = {
  width?: number | `${number}%`
  height?: number
  radius?: number
}

/**
 * Shimmering placeholder block for loading content. Usage:
 * `<Skeleton width="80%" height={16} radius={8} />`
 */
function Skeleton({ width = "100%", height = 16, radius = 8 }: Props) {
  const t = useTheme()
  const pulse = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] })

  return (
    <Animated.View
      style={[styles.block, { width, height, borderRadius: radius, backgroundColor: t.searchBg, opacity }]}
    />
  )
}

export default memo(Skeleton)

const styles = StyleSheet.create({
  block: {},
})
