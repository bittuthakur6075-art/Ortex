import { Image } from "expo-image"
import React from "react"
import {
  AccessibilityInfo,
  Alert,
  Animated,
  Easing,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { BRAND, brandFieldSeen, ON_BRAND, ON_BRAND_SOFT } from "@/features/auth/brandField"
import type { BiometricMethod } from "@/features/auth/useAppLock"
import { useAuth } from "@/store/AuthContext"
import { motion, spacing } from "@/theme/tokens"
import { font } from "@/theme/typography"
import { Icon } from "@/ui"
import { OrtexWordmark } from "@/ui/OrtexLogo"

/**
 * Shown instead of the app while the biometric lock is engaged.
 *
 * THE DESIGN, from the unlock screens on Mobbin (PayPal, Google Photos, Apple
 * Photos' hidden album): a lock screen is not a warning, it is a doorway, and the
 * good ones are built as one.
 *
 *   - It says WHOSE app this is. PayPal leads with the account's face and email,
 *     so the person holding the phone knows at a glance they are opening their
 *     own session rather than a colleague's handset. Ortex phones get handed
 *     around a sales floor; that glance matters.
 *   - The one action is PINNED TO THE BOTTOM, full width, where a thumb already
 *     is (Google Photos' "Open with Face ID"), and it names the sensor it wakes.
 *   - There is a way out that is not the sensor (PayPal's "Try another way"). A
 *     phone whose fingerprint has stopped reading would otherwise strand a rep
 *     behind their own lock; signing out and back in with the password is the
 *     honest escape, and it is confirmed because it costs an emailed code.
 *
 * It stands on the SAME brand field as the splash, because on a cold start the
 * two are shown back to back: blue → blue reads as one arrival, blue → white as
 * a second app opening.
 *
 * A ring pulses out from the avatar while the system prompt is up, so the screen
 * behind the dialog still says "waiting on you" rather than looking frozen.
 */
export default function LockScreen({
  prompting,
  error,
  method,
  onUnlock,
}: {
  prompting: boolean
  error: string | null
  method: BiometricMethod
  onUnlock: () => void
}) {
  const { profile, signOut } = useAuth()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const firstName = profile?.name?.trim().split(/\s+/)[0]
  const monogram = initials(profile?.name)
  const sensor = method === "face" ? "face" : "fingerprint"

  // Straight after the splash on a cold start the glow is already lit: keep it.
  const [arrived] = React.useState(brandFieldSeen)
  const enter = React.useRef(new Animated.Value(0)).current
  const ring = React.useRef(new Animated.Value(0)).current
  const [reduced, setReduced] = React.useState(false)

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((r) => {
        setReduced(r)
        if (r) return enter.setValue(1)
        Animated.timing(enter, {
          toValue: 1,
          duration: motion.slow,
          easing: Easing.bezier(...motion.easeOut),
          useNativeDriver: true,
        }).start()
      })
  }, [enter])

  React.useEffect(() => {
    if (!prompting || reduced) {
      ring.stopAnimation()
      ring.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(ring, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    )
    loop.start()
    return () => loop.stop()
  }, [prompting, reduced, ring])

  const status = error
    ? error
    : prompting
    ? method === "face"
      ? "Look at your phone to unlock"
      : "Touch the fingerprint sensor"
    : "Ortex Sales is locked"

  const confirmSignOut = () =>
    Alert.alert("Sign out?", "You will need your password and an emailed code to sign back in.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ])

  const rise = enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.lg }]}>
      <StatusBar barStyle="light-content" backgroundColor={BRAND} />

      <View style={styles.top}>
        <OrtexWordmark height={22} color={ON_BRAND} />
      </View>

      <Animated.View style={[styles.center, { opacity: enter, transform: [{ translateY: rise }] }]}>
        <View style={styles.avatarWrap}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse,
              {
                opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
                transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
              },
            ]}
          />
          <View style={styles.avatar}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} contentFit="cover" />
            ) : monogram ? (
              <Text style={styles.initials}>{monogram}</Text>
            ) : (
              <Icon name="lock" size={36} color={ON_BRAND} variant="Bulk" />
            )}
          </View>
          {/* The lock rides on the avatar like a badge on a contact card: the
              face says whose, the badge says why you cannot go in yet. */}
          <View style={styles.badge}>
            <Icon name="lock" size={14} color={BRAND} variant="Bold" />
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </Text>
        {profile?.email ? (
          <Text style={styles.email} numberOfLines={1}>
            {profile.email}
          </Text>
        ) : null}

        <View style={[styles.status, error ? styles.statusError : null]} accessibilityLiveRegion="polite">
          {error ? <Icon name="warning" size={14} color={ON_BRAND} variant="Bold" /> : null}
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </Animated.View>

      <Animated.View style={[styles.actions, { opacity: enter }]}>
        <Pressable
          onPress={onUnlock}
          disabled={prompting}
          accessibilityRole="button"
          accessibilityLabel={`Unlock with ${sensor}`}
          accessibilityState={{ disabled: prompting }}
          style={({ pressed }) => [styles.primary, { opacity: prompting ? 0.72 : pressed ? 0.88 : 1 }]}
        >
          <Icon name="fingerprint" size={22} color={BRAND} variant="Bulk" />
          <Text style={styles.primaryText}>{error ? "Try again" : `Unlock with ${sensor}`}</Text>
        </Pressable>

        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.secondary, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={styles.secondaryText}>Not you? Sign out</Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}

function initials(name?: string) {
  return (name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("")
}

const AVATAR = 96

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BRAND,
    paddingHorizontal: 24,
  },
  top: {
    alignItems: "center",
    paddingTop: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    marginBottom: spacing.xl,
  },
  pulse: {
    position: "absolute",
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderColor: ON_BRAND,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.5)",
  },
  avatarImage: { width: "100%", height: "100%" },
  initials: {
    fontFamily: font.display,
    fontSize: 34,
    color: ON_BRAND,
    includeFontPadding: false,
  },
  badge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ON_BRAND,
    borderWidth: 3,
    borderColor: BRAND,
  },
  title: {
    fontFamily: font.display,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.3,
    color: ON_BRAND,
    textAlign: "center",
  },
  email: {
    marginTop: spacing.xs,
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 21,
    color: ON_BRAND_SOFT,
  },
  status: {
    marginTop: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  statusError: {
    backgroundColor: "rgba(232,38,70,0.9)",
  },
  statusText: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: ON_BRAND,
  },
  actions: {
    gap: spacing.sm,
  },
  primary: {
    height: 54,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ON_BRAND,
  },
  primaryText: {
    fontFamily: font.semibold,
    fontSize: 16,
    color: BRAND,
  },
  secondary: {
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: {
    fontFamily: font.medium,
    fontSize: 14,
    color: ON_BRAND_SOFT,
  },
})
