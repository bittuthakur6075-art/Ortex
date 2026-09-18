import { Image } from "expo-image"
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
import {
  finishPasswordReset,
  sendEmailOtp,
  sendResetCode,
  verifyEmailOtp,
  verifyPassword,
  verifyResetCode,
  type PasswordReset,
} from "@/lib/auth"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { font, textVariants } from "@/theme/typography"
import { Button, OtpField, TextField, useToast } from "@/ui"
import { arrivalStyle, useArrival } from "@/ui/motion"

/**
 * Sign in.
 *
 * PORTED FROM C:\code\lumex\Lumex.Mobile.Surveyor\src\screens\public\LoginScreen.js:
 *
 *   TOP     a three-column photo collage bleeding off the top edge, each column
 *           drifting endlessly (the middle one against the other two), above
 *           the form on its plain surface.
 *   CENTRE  "Welcome to Ortex" — one bold line, the brand word in the primary.
 *   BOTTOM  labelled fields with leading icons, "Forgot password?" under the
 *           password, and a full-width button.
 *
 * Substitutions from the Lumex screen, all deliberate: Reanimated is not a
 * dependency here, so the marquee runs on RN's Animated with the native driver
 * (a transform loop, so it stays off the JS thread); the tiles are expo-image
 * with a plain radius instead of SVG-clipped squircles, because nine SVG image
 * clips animating at once is the costliest possible way to draw a login page;
 * and there is no gradient over the photos (removed on the owner's instruction
 * 2026-09-14), so the collage meets the form on a plain edge.
 *
 * THE PHOTOS are free Pexels stock (assets/login, no attribution required),
 * chosen for what Ortex makes: lanyards and ID cards, laser cutting and
 * engraving, trophies, wooden keychains, gift boxes, the workshop. Replace them with
 * Ortex's own factory photography when it exists.
 *
 * THE FLOW IS UNCHANGED: password, then a code emailed to the same address.
 * Ortex is invite-only, so there is no sign-up. "Forgot password?" is a real
 * self-service reset by emailed code (see the FORGOT PASSWORD note in lib/auth.ts).
 */

const OTP_LENGTH = 6

