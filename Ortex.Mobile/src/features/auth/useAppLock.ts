import * as LocalAuthentication from "expo-local-authentication"
import React from "react"
import { AppState, type AppStateStatus } from "react-native"

import { feedback } from "@/lib/feedback"

// Biometric app-lock.
//
// The Supabase session already persists across launches, which is what a
// salesperson wants — but it also means anyone holding the unlocked phone can
// read every customer's price list. This puts a fingerprint between the two,
// without touching the session itself.

/** Coming back within this window is the same trip; do not re-prompt. */
const GRACE_MS = 60 * 1000

export function useAppLock(enabled: boolean, ready: boolean) {
  const [locked, setLocked] = React.useState(enabled)
  const [prompting, setPrompting] = React.useState(false)
  const backgroundedAt = React.useRef<number | null>(null)

  // Turning the setting on locks nothing immediately (the user is right there);
  // turning it off must unlock at once or they are stuck behind a gate they
  // just disabled.
  React.useEffect(() => {
    if (!enabled) setLocked(false)
  }, [enabled])

  React.useEffect(() => {
    if (!enabled) return
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        const since = backgroundedAt.current
        if (since != null && Date.now() - since > GRACE_MS) setLocked(true)
        backgroundedAt.current = null
      } else if (state === "background") {
        backgroundedAt.current = Date.now()
      }
    })
    return () => sub.remove()
  }, [enabled])

  const unlock = React.useCallback(async () => {
    if (prompting) return
    setPrompting(true)
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      // A phone with no enrolled biometric would otherwise lock the user out of
      // an app they are legitimately signed in to. Let them through.
      if (!hasHardware || !enrolled) {
        setLocked(false)
        return
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Ortex Sales",
        fallbackLabel: "Use device passcode",
      })
      if (result.success) {
        feedback.unlocked()
        setLocked(false)
      }
    } catch {
      feedback.error()
    } finally {
      setPrompting(false)
    }
  }, [prompting])

  // Prompt as soon as the app is ready and locked, so the user is not left
  // looking at a lock screen wondering what to tap.
  React.useEffect(() => {
    if (ready && locked) void unlock()
    // `unlock` is intentionally omitted: including it re-prompts on every
    // prompting-state flip, which stacks two biometric dialogs on Android.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, locked])

  return { locked, prompting, unlock }
}

/** Is there a usable biometric on this device? Drives the Profile toggle. */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
  } catch {
    return false
  }
}
