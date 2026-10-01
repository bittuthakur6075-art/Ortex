// Admin authentication.
//
// When Supabase is configured (VITE_SUPABASE_URL/ANON_KEY) this is REAL auth:
// email + password against Supabase Auth, sessions persisted and refreshed by
// the SDK. When it isn't, it falls back to the original client-side passphrase
// gate so the app still runs against localStorage with no backend.
//
// The exported surface (isAuthed / login / logout / useAuth / changePassword)
// is stable across both modes; callers don't care which is active.

import { useSyncExternalStore } from "react"
import { supabase, hasSupabase, createEphemeralClient } from "../data/store/supabaseClient"

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

// True once we know the real session state, lets the UI avoid a login flash
// on refresh while getSession() resolves.
export function authReady() {
  return hasSupabase ? sessionLoaded : true
}

// login(email, password) with Supabase; legacy mode uses `password` only and
// ignores `email`. Returns { ok: true } or { error: message }.
export async function login(email, password) {
  if (hasSupabase) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? fail(error) : { ok: true }
  }
  // Offline demo mode. The default passphrase is always accepted, alongside any
  // custom one set earlier through changePassword. That is deliberate: this data
  // lives in the visitor's own localStorage, which they can read and edit
  // directly, so the gate is a speed bump rather than a security control, and a
  // stale custom value must never lock someone out of their own demo. Real
  // access control is Supabase auth plus RLS, used whenever it is configured.
  const stored = localStorage.getItem(PASSWORD_KEY)
  if (password === DEFAULT_PASSWORD || (stored && password === stored)) {
    sessionStorage.setItem(SESSION_KEY, "1")
    window.dispatchEvent(new Event(AUTH_EVENT))
    return { ok: true }
  }
  return { error: `Incorrect password. In offline demo mode the passphrase is "${DEFAULT_PASSWORD}".` }
}

// Supabase sometimes returns an empty body ("{}") or a server phrase no person
// should read; turn those into a sentence they can act on.
const fail = (error) => {
  const msg = error?.message || ""
  if (/sending (magic link|recovery|confirmation) email/i.test(msg)) return { error: "We could not email your code right now. Try again in a few minutes, or tell your admin." }
  if (!msg || msg === "{}") return { error: "The sign-in service did not answer. Try again in a moment." }
  return { error: msg }
}

// ---- Sign-in: email and password ----
//
// The emailed code step was removed (owner's decision, 2026-10-01): it was a
// UI-level step, not a real second factor, and it locked everyone out whenever
// the mail server failed. For an enforceable factor use Supabase MFA (TOTP).
export async function signIn(email, password) {
  if (!hasSupabase) return login(email, password)
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  return error ? fail(error) : { ok: true }
}

// ---- Forgot password, by emailed code ----
//
// Mirrors Ortex.Mobile/src/lib/auth.ts. The whole reset runs on ONE ephemeral
// client held by the login page: the code is verified there and the password is
// changed there, then that client is signed out. The shared client never holds
// the recovery session, so the route guard cannot let anyone into the console
// before a new password exists. Only then does the console sign in, with the new
// password and no second code: the person proved they own the inbox a minute ago.

const NOT_CONFIGURED = { error: "Password reset requires Supabase to be configured." }

// Reset step 1. An address with no account gets the same answer as one that
// has, so this page cannot be used to find out who has a console login.
export async function sendResetCode(email) {
  if (!hasSupabase) return NOT_CONFIGURED
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false },
  })
  if (error && /signups? not allowed|user not found/i.test(error.message)) return { ok: true }
  return error ? fail(error) : { ok: true }
}

// Reset step 2. Returns { ok, reset } where `reset` is handed back to step 3.
export async function verifyResetCode(email, token) {
  if (!hasSupabase) return NOT_CONFIGURED
  const client = createEphemeralClient()
  const { data, error } = await client.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "email" })
  if (error || !data.session) return { error: error?.message || "That code was not accepted." }
  return { ok: true, reset: { client, email: email.trim() } }
}

// Reset step 3. `passwordChanged` tells the page whether to send the person to
// the normal sign-in (the password is new, only the automatic sign-in failed).
export async function finishPasswordReset(reset, next) {
  const { error } = await reset.client.auth.updateUser({ password: next })
  if (error) return { error: error.message, passwordChanged: false }
  await reset.client.auth.signOut({ scope: "local" }).catch(() => {})
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: reset.email, password: next })
  return signInError
    ? { error: "Password changed. Sign in with your new password.", passwordChanged: true }
    : { ok: true }
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

// ---- Login sessions (migration 0063) ----
// Every device signed in to this account, newest activity first, this one on top.
export async function listSessions() {
  if (!hasSupabase) return { sessions: [] }
  const { data, error } = await supabase.rpc("my_sessions")
  return error ? fail(error) : { sessions: data || [] }
}

export async function revokeSession(id) {
  const { error } = await supabase.rpc("revoke_my_session", { p_id: id })
  return error ? fail(error) : { ok: true }
}

export async function logoutOtherDevices() {
  const { error } = await supabase.auth.signOut({ scope: "others" })
  return error ? fail(error) : { ok: true }
}

// Change the signed-in user's password. Returns { ok } | { error }.
export async function changePassword(next) {
  if (hasSupabase) {
    const { error } = await supabase.auth.updateUser({ password: next })
    return error ? fail(error) : { ok: true }
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

// Reactive form of authReady(), re-renders when the session finishes loading,
// even for a logged-out user (where isAuthed stays false).
export function useAuthReady() {
  return useSyncExternalStore(subscribe, authReady, () => true)
}
