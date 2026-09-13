/**
 * Account management — the phone half of `Ortex.Admin/src/services/users.js`.
 *
 * Reading an account is the `profiles` table, which RLS (`profiles_self_read`,
 * 0002) hands in full only to an admin. Enabling, disabling and resetting a
 * password need the service-role key, so they go through the console's own
 * `admin-manage-user` edge function, which re-checks that the caller is an
 * active admin and refuses to let anyone disable their own account. The phone
 * hides those actions from a non-admin as a courtesy; the function is the
 * control.
 */

import { supabase } from "@/data/supabase"
import type { Profile } from "@/domain/modules"

export type FunctionResult = {
  ok?: boolean
  error?: string
  notDeployed?: boolean
  reverted?: boolean
  emailed?: boolean
  emailError?: string | null
}

/** One account, or null when it no longer exists. */
export async function getProfile(id: string): Promise<Profile | null> {
  // select("*"), not a column list: see TeamScreen for why a named `phone`
  // column fails the whole read against a project without migration 0021.
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle()
  if (error) throw error
  return (data as Profile | null) ?? null
}

// supabase-js turns any non-2xx into a generic FunctionsHttpError whose message
// is "Edge Function returned a non-2xx status code"; the function's own sentence
// ("You can't disable your own account") is in the response body.
async function invokeFunction(name: string, body: Record<string, unknown>): Promise<FunctionResult> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context
    try {
      const parsed = (await context?.json?.()) as { error?: string } | undefined
      if (parsed?.error) return { error: parsed.error }
    } catch {
      /* not JSON — fall through */
    }
    if (context?.status === 404 || /failed to send a request|failed to fetch/i.test(error.message)) {
      return {
        error: `The "${name}" function is not deployed on this Supabase project. Run: supabase functions deploy ${name}`,
        notDeployed: true,
      }
    }
    if (/network request failed/i.test(error.message)) {
      return { error: "No connection. Check your mobile data and try again." }
    }
    return { error: error.message }
  }
  const payload = (data || {}) as FunctionResult
  if (payload.error) return { error: payload.error }
  return { ok: true, ...payload }
}

/**
 * Enable or disable a login (profiles.active + an auth ban).
 *
 * Verified, not assumed — the console's reasoning: the `profiles_protect`
 * trigger silently reverts `active` for a caller it does not recognise, and a
 * reverted write raises no error, so the row is read back.
 */
export async function setUserActive(id: string, active: boolean): Promise<FunctionResult> {
  const res = await invokeFunction("admin-manage-user", { action: "set-active", id, active })
  if (res.error) return res

  const { data, error } = await supabase.from("profiles").select("active").eq("id", id).maybeSingle()
  if (error || !data) return res
  if (Boolean((data as { active?: boolean }).active) !== active) {
    return {
      error:
        "The server reported success but the account is unchanged, so the write was rolled back in the database. " +
        "Check that migration 0008 (the service-role bypass) is applied on this project.",
      reverted: true,
    }
  }
  return res
}

/** Set a new password, sign the user out everywhere, and optionally email it. */
export function resetUserPassword(id: string, password: string, notify = true): Promise<FunctionResult> {
  return invokeFunction("admin-manage-user", { action: "reset-password", id, password, notify })
}

/** Ambiguity-free alphabet: no O/0, no l/1 — this gets read aloud down a phone. */
const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

/** The console's `randomPassword` shape (`Ox-` + 12). */
export function randomPassword(length = 12) {
  let out = "Ox-"
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return out
}
