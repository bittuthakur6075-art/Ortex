// Supabase client for React Native.
//
// Same project, same anon key and same RLS as Ortex.Admin — this app is another
// client of the console's database, not a second backend. The key is public by
// design; RLS is what enforces access.
//
// Three RN-specific differences from Ortex.Admin/src/data/store/supabaseClient.js:
//   - `react-native-url-polyfill` — supabase-js builds URLs with the WHATWG API,
//     which Hermes does not ship.
//   - AsyncStorage as the session store; there is no localStorage here.
//   - `detectSessionInUrl: false` — there is no URL bar to read a token out of,
//     and leaving it on makes the client reach for `window.location`.

import "react-native-url-polyfill/auto"

import AsyncStorage from "@react-native-async-storage/async-storage"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { AppState } from "react-native"

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@env"

const url = SUPABASE_URL
const anonKey = SUPABASE_ANON_KEY

export const hasSupabase = Boolean(url && anonKey)

if (!hasSupabase && __DEV__) {
  // Loud in development, silent in a release build — a missing .env is a setup
  // mistake, not a runtime condition worth crashing a salesperson's phone over.
  console.warn("[ortex] SUPABASE_URL / SUPABASE_ANON_KEY are missing — copy .env.example to .env")
}

export const supabase: SupabaseClient = createClient(url || "http://localhost", anonKey || "anon", {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

// On the web the SDK refreshes the token on a timer that the browser keeps
// alive. A backgrounded phone freezes those timers, so without this the access
// token quietly expires and the next request 401s. Refresh only while the app is
// actually in front of the user.
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})

/**
 * A throwaway client that never persists a session and never fires auth events
 * on the shared client above. Used by the two-step sign-in to check a password
 * without the resulting session reaching the app (which would let the user in
 * before the emailed code is entered).
 */
export function createEphemeralClient(): SupabaseClient {
  return createClient(url || "http://localhost", anonKey || "anon", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** Turn a supabase-js / PostgREST error into something worth showing a user. */
export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback
  if (typeof error === "string") return error
  const message = (error as { message?: string }).message
  if (!message) return fallback
  // The SDK's network failure is the single most common one in the field and
  // its wording ("Network request failed") tells a salesperson nothing.
  if (/network request failed|fetch failed/i.test(message)) {
    return "No connection. Check your mobile data and try again."
  }
  return message
}
