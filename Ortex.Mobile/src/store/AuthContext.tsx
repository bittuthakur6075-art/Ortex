import AsyncStorage from "@react-native-async-storage/async-storage"
import type { Session } from "@supabase/supabase-js"
import React from "react"

import { clearCache } from "@/data/cache"
import { resetCollections } from "@/data/collectionStore"
import { errorMessage, supabase } from "@/data/supabase"
import { isAdmin, type Profile } from "@/domain/modules"
import { signOut as authSignOut } from "@/lib/auth"
import { resetNotificationState } from "@/lib/notificationStore"
import { dismissAll } from "@/lib/push"
import { unregisterPushDevice } from "@/lib/remotePush"

// Session + profile for the whole app.
//
// `profiles` is a real relational table (not a `doc` jsonb collection like the
// rest), so it is read directly rather than through repo. It carries the role
// and the per-user `modules` list that decides which tabs exist — see
// domain/modules.ts.

const BIOMETRIC_KEY = "@ortex/biometric"
const PROFILE_KEY = "@ortex/profile"

/** The last profile this handset read for `userId`, or null. Never another user's. */
async function readCachedProfile(userId: string): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Profile
    return parsed?.id === userId ? parsed : null
  } catch {
    return null
  }
}

/**
 * The grants of this profile's role (`role_permissions`, migration 0032). Admins
 * need none. Undefined when the row cannot be read (the migration is not pushed,
 * or no signal), in which case domain/modules.ts falls back to the seed defaults.
 */
async function readRoleModules(profile: Profile): Promise<string[] | undefined> {
  if (!profile.role || isAdmin(profile.role)) return undefined
  try {
    const { data, error } = await supabase
      .from("role_permissions")
      .select("modules")
      .eq("role", profile.role)
      .maybeSingle()
    if (error || !data) return undefined
    const modules = (data as { modules?: unknown }).modules
    return Array.isArray(modules) ? modules.map(String) : undefined
  } catch {
    return undefined
  }
}

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  /** Set when the profile could not be read from the server; `profile` may then be the cached copy or null. */
  profileError: string | null
  /** False until getSession() has resolved — avoids a login flash on launch. */
  ready: boolean
  biometricEnabled: boolean
  /** False until the stored app-lock preference has been read back. */
  biometricReady: boolean
  setBiometricEnabled: (on: boolean) => void
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<Profile | null>(null)
  const [profileError, setProfileError] = React.useState<string | null>(null)
  const [ready, setReady] = React.useState(false)
  const [biometricEnabled, setBiometricState] = React.useState(false)
  // The app-lock cannot arm until this is true. `biometricEnabled` starts false
  // and only becomes true once AsyncStorage answers, so a lock decision taken
  // before that reads "off" on every cold start and the gate never appears.
  const [biometricReady, setBiometricReady] = React.useState(false)

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
      .finally(() => {
        if (alive) setBiometricReady(true)
      })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id

  const loadProfile = React.useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setProfileError(null)
      return
    }
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
    if (error) {
      // No signal on a cold start. The profile decides which tabs exist, so
      // without it the app had nothing to draw and the navigator threw. Use the
      // copy saved from the last successful read; only a first-ever launch with
      // no network has nothing, and RootNavigator shows that case as a screen.
      const cached = await readCachedProfile(userId)
      setProfile(cached)
      setProfileError(errorMessage(error, "Could not load your account"))
      return
    }
    // A signed-in user with no profile row is a provisioning slip, not a reason
    // to crash — fall back to the least-privileged shape so the app renders and
    // the empty tab list makes the problem obvious.
    const base = (data as Profile) || { id: userId, role: "staff", modules: [] }
    const next: Profile = { ...base, roleModules: await readRoleModules(base) }
    setProfile(next)
    setProfileError(null)
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next)).catch(() => {})
  }, [userId])

  React.useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  // The Super Admin can change what a role may open (Roles & permissions in the
  // console). Follow it live: a change to THIS role's row re-reads the profile
  // and its grants, so a tab appears or goes without a restart. One channel for
  // this one table, as repo.ts does for every other: Realtime fails a whole
  // channel when any binding names a table outside the publication.
  const role = profile?.role
  React.useEffect(() => {
    if (!userId || !role || isAdmin(role)) return
    const channel = supabase
      .channel(`ortex-role-permissions-${role}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "role_permissions", filter: `role=eq.${role}` },
        () => void loadProfile(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, role, loadProfile])

  const setBiometricEnabled = React.useCallback((on: boolean) => {
    setBiometricState(on)
    AsyncStorage.setItem(BIOMETRIC_KEY, on ? "1" : "0").catch(() => {})
  }, [])

  const signOut = React.useCallback(async () => {
    // First, while the session still exists: RLS scopes the delete to the
    // caller, and a phone that stays registered keeps ringing with the last
    // rep's leads after they have signed out.
    await unregisterPushDevice().catch(() => {})
    await authSignOut()
    await clearCache()
    resetCollections()
    // The next person to sign in on this handset starts with an empty inbox and
    // an empty shade, not the last rep's read marks.
    resetNotificationState()
    void dismissAll()
    AsyncStorage.removeItem(PROFILE_KEY).catch(() => {})
    setProfile(null)
    setProfileError(null)
  }, [])

  const value = React.useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      profileError,
      ready,
      biometricEnabled,
      biometricReady,
      setBiometricEnabled,
      refreshProfile: loadProfile,
      signOut,
    }),
    [session, profile, profileError, ready, biometricEnabled, biometricReady, setBiometricEnabled, loadProfile, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
