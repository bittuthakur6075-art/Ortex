import { LinearGradient } from "expo-linear-gradient"
import React from "react"
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"

import { motion, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { OrtexWordmark } from "@/ui/OrtexLogo"

/**
 * What shows while the session is being checked.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\screens\system\SplashScreenView.jsx.
 *
 * Not the same thing as the NATIVE splash — that is the static field the OS draws
 * before any JS runs. This is the JS one that holds the gap between "the app has
 * started" and "we know whether you are signed in", which on a phone is a real
 * interval: the session is in storage and may need a refresh round-trip. It
 * exists so that interval never shows the SIGN-IN screen to someone who is
 * already signed in.
 *
 * ⚠️ THIS SCREEN AND THE NATIVE SPLASH MUST AGREE ON THEIR BACKGROUND. They are
 * two pictures shown back to back with nothing between them, so any mismatch
 * reads as a flash on every cold start. Both are the brand blue: the Android
 * window background in styles.xml, and BRAND here. Change one, change both.
 *
 * The screen ignores the OS theme entirely — a brand splash that changes colour
 * with a system setting is not a brand splash.
 */

/** The brand blue, fixed. Not `colors.primary`, which steps lighter in dark mode. */
const BRAND = "#2567E8"
const ON_BRAND = "#FFFFFF"

/**
 * The sweep's three knobs, together because they are tuned against each other: a
 * wider band wants less peak, a steeper tilt reads faster at the same duration.
 */
/** Band width as a fraction of the screen. Narrow reads as a gleam, wide as a wash. */
const SHEEN_BAND_WIDTH_RATIO = 0.5
/** Brightest point at the band's centre — white at low alpha over the blue. */
const SHEEN_PEAK = "rgba(255,255,255,0.17)"
/** Tilt off vertical, so the light rakes across rather than wiping down a column. */
const SHEEN_TILT = "16deg"

export default function SplashView({ message }: { message?: string }) {
  const { width, height } = useWindowDimensions()

  /**
   * ⚠️ THE LOCKUP DOES NOT ANIMATE IN, AND THAT IS THE POINT. The native splash
   * has already drawn this mark on this field before any JS ran, so fading or
   * scaling it here would animate something the user is ALREADY LOOKING AT, which
   * reads as a flicker at the handoff rather than as an arrival. This screen picks
   * up from the settled state and adds the flourish on top: a soft light sweeps
   * once across the field, and the mark itself is never touched.
   *
   * ⚠️ THE LIGHT PLAYS ON THE FIELD, NOT ON THE TYPE. Masking a white highlight to
   * the letterforms is the usual way to do a sheen and would be invisible here —
   * the lockup is already pure white, and there is nothing brighter to brighten it
   * to. Lighting the blue behind the type is what makes the sweep readable, and it
   * leaves the mark identical to the native splash's, so the handoff stays seamless.
   *
   * The spinner holds back and fades in after the sweep has started, so the eye
   * reads mark first and activity second. Reduce-motion skips the sweep.
   */
  const sheen = React.useRef(new Animated.Value(0)).current
  const chrome = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    let cancelled = false
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (cancelled) return
        if (reduced) {
          chrome.setValue(1)
          return
        }
        Animated.parallel([
          // A transform, so it runs on the native driver and cannot be stuttered
          // by the session check happening on the same tick. Linear on purpose: a
          // decelerating highlight looks like it is running out of momentum rather
          // than passing across.
          Animated.timing(sheen, {
            toValue: 1,
            duration: 1150,
            delay: 260,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(chrome, {
            toValue: 1,
            duration: motion.slow,
            delay: 450,
            easing: Easing.bezier(...motion.easeOut),
            useNativeDriver: true,
          }),
        ]).start()
      })
      .catch(() => chrome.setValue(1))
    return () => {
      cancelled = true
    }
  }, [sheen, chrome])

  // The band is taller than the screen and tilted, so its ends never enter frame —
  // a vertical edge crossing the view would read as a wipe rather than as light.
  const bandWidth = width * SHEEN_BAND_WIDTH_RATIO

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />

      {/* Behind everything and non-interactive: the light passes UNDER the mark so
          the letterforms stay pure white rather than being washed by it. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View
          style={{
            position: "absolute",
            width: bandWidth,
            height: height * 1.6,
            top: -height * 0.3,
            transform: [
              {
                translateX: sheen.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-bandWidth * 1.6, width + bandWidth * 0.6],
                }),
              },
              { rotate: SHEEN_TILT },
            ],
          }}
        >
          <LinearGradient
            colors={["rgba(255,255,255,0)", SHEEN_PEAK, "rgba(255,255,255,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>

      <OrtexWordmark height={40} color={ON_BRAND} />

      <Animated.View style={{ opacity: chrome, alignItems: "center" }}>
        <ActivityIndicator color={ON_BRAND} style={{ marginTop: spacing.xxl }} />
        {message ? (
          <Text style={[textVariants.small, { marginTop: spacing.md, color: "rgba(255,255,255,0.82)" }]}>
            {message}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND,
  },
})
