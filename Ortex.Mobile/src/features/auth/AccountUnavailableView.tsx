import React from "react"
import { StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import { Button, EmptyState } from "@/ui"

/**
 * Signed in, but the app cannot say what this person may see.
 *
 * Two ways here, both previously a crash. (1) A cold start with no signal on a
 * handset that has never completed a profile read: nothing cached, nothing to
 * draw tabs from. (2) A profile that grants no module at all: an account made
 * in the console and not yet given anything, so every tab is hidden and the
 * navigator had no screens to mount. Each is said in words with the one action
 * that can change it.
 */
export default function AccountUnavailableView({ reason }: { reason: "offline" | "no-modules" }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { profileError, refreshProfile, signOut } = useAuth()
  const [busy, setBusy] = React.useState(false)

  const retry = async () => {
    setBusy(true)
    try {
      await refreshProfile()
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <View style={styles.centre}>
        {reason === "offline" ? (
          <EmptyState
            icon="warning"
            title="Could not load your account"
            hint={`${profileError || "No connection."} Ortex needs signal the first time you sign in on this phone.`}
            actionLabel={busy ? "Trying…" : "Try again"}
            onAction={busy ? undefined : () => void retry()}
          />
        ) : (
          <EmptyState
            icon="lock"
            title="Nothing to show yet"
            hint="This account has no modules assigned. Ask an administrator to grant access in the console, then try again."
            actionLabel={busy ? "Checking…" : "Check again"}
            onAction={busy ? undefined : () => void retry()}
          />
        )}
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { flex: 1, justifyContent: "center", paddingHorizontal: gutter },
  footer: { alignItems: "center", paddingHorizontal: gutter },
})
