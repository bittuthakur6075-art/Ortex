import React from "react"
import { StyleSheet, Text, View } from "react-native"

import { changePassword, verifyPassword } from "@/lib/auth"
import { feedback } from "@/lib/feedback"
import type { StackScreenProps } from "@/navigation/types"
import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { textVariants } from "@/theme/typography"
import { AppScreen, Button, Section, TextField, useToast } from "@/ui"

/**
 * Change password.
 *
 * PORT OF Ortex.Admin/src/components/ui/PasswordCard.jsx, including the part
 * that matters: the CURRENT password is checked first, by re-authenticating,
 * before the new one is set. Supabase's `updateUser({ password })` will happily
 * change the password of whoever holds the session — so on an unlocked, unwatched
 * phone, skipping that check would let a passer-by lock the owner out of their
 * own account.
 *
 * The check runs on an EPHEMERAL client (lib/auth.ts `verifyPassword`), so a
 * wrong attempt cannot disturb or replace the session this app is holding.
 *
 * A full screen rather than a bottom sheet: three fields plus a keyboard leaves a
 * sheet with nothing to show, and this is a destination, not a quick choice.
 */

/** Supabase's own floor. Anything shorter is refused server-side anyway. */
const MIN_LENGTH = 6

export default function ChangePasswordScreen({ navigation }: StackScreenProps<"ChangePassword">) {
  const t = useTheme()
  const toast = useToast()
  const { profile, session } = useAuth()
  const email = profile?.email || session?.user?.email || ""

  const [current, setCurrent] = React.useState("")
  const [next, setNext] = React.useState("")
  const [confirm, setConfirm] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submit = async () => {
    if (!current) return setError("Enter your current password")
    if (next.length < MIN_LENGTH) return setError(`Your new password must be at least ${MIN_LENGTH} characters`)
    if (next !== confirm) return setError("The two new passwords do not match")
    if (next === current) return setError("That is the password you already have")

    setError(null)
    setBusy(true)
    try {
      const check = await verifyPassword(email, current)
      if ("error" in check) {
        feedback.error()
        setError("That is not your current password")
        return
      }
      const res = await changePassword(next)
      if ("error" in res) {
        feedback.error()
        setError(res.error)
        return
      }
      feedback.created()
      toast.show({ message: "Password updated", tone: "success" })
      navigation.goBack()
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppScreen
      title="Change password"
      back
      onBack={() => navigation.goBack()}
      inTabs={false}
      contentStyle={styles.content}
    >
      <Text style={[textVariants.body, styles.pageText, { color: t.textSecondary }]}>
        You will keep using {email || "your account"} to sign in. Only the password changes.
      </Text>

      <Section bodyStyle={styles.form}>
        <TextField
          label="Current Password"
          value={current}
          onChangeText={(v) => {
            setCurrent(v)
            setError(null)
          }}
          placeholder="Enter current password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
        />
        <TextField
          label="New Password"
          value={next}
          onChangeText={(v) => {
            setNext(v)
            setError(null)
          }}
          placeholder="Enter new password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="Confirm New Password"
          value={confirm}
          onChangeText={(v) => {
            setConfirm(v)
            setError(null)
          }}
          placeholder="Re-enter new password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          error={error ?? undefined}
          onSubmitEditing={() => void submit()}
          returnKeyType="done"
        />
      </Section>

      <View style={styles.action}>
        <Button label="Update password" fullWidth loading={busy} onPress={() => void submit()} />
      </View>

      <Text style={[textVariants.caption, styles.pageText, { color: t.textTertiary }]}>
        Signing in still needs the code emailed to you afterwards. Other devices stay signed in.
      </Text>
    </AppScreen>
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl },
  section: {},
  // The fields bring their own bottom margin; the panel only needs its sides.
  form: { paddingHorizontal: gutter, paddingTop: spacing.xs, paddingBottom: 0 },
  // Loose copy on a full-bleed page carries the gutter itself.
  pageText: { paddingHorizontal: gutter, marginBottom: spacing.lg },
  action: { paddingHorizontal: gutter, marginTop: spacing.lg, marginBottom: spacing.md },
})
