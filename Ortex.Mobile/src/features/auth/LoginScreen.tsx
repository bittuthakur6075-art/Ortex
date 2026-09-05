import React from "react"
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { sendEmailOtp, verifyEmailOtp, verifyPassword } from "@/lib/auth"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { gutter, radius, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import AuroraBackground from "@/ui/AuroraBackground"
import { Button, Icon, TextField } from "@/ui"
import { OrtexWordmark } from "@/ui/OrtexLogo"

/**
 * Sign in.
 *
 * PORTED FROM C:\code\capnix\Capnix.Mobile.Partner\src\screens\public\SignInScreen.jsx.
 * The screen is two regions:
 *
 *   TOP     the aurora wash, with the Ortex lockup centred in it.
 *   BOTTOM  an opaque sheet carrying the whole form, anchored to the bottom edge.
 *
 * Two things are deliberate and easy to undo by accident:
 *
 * 1. THE SHEET IS THE PAGE COLOUR, NOT WHITE. Hardcoding white would put
 *    near-black text on white inside a dark-mode app. It is opaque on purpose —
 *    the form reads on a plain surface, and the wash is the region above it.
 *
 * 2. THE WASH REGION SHRINKS BUT NEVER DISAPPEARS. `flexShrink` with a
 *    `minHeight` is the pair that matters: shrink alone would let the region
 *    squeeze to nothing and the opaque sheet would paint over the mark, which
 *    reads as the logo being cropped by the card. Not shrinking pushes the region
 *    past the viewport instead and the mark leaves the top of the screen when the
 *    keyboard opens. The floor is the mark plus its own air.
 *
 * The flow itself is unchanged: password, then a code emailed to the same
 * address. Ortex is invite-only, so there is no sign-up path — a wrong email gets
 * "we could not sign you in", never an offer to register.
 */

const LOCKUP_HEIGHT = 34

type Step = "password" | "code"

export default function LoginScreen() {
  const c = useTheme()
  const insets = useSafeAreaInsets()
  const [step, setStep] = React.useState<Step>("password")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submitPassword = async () => {
    if (!email.trim() || !password) {
      setError("Enter your email and password")
      return
    }
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
    if (!code.trim()) {
      setError("Enter the code from your email")
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
    // No navigation here: verifyOtp establishes the session, onAuthStateChange
    // fires, and RootNavigator swaps this screen for the tabs.
    feedback.unlocked()
  }

  const resend = async () => {
    setBusy(true)
    const sent = await sendEmailOtp(email)
    setBusy(false)
    setError("error" in sent ? sent.error : "")
    if (!("error" in sent)) feedback.tap()
  }

  const onCode = step === "code"

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <AuroraBackground />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* THE WASH REGION — the lockup centred in whatever the sheet leaves. */}
          <View
            style={[
              styles.wash,
              {
                minHeight: insets.top + spacing.xxl + LOCKUP_HEIGHT + spacing.lg,
                paddingTop: insets.top + spacing.xxl,
              },
            ]}
          >
            <OrtexWordmark height={LOCKUP_HEIGHT} />
          </View>

          {/* THE SHEET — opaque, full-bleed, anchored to the bottom edge. */}
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: c.background,
                paddingBottom: insets.bottom + spacing.xxl,
              },
            ]}
          >
            {onCode && (
              <View style={[styles.badge, { backgroundColor: c.accentTint }]}>
                <Icon name="mail" size={34} variant="Bulk" color={c.primary} />
              </View>
            )}

            <Text style={[textVariants.largeTitle, { color: c.text }, onCode && styles.centre]}>
              {onCode ? "Check your email" : "Sign in"}
            </Text>
            <Text
              style={[
                textVariants.screenSubtitle,
                { color: c.textSecondary, marginTop: spacing.sm },
                onCode && styles.centre,
              ]}
            >
              {onCode
                ? `We sent a one-time code to ${email.trim()}. It expires in a few minutes.`
                : "Use the same account as the Ortex admin console."}
            </Text>

            <View style={styles.form}>
              {onCode ? (
                <TextField
                  label="One-time code"
                  value={code}
                  onChangeText={setCode}
                  placeholder="6-digit code"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  editable={!busy}
                  onSubmitEditing={submitCode}
                  returnKeyType="go"
                />
              ) : (
                <>
                  <TextField
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@ortexindustries.in"
                    autoCapitalize="none"
                    autoComplete="email"
                    keyboardType="email-address"
                    editable={!busy}
                    leadingIcon="mail"
                  />
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Your password"
                    secureTextEntry
                    autoCapitalize="none"
                    editable={!busy}
                    leadingIcon="lock"
                    onSubmitEditing={submitPassword}
                    returnKeyType="go"
                  />
                </>
              )}

              {!!error && <Text style={[textVariants.small, { color: c.danger }]}>{error}</Text>}

              <Button
                label={onCode ? "Sign in" : "Continue"}
                onPress={onCode ? submitCode : submitPassword}
                loading={busy}
                fullWidth
                style={{ marginTop: spacing.md }}
              />

              {onCode && (
                <View style={styles.secondary}>
                  <Pressable onPress={resend} disabled={busy} hitSlop={10}>
                    <Text style={[textVariants.smallStrong, { color: c.primary }]}>Send another code</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setStep("password")
                      setCode("")
                      setError("")
                    }}
                    disabled={busy}
                    hitSlop={10}
                    style={{ marginTop: spacing.md }}
                  >
                    <Text style={[textVariants.small, { color: c.textTertiary }]}>Use a different email</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  wash: {
    flexGrow: 1,
    flexShrink: 1,
    // The guarantee rather than the mechanism: if a device ever squeezes below the
    // floor, the wash clips its own content instead of spilling under the sheet.
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    // The lockup must never sit flush against the sheet's top edge — touching it
    // reads as the mark being cropped, not as tight spacing.
    paddingBottom: spacing.lg,
  },
  sheet: {
    paddingHorizontal: gutter,
    paddingTop: spacing.xxl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.lg,
  },
  centre: { textAlign: "center" },
  form: { marginTop: spacing.xl },
  secondary: { alignItems: "center", marginTop: spacing.lg },
})
