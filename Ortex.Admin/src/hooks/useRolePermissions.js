// What each configurable role may open (role_permissions, migration 0032), read
// live so the Super Admin's edits on Roles & permissions reach every open
// console without a reload. One shared copy for every component that asks.
//
// Falls back to DEFAULT_ROLE_MODULES when the table cannot be read: before 0032
// is pushed, and in offline demo mode. `ready` says whether the numbers are the
// database's or the fallback's, so the matrix can refuse to save over nothing.

import { useEffect, useState } from "react"
import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { DEFAULT_ROLE_MODULES } from "../data/domain/modules"

let snapshot = { grants: { ...DEFAULT_ROLE_MODULES }, ready: false, loaded: false }
const listeners = new Set()
let channel = null

function publish(next) {
  snapshot = next
  for (const fn of listeners) fn(snapshot)
}

export async function reloadRolePermissions() {
  if (!hasSupabase) {
    publish({ grants: { ...DEFAULT_ROLE_MODULES }, ready: false, loaded: true })
    return
  }
  const { data, error } = await supabase.from("role_permissions").select("role, modules")
  if (error || !data) {
    publish({ grants: { ...DEFAULT_ROLE_MODULES }, ready: false, loaded: true })
    return
  }
  const grants = { ...DEFAULT_ROLE_MODULES }
  for (const row of data) grants[row.role] = Array.isArray(row.modules) ? row.modules : []
  publish({ grants, ready: true, loaded: true })
}

function ensureChannel() {
  if (channel || !hasSupabase) return
  channel = supabase
    .channel("ortex-role-permissions")
    .on("postgres_changes", { event: "*", schema: "public", table: "role_permissions" }, () => {
      void reloadRolePermissions()
    })
    .subscribe()
}

export function useRolePermissions() {
  const [state, setState] = useState(snapshot)
  useEffect(() => {
    listeners.add(setState)
    ensureChannel()
    if (!snapshot.loaded) void reloadRolePermissions()
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}

/** Save one role's grants. The database refuses anyone but the Super Admin. */
export async function saveRolePermissions(role, modules) {
  const { data, error } = await supabase
    .from("role_permissions")
    .update({ modules: [...new Set(modules)] })
    .eq("role", role)
    .select("role")
  if (error) throw error
  // An update RLS refuses returns no rows rather than an error.
  if (!data?.length) throw new Error("Only the Super Admin can change role permissions")
  await reloadRolePermissions()
}
