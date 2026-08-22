// Supabase browser client — created from Vite env vars. Both values are safe
// to expose in the client (the anon key is public; RLS enforces access). Set
// them in Ortex.Admin/.env (see .env.example). If they're absent we export
// null so the app can cleanly fall back to localStore.

import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(url && anonKey)

export const supabase = hasSupabase
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

// supabase-js throws a generic "Edge Function returned a non-2xx status code"
// and hides the body, so the specific reason our functions return — quota,
// safety refusal, missing config — never reaches the user. Dig it back out.
export async function functionErrorMessage(error, fallback = "Something went wrong") {
  if (!error) return fallback
  try {
    const body = await error.context?.json?.()
    if (body?.error) return body.error
  } catch {
    /* body was not JSON — fall through to the generic message */
  }
  return error.message || fallback
}

// A throwaway client that never persists a session and never fires auth events
// on the shared client above. Used by the two-step sign-in to check a password
// without the resulting session reaching the app (which would race the route
// guard and let the user in before the emailed code is entered).
export function createEphemeralClient() {
  if (!hasSupabase) return null
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
