import AsyncStorage from "@react-native-async-storage/async-storage"
import type { Session } from "@supabase/supabase-js"
import React from "react"

import { clearCache } from "@/data/cache"
import { supabase } from "@/data/supabase"
import type { Profile } from "@/domain/modules"
import { signOut as authSignOut } from "@/lib/auth"

// Session + profile for the whole app.
//
// `profiles` is a real relational table (not a `doc` jsonb collection like the
// rest), so it is read directly rather than through repo. It carries the role
// and the per-user `modules` list that decides which tabs exist — see
// domain/modules.ts.

const BIOMETRIC_KEY = "@ortex/biometric"

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  /** False until getSession() has resolved — avoids a login flash on launch. */
  ready: boolean
  biometricEnabled: boolean
  setBiometricEnabled: (on: boolean) => void
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [ready, setReady] = React.useState(false)
  const [biometricEnabled, setBiometricState] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return
        setSession(data.session)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    AsyncStorage.getItem(BIOMETRIC_KEY)
      .then((v) => {
        if (alive) setBiometricState(v === "1")
      })
      .catch(() => {})

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id

  const loadProfile = React.useCallback(async () => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
    // A signed-in user with no profile row is a provisioning slip, not a reason
    // to crash — fall back to the least-privileged shape so the app renders and
    // the empty tab list makes the problem obvious.
    setProfile((data as Profile) || { id: userId, role: "sales", modules: [] })
  }, [userId])

  React.useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const setBiometricEnabled = React.useCallback((on: boolean) => {
    setBiometricState(on)
    AsyncStorage.setItem(BIOMETRIC_KEY, on ? "1" : "0").catch(() => {})
  }, [])

  const signOut = React.useCallback(async () => {
    await authSignOut()
    await clearCache()
    setProfile(null)
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      ready,
      biometricEnabled,
      setBiometricEnabled,
      refreshProfile: loadProfile,
      signOut,
    }),
    [session, profile, ready, biometricEnabled, setBiometricEnabled, loadProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
