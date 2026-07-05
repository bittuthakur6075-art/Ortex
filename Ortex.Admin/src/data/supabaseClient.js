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
