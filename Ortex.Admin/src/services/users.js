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

// Every Edge Function call funnels through here so a failure reads the same way
// at both call sites. The case worth naming is a function that was never
// deployed: supabase-js reports that as a transport failure ("Failed to send a
// request to the Edge Function") or a bare 404, neither of which tells an admin
// what to do. The console then looks broken when the deploy is simply missing.
async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const status = error.context?.status
    // The function answered: surface its own { error } text, which is written
    // for the admin ("You can't disable your own account", etc.).
    let message = error.message
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.error) return { error: parsed.error }
    } catch {
      /* not JSON - fall through to the transport cases below */
    }
    if (status === 404 || /failed to send a request|failed to fetch/i.test(message)) {
      return {
        error: `The "${name}" function is not deployed on this Supabase project. Run: supabase functions deploy ${name}`,
        notDeployed: true,
      }
    }
    return { error: message }
  }
  if (data?.error) return { error: data.error }
  return { ok: true, ...data }
}

// Create a new user via the Edge Function. Returns { ok, id } | { error }.
export async function createUser(payload) {
  // Returns rather than throws: the caller renders this in a toast alongside
  // the function's own { error } responses, so keep the shape identical.
  if (!hasSupabase) return { error: OFFLINE }
  const res = await invokeFunction("admin-create-user", payload)
  if (res.error) return res
  // emailed / emailError report whether the welcome mail actually went out. The
  // account exists either way, so this is information for the admin, not a
  // failure — the caller decides how loudly to say so.
  return { ok: true, id: res.id, emailed: Boolean(res.emailed), emailError: res.emailError ?? null }
}

// Privileged actions on an existing account. All three need the service-role
// key, so they go through the admin-manage-user Edge Function rather than the
// profiles table — a browser can flip profiles.active, but only the server can
// ban the login, change a password or delete the auth user.
async function manageUser(payload) {
  if (!hasSupabase) return { error: OFFLINE }
  return invokeFunction("admin-manage-user", payload)
}

/** Enable or disable a login (profiles.active + an auth ban).
 *
 * Verified, not assumed. profiles carries the BEFORE UPDATE trigger
 * profiles_protect, which silently rewrites `new.active := old.active` for any
 * caller it does not recognise as an admin or as the service role. A reverted
 * write raises no error, so without reading the row back the console would
 * report success over a row that never changed - which is exactly the failure
 * that is impossible to diagnose from the UI.
 */
export async function setUserActive(id, active) {
  const res = await manageUser({ action: "set-active", id, active })
  if (res.error) return res

  const { data, error } = await supabase.from("profiles").select("active").eq("id", id).maybeSingle()
  if (error || !data) return res // cannot verify; trust the function
  if (Boolean(data.active) !== Boolean(active)) {
    return {
      error:
        "The server reported success but the account is unchanged, so the write was rolled back in the database. " +
        "This is the profiles_protect trigger refusing the update - check that migration 0008 (the service-role bypass) is applied on this project.",
      reverted: true,
    }
  }
  return res
}

/** Set a new password, sign the user out everywhere, and optionally email it. */
export function resetUserPassword(id, password, notify = true) {
  return manageUser({ action: "reset-password", id, password, notify })
}

/** Delete the auth user and their profile — removes every trace of access. */
export function deleteUser(id) {
  return manageUser({ action: "delete", id })
}
