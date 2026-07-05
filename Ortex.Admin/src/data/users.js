// Team/user management data access. Reads/writes go through the profiles table
// (guarded by RLS — admin only); creating a brand-new login goes through the
// admin-create-user Edge Function, which holds the service-role key.

import { supabase } from "./supabaseClient"

export async function listProfiles() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true })
  if (error) throw error
  return data
}

// Update a user's role / modules / active flag (never their id or email here).
export async function updateProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id)
  if (error) throw error
  return true
}

// Self-service update of the signed-in user's own profile. RLS + a trigger keep
// non-admins from changing their own role/modules/active, so only `name` really
// takes effect here for a Sales Executive. Returns { ok } | { error }.
export async function updateMyProfile(id, patch) {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id)
  return error ? { error: error.message } : { ok: true }
}

// Create a new user via the Edge Function. Returns { ok, id } | { error }.
export async function createUser(payload) {
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
  return { ok: true, id: data?.id }
}