/** Every tile is 3:4, so the column geometry follows from its measured width. */
const COLLAGE: { top: number; images: ImageSourcePropType[] }[] = [
  {
    top: 18,
    images: [
      require("../../../assets/login/lanyard-badges.jpg"),
      require("../../../assets/login/cnc-laser.jpg"),
      require("../../../assets/login/gift-boxes.jpg"),
    ],
  },
  {
    top: 0,
    images: [
      require("../../../assets/login/engraving-machine.jpg"),
      require("../../../assets/login/trophies.jpg"),
      require("../../../assets/login/wooden-keychains.jpg"),
    ],
  },
  {
    top: 18,
    images: [
      require("../../../assets/login/lanyard-person.jpg"),
      require("../../../assets/login/wood-workshop.jpg"),
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

/**
 * Sign-in is password → code. Forgot password is its own three steps on the same
 * page: the email, the code mailed to it, then the new password.
 */
type Step = "password" | "code" | "reset-email" | "reset-code" | "reset-password"

/** Supabase's own floor, as on ChangePasswordScreen. */
const MIN_PASSWORD_LENGTH = 6

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
  const [fieldErrors, setFieldErrors] = React.useState<{
    email?: string
    password?: string
    code?: string
    next?: string
    confirm?: string
  }>({})
  const [busy, setBusy] = React.useState(false)
  // Forgot password: the new password pair, and the verified recovery client
  // between the code step and the password step.
  const [nextPassword, setNextPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const resetRef = React.useRef<PasswordReset | null>(null)

  const goTo = (next: Step) => {
    setStep(next)
    setCode("")
    setError("")
    setFieldErrors({})
  }

  // KEYBOARD: slide the whole page up exactly far enough that the form ends just
  // above the keyboard — the Lumex approach. A scroll view would let the collage
  // and the form scroll apart; this keeps the page one piece.
  const formRef = React.useRef<View>(null)
  // The form lands the way a One UI page does (title, fields, button, links, one
  // step apart) on opening and again on each step of the flow, since a step
  // swaps the whole form in place and should read as a new page.
  const arrival = useArrival(step)
  const arrive = React.useMemo(() => [0, 1, 2, 3].map((i) => arrivalStyle(arrival, i)), [arrival])
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

  // Takes the code explicitly when OtpField completes it: `code` in this closure
  // is still the render before the last digit landed.
  const submitCode = async (typed?: string) => {
    const digits = (typed ?? code).replace(/[^0-9]/g, "")
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
    const result = await verifyEmailOtp(email, digits)
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
    const sent = step === "reset-code" ? await sendResetCode(email) : await sendEmailOtp(email)
    setBusy(false)
    setError("error" in sent ? sent.error : "")
    if (!("error" in sent)) {
      feedback.tap()
      toast.show({ message: `A new code is on its way to ${email.trim()}`, tone: "success" })
    }
  }

  // ── Forgot password ──────────────────────────────────────────────────────────

  const backToSignIn = () => {
    resetRef.current = null
    setNextPassword("")
    setConfirmPassword("")
    goTo("password")
  }

  const submitResetEmail = async () => {
    const problem = !email.trim() ? "Enter your email address" : (emailProblem(email) ?? undefined)
    setFieldErrors({ email: problem })
    if (problem) {
      feedback.error()
      return
    }
    Keyboard.dismiss()
    setBusy(true)
    setError("")
    const sent = await sendResetCode(email)
    setBusy(false)
    if ("error" in sent) {
      setError(sent.error)
      feedback.error()
      return
    }
    feedback.tap()
    goTo("reset-code")
  }

  const submitResetCode = async (typed?: string) => {
    const digits = (typed ?? code).replace(/[^0-9]/g, "")
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
    const result = await verifyResetCode(email, digits)
    setBusy(false)
    if ("error" in result) {
      setError(result.error)
      feedback.error()
      return
    }
    resetRef.current = result
    setNextPassword("")
    setConfirmPassword("")
    feedback.tap()
    goTo("reset-password")
  }

  const submitNewPassword = async () => {
    const found: { next?: string; confirm?: string } = {}
    if (nextPassword.length < MIN_PASSWORD_LENGTH) found.next = `Use at least ${MIN_PASSWORD_LENGTH} characters`
    if (!found.next && confirmPassword !== nextPassword) found.confirm = "The two passwords do not match"
    setFieldErrors(found)
    if (found.next || found.confirm) {
      feedback.error()
      return
    }
    const reset = resetRef.current
    if (!reset) {
      // Only reachable if the screen lost its state; start the reset again.
      goTo("reset-email")
      setError("Your code has expired. Ask for a new one.")
      return
    }
    Keyboard.dismiss()
    setBusy(true)
    setError("")
    const result = await finishPasswordReset(reset, nextPassword)
    setBusy(false)
    if ("error" in result) {
      feedback.error()
      if (result.passwordChanged) {
        backToSignIn()
        setPassword("")
      }
      setError(result.error)
      return
    }
    // No navigation: the app now holds a session and RootNavigator swaps this
    // screen for the tabs.
    feedback.unlocked()
    toast.show({ message: "Password changed", tone: "success" })
  }

  const copy: Record<Step, { title: React.ReactNode; subtitle: string; action: string; onSubmit: () => void }> = {
    password: {
      title: (
        <>
          Welcome to <Text style={{ color: c.primary, fontFamily: font.bold }}>Ortex</Text>
        </>
      ),
      subtitle: "Sign in with your Ortex console account.",
      action: "Login",
      onSubmit: submitPassword,
    },
    code: {
      title: "Check your email",
      subtitle: `We sent a ${OTP_LENGTH}-digit code to ${email.trim()}. It expires in a few minutes.`,
      action: "Sign in",
      onSubmit: () => void submitCode(),
    },
    "reset-email": {
      title: "Reset your password",
      subtitle: `Enter the email you sign in with. We will send a ${OTP_LENGTH}-digit code to it.`,
      action: "Send code",
      onSubmit: submitResetEmail,
    },
    "reset-code": {
      title: "Check your email",
      subtitle: `If ${email.trim()} has an Ortex account, a ${OTP_LENGTH}-digit code is on its way. It expires in a few minutes.`,
      action: "Verify code",
      onSubmit: () => void submitResetCode(),
    },
    "reset-password": {
      title: "Choose a new password",
      subtitle: `For ${email.trim()}. Use at least ${MIN_PASSWORD_LENGTH} characters.`,
      action: "Save and sign in",
      onSubmit: submitNewPassword,
    },
  }
  const screen = copy[step]

  const emailField = (
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
      returnKeyType={step === "reset-email" ? "go" : "next"}
      onSubmitEditing={step === "reset-email" ? submitResetEmail : undefined}
      fieldStyle={styles.noMargin}
    />
  )

  const codeField = (onComplete: (digits: string) => void) => (
    <OtpField
      label="One-Time Code"
      value={code}
      length={OTP_LENGTH}
      onChangeText={(v) => {
        setCode(v)
        setFieldErrors((e) => ({ ...e, code: undefined }))
        setError("")
      }}
      // The last digit submits, so a pasted or autofilled code needs no extra tap.
      onComplete={onComplete}
      error={fieldErrors.code}
      disabled={busy}
      autoFocus
    />
  )

  const link = (label: string, onPress: () => void, primary = true) => (
    <Pressable onPress={onPress} disabled={busy} hitSlop={10} accessibilityRole="button">
      <Text style={[styles.linkText, { color: primary ? c.primary : c.textSecondary }]}>{label}</Text>
    </Pressable>
  )

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <Animated.View style={[styles.root, { transform: [{ translateY: shift }] }]}>
        {/* THE COLLAGE — bleeds off the top edge. */}
        <View style={styles.collage} pointerEvents="none">
          <View style={styles.collageRow}>
            {COLLAGE.map((col, i) => (
              <MarqueeColumn key={i} images={col.images} top={col.top} reverse={i === 1} />
            ))}
          </View>
        </View>

        {/* THE FORM */}
        <View style={[styles.content, { backgroundColor: c.background, paddingBottom: insets.bottom + spacing.xl }]}>
          <Animated.View style={arrive[0]}>
            <Text style={[styles.title, { color: c.text }]}>{screen.title}</Text>
            <Text style={[textVariants.screenSubtitle, styles.subtitle, { color: c.textSecondary }]}>
              {screen.subtitle}
            </Text>
          </Animated.View>

          <Animated.View ref={formRef} collapsable={false} style={[styles.fields, arrive[1]]}>
            {step === "password" && (
              <>
                {emailField}
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
                    onPress={() => goTo("reset-email")}
                    disabled={busy}
                    hitSlop={10}
                    style={styles.link}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.linkText, { color: c.primary }]}>Forgot password?</Text>
                  </Pressable>
                </View>
              </>
            )}

            {step === "code" && codeField((v) => void submitCode(v))}

            {step === "reset-email" && emailField}

            {step === "reset-code" && codeField((v) => void submitResetCode(v))}

            {step === "reset-password" && (
              <>
                <TextField
                  label="New password"
                  value={nextPassword}
                  onChangeText={(v) => {
                    setNextPassword(v)
                    setFieldErrors((e) => ({ ...e, next: undefined }))
                  }}
                  error={fieldErrors.next}
                  placeholder="Enter a new password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!busy}
                  leadingIcon="lock"
                  returnKeyType="next"
                  autoFocus
                  fieldStyle={styles.noMargin}
                />
                <TextField
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v)
                    setFieldErrors((e) => ({ ...e, confirm: undefined }))
                  }}
                  error={fieldErrors.confirm}
                  placeholder="Enter it again"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={!busy}
                  leadingIcon="lock"
                  onSubmitEditing={submitNewPassword}
                  returnKeyType="go"
                  fieldStyle={styles.noMargin}
                />
              </>
            )}

            {!!error && <Text style={[textVariants.small, { color: c.dangerText }]}>{error}</Text>}
          </Animated.View>

          <Animated.View style={arrive[2]}>
            <Button label={screen.action} onPress={screen.onSubmit} loading={busy} fullWidth style={styles.submit} />
          </Animated.View>

          {step !== "password" && (
            <Animated.View style={[styles.secondary, arrive[3]]}>
              {(step === "code" || step === "reset-code") && (
                <>
                  {link("Send another code", resend)}
                  <Text style={{ color: c.textTertiary }}>·</Text>
                </>
              )}
              {step === "code"
                ? link("Use a different email", () => goTo("password"), false)
                : link("Back to sign in", backToSignIn, false)}
            </Animated.View>
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
  content: { paddingHorizontal: gutter, paddingTop: 30, marginTop: -24 },
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
