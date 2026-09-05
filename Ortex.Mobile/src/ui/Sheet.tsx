import React, { useEffect, useRef, useState } from "react"
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native"

import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"

type Props = {
  visible: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

/**
 * Bottom sheet with One UI motion: the panel springs up with a touch of
 * overshoot while the scrim fades, and drops away on a shorter decelerating
 * curve. Modal's own `animationType` is disabled so we control the whole curve.
 */
export default function Sheet({ visible, onClose, title, children }: Props) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const progress = useRef(new Animated.Value(0)).current
  const [mounted, setMounted] = useState(visible)
  // Start at full screen height: a smaller guess makes a tall sheet's first
  // open begin part-way up the screen instead of fully off it.
  const [height, setHeight] = useState(Dimensions.get("window").height)

  useEffect(() => {
    if (visible) {
      setMounted(true)
      Animated.spring(progress, {
        toValue: 1,
        useNativeDriver: true,
        damping: 24,
        stiffness: 260,
        mass: 0.85,
      }).start()
      return
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setMounted(false)
    })
  }, [visible, progress])

  if (!mounted) return null

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  })

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.backdropPress} onPress={onClose} />
        </Animated.View>

        <Animated.View
          onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          style={[
            styles.sheet,
            {
              backgroundColor: t.sheetBg,
              paddingBottom: Math.max(insets.bottom, 26),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: t.textTertiary }]} />
          {!!title && <Text style={[styles.title, { color: t.text }]}>{title}</Text>}
          <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(7,20,55,0.35)",
  },
  backdropPress: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "78%",
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    opacity: 0.5,
  },
  title: {
    fontSize: 18,
    fontFamily: font.bold,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 4,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingTop: 8,
  },
})
