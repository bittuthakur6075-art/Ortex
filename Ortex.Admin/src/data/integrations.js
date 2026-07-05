// Third-party integration triggers that run server-side (Edge Functions).

import { supabase, hasSupabase } from "./supabaseClient"

// Kick off an IndiaMART lead pull now. Returns the function result:
// { ok, total, inserted, duplicates } | { skipped, reason } | { error }.
export async function syncIndiaMart() {
  if (!hasSupabase) return { error: "Backend not configured" }
  const { data, error } = await supabase.functions.invoke("indiamart-pull", { body: {} })
  if (error) {
    let message = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) message = body.error
    } catch {
      /* keep generic message */
    }
    return { error: message }
  }
  return data
}
