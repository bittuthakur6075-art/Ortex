import { Image } from "expo-image"
import { LinearGradient } from "expo-linear-gradient"
import React from "react"
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { emailProblem } from "@/features/contacts/validateContact"
import { sendEmailOtp, verifyEmailOtp, verifyPassword } from "@/lib/auth"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, TextField, useToast } from "@/ui"

/**
 * Sign in.
 *
 * PORTED FROM C:\code\lumex\Lumex.Mobile.Surveyor\src\screens\public\LoginScreen.js:
 *
 *   TOP     a three-column photo collage bleeding off the top edge, each column
 *           drifting endlessly (the middle one against the other two), fading
 *           into the page colour so the form reads on a plain surface.
 *   CENTRE  "Welcome to Ortex" — one bold line, the brand word in the primary.
 *   BOTTOM  labelled fields with leading icons, "Forgot password?" under the
 *           password, and a full-width button.
 *
 * Substitutions from the Lumex screen, all deliberate: Reanimated is not a
 * dependency here, so the marquee runs on RN's Animated with the native driver
 * (a transform loop, so it stays off the JS thread); the tiles are expo-image
 * with a plain radius instead of SVG-clipped squircles, because nine SVG image
 * clips animating at once is the costliest possible way to draw a login page;
 * and the fade is a real gradient in the THEME's page colour, so dark mode fades
 * to black rather than white.
 *
 * THE PHOTOS are free Pexels stock (assets/login, no attribution required),
 * chosen for what Ortex makes: lanyards and ID cards, laser cutting and
 * engraving, trophies, keychains, gift boxes, screen printing. Replace them with
 * Ortex's own factory photography when it exists.
 *
 * THE FLOW IS UNCHANGED: password, then a code emailed to the same address.
 * Ortex is invite-only, so there is no sign-up, and "Forgot password?" says who
 * can reset it (an admin, from Team) rather than pretending to a self-service
 * reset the backend does not offer.
 */

const OTP_LENGTH = 6

/** Every tile is 3:4, so the column geometry follows from its measured width. */
const COLLAGE: { top: number; images: ImageSourcePropType[] }[] = [
  {
    top: 18,
    images: [
      require("../../../assets/login/lanyard-badges.jpg"),
      require("../../../assets/login/cnc-laser.jpg"),
      require("../../../assets/login/gift-box.jpg"),
    ],
  },
  {
    top: 0,
    images: [
      require("../../../assets/login/engraving-machine.jpg"),
      require("../../../assets/login/trophies.jpg"),
      require("../../../assets/login/keychain.jpg"),
    ],
  },
  {
    top: 18,
    images: [
      require("../../../assets/login/lanyard-person.jpg"),
      require("../../../assets/login/screen-printing.jpg"),
      require("../../../assets/login/laser-cutting.jpg"),
    ],
  },
]

const COLLAGE_GAP = 8
const TILE_RADIUS = 14
/** px per second. Slow: the page is for typing a password, not watching. */
const MARQUEE_SPEED = 14
/** How many times the set is repeated, so the loop never shows an empty tail. */
const REPEATS = 4

type Step = "password" | "code"

/**
 * One endlessly scrolling column: the set rendered REPEATS times and translated
 * by exactly one set-height per cycle, so the wrap is seamless.
 */
function MarqueeColumn({ images, top, reverse }: { images: ImageSourcePropType[]; top: number; reverse: boolean }) {
  const [width, setWidth] = React.useState(0)
  const tile = (width * 4) / 3
  const setHeight = images.length * (tile + COLLAGE_GAP)
  const progress = React.useRef(new Animated.Value(0)).current

  React.useEffect(() => {
    if (!setHeight) return
    let loop: Animated.CompositeAnimation | null = null
    let cancelled = false
    // Reduce-motion holds the collage still rather than drifting it.
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return
      progress.setValue(0)
      loop = Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: (setHeight / MARQUEE_SPEED) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      )
      loop.start()
    })
    return () => {
      cancelled = true
      loop?.stop()
    }
  }, [setHeight, progress])

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-setHeight, 0] : [0, -setHeight],
  })

  return (
    <View style={[styles.column, { marginTop: top }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={{ transform: [{ translateY }] }}>
          {Array.from({ length: REPEATS }, () => images)
            .flat()
            .map((src, i) => (
              <Image
                key={i}
                source={src}
                contentFit="cover"
                transition={0}
                style={{ width, height: tile, borderRadius: TILE_RADIUS, marginBottom: COLLAGE_GAP }}
              />
            ))}
        </Animated.View>
      )}
    </View>
  )
}

