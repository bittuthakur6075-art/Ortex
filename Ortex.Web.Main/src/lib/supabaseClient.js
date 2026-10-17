// Supabase client for the main website. Uses the anon key (safe in the
// browser). Row-Level Security only lets it INSERT into `enquiries`: it cannot
// read anything back. Configure via .env (see .env.example).

import { createClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const hasSupabase = Boolean(url && anonKey)
export const supabase = hasSupabase ? createClient(url, anonKey, { auth: { persistSession: false } }) : null
