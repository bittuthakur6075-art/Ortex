// Team/user management data access. Reads/writes go through the profiles table
// (guarded by RLS — admin only); creating a brand-new login goes through the
// admin-create-user Edge Function, which holds the service-role key.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

// Accounts are auth users, and auth has no offline equivalent — the rest of the
// app falls back to localStorage, but there is nothing to fall back to here.
// Without this guard every call below dereferences a null client and the page
// reports "Cannot read properties of null (reading 'from')", which tells the
// reader nothing about the actual situation.
const OFFLINE = "User management needs a database connection. This build runs on demo data, so there are no accounts to manage."
const requireDb = () => {
  if (!hasSupabase) throw new Error(OFFLINE)
}

export async function listProfiles() {
  requireDb()
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true })
  if (error) throw error
  return data
}

// Update a user's role / modules / active flag (never their id or email here).
export async function updateProfile(id, patch) {
  requireDb()
  const { error } = await supabase.from("profiles").update(patch).eq("id", id)
  if (error) throw error
  return true
}

// Self-service update of the signed-in user's own profile. RLS + a trigger keep
// non-admins from changing their own role/modules/active, so only `name` really
// takes effect here for a Sales Executive. Returns { ok } | { error }.
export async function updateMyProfile(id, patch) {
  if (!hasSupabase) return { error: OFFLINE }
  const { error } = await supabase.from("profiles").update(patch).eq("id", id)
  return error ? { error: error.message } : { ok: true }
}

// Create a new user via the Edge Function. Returns { ok, id } | { error }.
export async function createUser(payload) {
  // Returns rather than throws: the caller renders this in a toast alongside
  // the function's own { error } responses, so keep the shape identical.
  if (!hasSupabase) return { error: OFFLINE }
  const { data, error } = await supabase.functions.invoke("admin-create-user", { body: payload })
  if (error) {
    // Non-2xx from the function — surface its JSON { error } body if present.
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch {
      /* fall back to the generic message */
    }
    return { error: message }
  }
  if (data?.error) return { error: data.error }
  // emailed / emailError report whether the welcome mail actually went out. The
  // account exists either way, so this is information for the admin, not a
  // failure — the caller decides how loudly to say so.
  return { ok: true, id: data?.id, emailed: Boolean(data?.emailed), emailError: data?.emailError ?? null }
}
