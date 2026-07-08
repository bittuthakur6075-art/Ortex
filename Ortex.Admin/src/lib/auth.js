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
import { supabase, hasSupabase } from "../data/supabaseClient"

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

export async function signUp(email, password, name = "") {
  if (hasSupabase) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          role: email === "louis.sharma37@gmail.com" ? "admin" : "sales",
          modules: email === "louis.sharma37@gmail.com"
            ? ["leads","enquiries","customers","products","categories","quotations","invoices","payments","automation","users","settings"]
            : ["leads","enquiries","customers"]
        }
      }
    })
    return error ? { error: error.message } : { ok: true }
  }
  return { error: "Local/Demo mode does not support user registration." }
}

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
