// Supabase client for the public marketing site. Uses the anon key (safe in
// the browser). Row-Level Security only permits anonymous INSERTs into the
// `enquiries` table — nothing can be read. Configure via .env (see .env.example).

import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(url && anonKey)
export const supabase = hasSupabase ? createClient(url, anonKey, { auth: { persistSession: false } }) : null

// Catalogue and gallery reads give up after this long and fall back to the
// static lists, so a stalled connection never leaves a page waiting for ever.
export const READ_TIMEOUT_MS = 12_000

/** An AbortSignal that fires after `ms` (AbortSignal.timeout where the browser has it). */
export function timeoutSignal(ms = READ_TIMEOUT_MS) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms)
  const controller = new AbortController()
  setTimeout(() => controller.abort(), ms)
  return controller.signal
}