export default function LoginScreen() {
  const c = useTheme()
  const toast = useToast()
  const insets = useSafeAreaInsets()
  const [step, setStep] = React.useState<Step>("password")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  // Per-field messages. `error` stays for what the SERVER says ("wrong password"),
  // which belongs to the attempt rather than to one input.
  const [fieldErrors, setFieldErrors] = React.useState<{ email?: string; password?: string; code?: string }>({})
  const [busy, setBusy] = React.useState(false)

  // KEYBOARD: slide the whole page up exactly far enough that the form ends just
  // above the keyboard — the Lumex approach. A scroll view would let the collage
  // and the form scroll apart; this keeps the page one piece.
  const formRef = React.useRef<View>(null)
  const shift = React.useRef(new Animated.Value(0)).current
  React.useEffect(() => {
    const move = (to: number) =>
      Animated.timing(shift, { toValue: to, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start()
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      formRef.current?.measureInWindow((_x, y, _w, h) => {
        const overlap = y + h + spacing.md - e.endCoordinates.screenY
        if (overlap > 0) move(-overlap)
      })
    })
    const hide = Keyboard.addListener("keyboardDidHide", () => move(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [shift])

  const submitPassword = async () => {
    // Checked here rather than left to the server: a malformed address comes back
    // as "invalid login credentials", which reads as "wrong password".
    const found: { email?: string; password?: string } = {}
    if (!email.trim()) found.email = "Enter your email address"
    else found.email = emailProblem(email) ?? undefined
    if (!password) found.password = "Enter your password"
    setFieldErrors(found)
    if (found.email || found.password) {
      feedback.error()
      return
    }
    Keyboard.dismiss()
    setBusy(true)
    setError("")
    const checked = await verifyPassword(email, password)
    if ("error" in checked) {
      setBusy(false)
      setError(checked.error)
      feedback.error()
      return
    }
    const sent = await sendEmailOtp(email)
    setBusy(false)
    if ("error" in sent) {
      setError(sent.error)
      feedback.error()
      return
    }
    feedback.tap()
    setStep("code")
  }

  const submitCode = async () => {
    const digits = code.replace(/[^0-9]/g, "")
    const problem = !digits
      ? "Enter the code from your email"
      : digits.length !== OTP_LENGTH
        ? `The code is ${OTP_LENGTH} digits`
        : undefined
    setFieldErrors({ code: problem })
    if (problem) {
      feedback.error()
      return
    }
    setBusy(true)
    setError("")
    const result = await verifyEmailOtp(email, code)
    setBusy(false)
    if ("error" in result) {
      setError(result.error)
      feedback.error()
      return
    }
    // No navigation: verifyOtp establishes the session and RootNavigator swaps
    // this screen for the tabs.
    feedback.unlocked()
  }

  const resend = async () => {
    setBusy(true)
    const sent = await sendEmailOtp(email)
    setBusy(false)
    setError("error" in sent ? sent.error : "")
    if (!("error" in sent)) {
      feedback.tap()
      toast.show({ message: `A new code is on its way to ${email.trim()}`, tone: "success" })
    }
  }

  const onCode = step === "code"

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Animated.View style={[styles.root, { transform: [{ translateY: shift }] }]}>
        {/* THE COLLAGE — bleeds off the top edge, fades into the page. */}
        <View style={styles.collage} pointerEvents="none">
          <View style={styles.collageRow}>
            {COLLAGE.map((col, i) => (
              <MarqueeColumn key={i} images={col.images} top={col.top} reverse={i === 1} />
            ))}
          </View>
          <LinearGradient
            colors={[`${c.background}00`, `${c.background}CC`, c.background]}
            locations={[0, 0.55, 1]}
            style={styles.fade}
          />
          {/* A light veil under the status bar so the clock stays readable over a photo. */}
          <LinearGradient
            colors={[`${c.background}B3`, `${c.background}00`]}
            style={[styles.topVeil, { height: insets.top + 24 }]}
          />
        </View>

        {/* THE FORM */}
        <View style={[styles.content, { backgroundColor: c.background, paddingBottom: insets.bottom + spacing.xl }]}>
          <Text style={[styles.title, { color: c.text }]}>
            {onCode ? (
              "Check your email"
            ) : (
              <>
                Welcome to <Text style={{ color: c.primary, fontFamily: font.bold }}>Ortex</Text>
              </>
            )}
          </Text>
          <Text style={[textVariants.screenSubtitle, styles.subtitle, { color: c.textSecondary }]}>
            {onCode
              ? `We sent a ${OTP_LENGTH}-digit code to ${email.trim()}. It expires in a few minutes.`
              : "Sign in with your Ortex console account."}
          </Text>

          <View ref={formRef} collapsable={false} style={styles.fields}>
            {onCode ? (
              <TextField
                label="One-Time Code"
                value={code}
                onChangeText={(v) => {
                  setCode(v.replace(/[^0-9]/g, ""))
                  setFieldErrors((e) => ({ ...e, code: undefined }))
                }}
                error={fieldErrors.code}
                maxLength={OTP_LENGTH}
                placeholder="Enter the 6-digit code"
                keyboardType="number-pad"
                autoComplete="one-time-code"
                editable={!busy}
                leadingIcon="lock"
                onSubmitEditing={submitCode}
                returnKeyType="go"
                fieldStyle={styles.noMargin}
              />
            ) : (
              <>
                <TextField
                  label="Email"
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v)
                    setFieldErrors((e) => ({ ...e, email: undefined }))
                  }}
                  error={fieldErrors.email}
                  placeholder="Enter your email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  editable={!busy}
                  leadingIcon="mail"
                  returnKeyType="next"
                  fieldStyle={styles.noMargin}
                />
                <View>
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v)
                      setFieldErrors((e) => ({ ...e, password: undefined }))
                    }}
                    error={fieldErrors.password}
                    placeholder="Enter your password"
                    secureTextEntry
                    autoCapitalize="none"
                    editable={!busy}
                    leadingIcon="lock"
                    onSubmitEditing={submitPassword}
                    returnKeyType="go"
                    fieldStyle={styles.noMargin}
                  />
                  <Pressable
                    onPress={() =>
                      toast.show({
                        message: "Ask an Ortex admin to reset it from Team → your name → Reset password.",
                        tone: "neutral",
                      })
                    }
                    hitSlop={10}
                    style={styles.link}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.linkText, { color: c.primary }]}>Forgot password?</Text>
                  </Pressable>
                </View>
              </>
            )}

            {!!error && <Text style={[textVariants.small, { color: c.dangerText }]}>{error}</Text>}
          </View>

          <Button
            label={onCode ? "Sign in" : "Login"}
            onPress={onCode ? submitCode : submitPassword}
            loading={busy}
            fullWidth
            style={styles.submit}
          />

          {onCode && (
            <View style={styles.secondary}>
              <Pressable onPress={resend} disabled={busy} hitSlop={10} accessibilityRole="button">
                <Text style={[styles.linkText, { color: c.primary }]}>Send another code</Text>
              </Pressable>
              <Text style={{ color: c.textTertiary }}>·</Text>
              <Pressable
                onPress={() => {
                  setStep("password")
                  setCode("")
                  setError("")
                }}
                disabled={busy}
                hitSlop={10}
                accessibilityRole="button"
              >
                <Text style={[styles.linkText, { color: c.textSecondary }]}>Use a different email</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // flex: 1 with a floor: the collage takes whatever the form leaves, and never
  // shrinks to a sliver on a short phone.
  collage: { flex: 1, minHeight: 280, overflow: "hidden", marginTop: -30 },
  collageRow: { flexDirection: "row", gap: COLLAGE_GAP, paddingHorizontal: COLLAGE_GAP },
  column: { flex: 1 },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 160 },
  topVeil: { position: "absolute", left: 0, right: 0, top: 30 },
  // Overlaps the fade by a little so there is no hard seam between the two.
  content: { paddingHorizontal: gutter, marginTop: -24 },
  title: { fontSize: 28, lineHeight: 36, fontFamily: font.semibold },
  subtitle: { marginTop: spacing.xs },
  // Rhythm: title block to fields 28, fields 20 apart, fields to button 32.
  fields: { marginTop: 28, gap: 20 },
  noMargin: { marginBottom: 0 },
  link: { alignSelf: "flex-end", marginTop: spacing.sm },
  linkText: { fontSize: 14, lineHeight: 20, fontFamily: font.medium },
  submit: { marginTop: 32 },
  secondary: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
})
