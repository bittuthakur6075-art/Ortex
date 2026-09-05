import React from "react"
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { sendEmailOtp, verifyEmailOtp, verifyPassword } from "@/lib/auth"
import { feedback } from "@/lib/feedback"
import { useTheme } from "@/store/ThemeContext"
import { font } from "@/theme/typography"
import { Button, TextField } from "@/ui"

// Two-step sign-in, mirroring the console: password first, then a code emailed
// to the same address. Accounts are created by an admin, so there is no sign-up
// path here — a wrong email gets "we could not sign you in", never an offer to
// register.

type Step = "password" | "code"

export default function LoginScreen() {
  const t = useTheme()
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

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.brand, { color: t.accent }]}>Ortex</Text>
        <Text style={[styles.title, { color: t.text }]}>
          {step === "password" ? "Sign in" : "Check your email"}
        </Text>
        <Text style={[styles.hint, { color: t.textSecondary }]}>
          {step === "password"
            ? "Use the same account as the Ortex admin console."
            : `We sent a one-time code to ${email.trim()}.`}
        </Text>

        <View style={styles.form}>
          {step === "password" ? (
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
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                secureTextEntry
                autoCapitalize="none"
                editable={!busy}
                onSubmitEditing={submitPassword}
                returnKeyType="go"
              />
            </>
          ) : (
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
          )}

          {!!error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}

          <View style={styles.actions}>
            <Button
              label={step === "password" ? "Continue" : "Sign in"}
              onPress={step === "password" ? submitPassword : submitCode}
              loading={busy}
              fullWidth
            />
          </View>

          {step === "code" && (
            <View style={styles.secondary}>
              <Button label="Send another code" onPress={resend} variant="ghost" disabled={busy} />
              <Button
                label="Use a different email"
                onPress={() => {
                  setStep("password")
                  setCode("")
                  setError("")
                }}
                variant="ghost"
                disabled={busy}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24 },
  brand: { fontSize: 30, letterSpacing: -1, fontFamily: font.extrabold },
  title: { marginTop: 28, fontSize: 26, fontFamily: font.bold },
  hint: { marginTop: 6, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  form: { marginTop: 26 },
  error: { marginTop: 4, fontSize: 13, fontFamily: font.medium },
  actions: { marginTop: 18 },
  secondary: { marginTop: 6, alignItems: "center" },
})
