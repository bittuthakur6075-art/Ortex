import React from "react"
import { StyleSheet, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAuth } from "@/store/AuthContext"
import { useTheme } from "@/store/ThemeContext"
import { gutter, spacing } from "@/theme/tokens"
import Button from "@/ui/Button"
import EmptyState from "@/ui/EmptyState"

/**
 * The last line under every screen. Without it a render error anywhere closed
 * the whole app: 1.8.0's one-tab bar did that to every Staff login on launch.
 * Now the person sees what happened with Try again and Sign out, and the app
 * stays alive, so UpdateGate (which sits outside this) can still offer the
 * build that fixes it.
 */
type State = { error: Error | null }

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <CrashView error={this.state.error} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

function CrashView({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const t = useTheme()
  const insets = useSafeAreaInsets()
  const { signOut } = useAuth()

  return (
    <View style={[styles.root, { backgroundColor: t.background, paddingTop: insets.top }]}>
      <View style={styles.centre}>
        <EmptyState
          icon="warning"
          title="Something went wrong"
          hint={`This screen stopped working: ${error.message || "an unexpected error"}. Try again, and if it keeps happening, check for an app update or tell the office.`}
          actionLabel="Try again"
          onAction={onRetry}
        />
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => {
            void signOut()
            onRetry()
          }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centre: { flex: 1, justifyContent: "center", paddingHorizontal: gutter },
  footer: { alignItems: "center", paddingHorizontal: gutter },
})
