import React, { memo, useEffect, useRef } from "react"
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native"

import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { motion, spacing, state } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"

/**
 * The boolean control.
 *
 * PORTED FROM Capnix's `@webority-technologies/mobile` Switch (the control) and
 * `src/components/base/AppToggle.jsx` (the row around it), rather than left on
 * React Native's `<Switch>`. The platform switch is Material on Android and the
 * iOS switch on iOS: two different shapes, neither of them the design's, and
 * neither themable beyond a track and thumb colour.
 *
 * The control is a track with a travelling thumb:
 *
 *   · 51 × 31 track, 27 thumb, 2 padding — the `md` step of the library's scale
 *   · the thumb SPRINGS across (damping 20 / stiffness 300 / mass 0.7, the
 *     library's "snappy") on the native driver
 *   · the track colour CROSS-FADES on a 150ms ease-out — a colour cannot run on
 *     the native driver, so the two animations are deliberately separate rather
 *     than one interpolation
 *
 * THE ROW IS THE APP'S, not the control's. Label left, description beneath it,
 * control hard right, the WHOLE ROW pressable: a 51dp track on its own is a
 * small target, and asking someone to hit it precisely is a design failure, not
 * a user error. The control is `pointerEvents="none"` inside that row — it
 * renders state and does not receive touches, so a tap can never fire twice.
 */

const TRACK_WIDTH = 51
const TRACK_HEIGHT = 31
const THUMB_SIZE = 27
const TRACK_PADDING = 2

type Props = {
  value: boolean
  onValueChange: (next: boolean) => void
  label?: string
  description?: string
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/** The track and thumb alone — display only, no gesture and no accessibility role. */
function SwitchTrack({ value, disabled }: { value: boolean; disabled?: boolean }) {
  const t = useTheme()
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current
  const tint = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    const anim = Animated.spring(progress, {
      toValue: value ? 1 : 0,
      damping: 20,
      stiffness: 300,
      mass: 0.7,
      useNativeDriver: true,
    })
    anim.start()
    return () => anim.stop()
  }, [value, progress])

  useEffect(() => {
    const anim = Animated.timing(tint, {
      toValue: value ? 1 : 0,
      duration: motion.fast,
      easing: Easing.out(Easing.ease),
      // A backgroundColor cannot be driven natively.
      useNativeDriver: false,
    })
    anim.start()
    return () => anim.stop()
  }, [value, tint])

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [TRACK_PADDING, TRACK_WIDTH - THUMB_SIZE - TRACK_PADDING],
  })
  const backgroundColor = tint.interpolate({
    inputRange: [0, 1],
    outputRange: [t.surfaceTrack, t.primary],
  })

  return (
    <Animated.View style={[styles.track, { backgroundColor, opacity: disabled ? state.disabledOpacity : 1 }]}>
      <Animated.View
        style={[styles.thumb, { backgroundColor: t.textOnPrimary, transform: [{ translateX }] }]}
      />
    </Animated.View>
  )
}

function Switch({ value, onValueChange, label, description, disabled, style }: Props) {
  const t = useTheme()

  if (!label) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => {
          feedback.toggle(!value)
          onValueChange(!value)
        }}
        style={({ pressed }) => [{ opacity: pressed && !disabled ? 0.9 : 1 }, style]}
      >
        <SwitchTrack value={value} disabled={disabled} />
      </Pressable>
    )
  }

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        feedback.toggle(!value)
        onValueChange(!value)
      }}
      style={({ pressed }) => [
        styles.row,
        { opacity: disabled ? state.disabledOpacity : pressed ? state.pressedOpacity : 1 },
        style,
      ]}
    >
      <View style={styles.text}>
        <Text style={[textVariants.body, { color: t.text }]}>{label}</Text>
        {!!description && (
          <Text style={[textVariants.caption, { color: t.textTertiary, marginTop: 2 }]}>{description}</Text>
        )}
      </View>
      {/* Display only — the row owns the gesture and the accessibility role. */}
      <View pointerEvents="none">
        <SwitchTrack value={value} disabled={disabled} />
      </View>
    </Pressable>
  )
}

export default memo(Switch)

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
    marginRight: spacing.md,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: "center",
  },
  thumb: {
    position: "absolute",
    top: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
})
