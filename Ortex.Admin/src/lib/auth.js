// Admin authentication.
//
// When Supabase is configured (VITE_SUPABASE_URL/ANON_KEY) this is REAL auth —
// email + password against Supabase Auth, sessions persisted and refreshed by
// the SDK. When it isn't, it falls back to the original client-side passphrase
// gate so the app still runs against localStorage with no backend.
//
// The exported surface (isAuthed / login / logout / useAuth / changePassword)
// is stable across both modes; callers don't care which is active.

import { useSyncExternalStore } from "react"
import { supabase, hasSupabase, createEphemeralClient } from "../data/supabaseClient"

// ---- Supabase-backed session (cached synchronously for useSyncExternalStore) ----
let currentSession = null
let sessionLoaded = false
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

if (hasSupabase) {
  supabase.auth.getSession().then(({ data }) => {
    currentSession = data.session
    sessionLoaded = true
    emit()
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    currentSession = session
    sessionLoaded = true
    emit()
  })
}

// ---- legacy passphrase gate (fallback when no backend) ----
const PASSWORD_KEY = "ortex_admin_password"
const SESSION_KEY = "ortex_admin_session"
const DEFAULT_PASSWORD = "ortex@admin"
const AUTH_EVENT = "ortex-admin-auth"

export function isAuthed() {
  if (hasSupabase) return currentSession != null
  return sessionStorage.getItem(SESSION_KEY) === "1"
}

// True once we know the real session state — lets the UI avoid a login flash
// on refresh while getSession() resolves.
export function authReady() {
  return hasSupabase ? sessionLoaded : true
}

// login(email, password) with Supabase; legacy mode uses `password` only and
// ignores `email`. Returns { ok: true } or { error: message }.
export async function login(email, password) {
  if (hasSupabase) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : { ok: true }
  }
  if (password === (localStorage.getItem(PASSWORD_KEY) || DEFAULT_PASSWORD)) {
    sessionStorage.setItem(SESSION_KEY, "1")
    window.dispatchEvent(new Event(AUTH_EVENT))
    return { ok: true }
  }
  return { error: "Incorrect password. Please try again." }
}

// ---- Two-step sign-in: password, then a code emailed to the same address ----
//
// NOTE ON WHAT THIS DOES AND DOESN'T BUY YOU. This is a UI-level second step,
// not a cryptographic second factor. Supabase issues a session the moment the
// password is accepted, so someone holding a valid password can obtain a token
// from their own client without ever seeing the emailed code. What this flow
// does give you: the code check happens off a throwaway client (see
// createEphemeralClient), so the *console* never holds a session until the code
// is verified, and a stolen password alone will not sign anyone in through this
// UI. For an enforceable factor that RLS can check, use Supabase MFA (TOTP).

// Step 1. Check the password without letting the session reach the app.
export async function verifyPassword(email, password) {
  if (!hasSupabase) return login(email, password)

  const client = createEphemeralClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  // Drop the token immediately; nothing downstream should ever see it.
  await client.auth.signOut()
  return error ? { error: error.message } : { ok: true }
}

// Step 2. Mail a one-time code. shouldCreateUser:false keeps the console
// invite-only — without it, any typed address would be created and emailed a
// working code against the public anon key.
export async function sendEmailOtp(email) {
  if (!hasSupabase) return { error: "Email codes require Supabase to be configured." }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })
  return error ? { error: error.message } : { ok: true }
}

// Step 3. Exchange the code for the real session. This is what actually signs
// the user in: onAuthStateChange fires and useAuth() flips the app over.
export async function verifyEmailOtp(email, token) {
  if (!hasSupabase) return { error: "Email codes require Supabase to be configured." }

  const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: "email" })
  return error ? { error: error.message } : { ok: true }
}

// There is deliberately no signUp() here. The console is invite-only: accounts
// are created by an admin through the `admin-create-user` Edge Function, which
// verifies the caller is an admin before using the service-role key. Public
// signup would let anyone mint their own account against the (public) anon key.

export async function logout() {
  if (hasSupabase) {
    await supabase.auth.signOut()
    return
  }
  sessionStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new Event(AUTH_EVENT))
}

// Change the signed-in user's password. Returns { ok } | { error }.
export async function changePassword(next) {
  if (hasSupabase) {
    const { error } = await supabase.auth.updateUser({ password: next })
    return error ? { error: error.message } : { ok: true }
  }
  localStorage.setItem(PASSWORD_KEY, next)
  return { ok: true }
}

// Email of the signed-in user (Supabase mode) or null.
export function currentEmail() {
  return currentSession?.user?.email || null
}

// Auth user id of the signed-in user (Supabase mode) or null.
export function currentUserId() {
  return currentSession?.user?.id || null
}

function subscribe(cb) {
  if (hasSupabase) {
    listeners.add(cb)
    return () => listeners.delete(cb)
  }
  window.addEventListener(AUTH_EVENT, cb)
  return () => window.removeEventListener(AUTH_EVENT, cb)
}

export function useAuth() {
  return useSyncExternalStore(subscribe, isAuthed, () => false)
}

// Reactive form of authReady() — re-renders when the session finishes loading,
// even for a logged-out user (where isAuthed stays false).
export function useAuthReady() {
  return useSyncExternalStore(subscribe, authReady, () => true)
}
