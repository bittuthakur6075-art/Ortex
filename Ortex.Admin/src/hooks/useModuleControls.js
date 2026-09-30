// The Super Admin's per-module switches (module_controls, migration 0053): a
// module switched off for the whole company, or taken off the Admin role. Read
// live like the role grants, so a change on the Modules page opens or closes
// pages in every open console without a reload. One shared copy.
//
// `controls` maps a module key to { enabled, adminAccess }; a key with no row is
// absent and means "on, Admins included". `ready` is false until the table has
// been read (before 0053 is pushed, and in offline demo mode), so the Modules
// page can refuse to save over nothing.

import { useEffect, useState } from "react"
import { supabase, hasSupabase } from "../data/store/supabaseClient"

let snapshot = { controls: {}, ready: false, loaded: false }
const listeners = new Set()
let channel = null

function publish(next) {
  snapshot = next
  for (const fn of listeners) fn(snapshot)
}

export async function reloadModuleControls() {
  if (!hasSupabase) {
    publish({ controls: {}, ready: false, loaded: true })
    return
  }
  const { data, error } = await supabase.from("module_controls").select("key, enabled, admin_access")
  if (error || !data) {
    publish({ controls: {}, ready: false, loaded: true })
    return
  }
  const controls = {}
  for (const row of data) controls[row.key] = { enabled: row.enabled !== false, adminAccess: row.admin_access !== false }
  publish({ controls, ready: true, loaded: true })
}

function ensureChannel() {
  if (channel || !hasSupabase) return
  channel = supabase
    .channel("ortex-module-controls")
    .on("postgres_changes", { event: "*", schema: "public", table: "module_controls" }, () => {
      void reloadModuleControls()
    })
    .subscribe()
}

export function useModuleControls() {
  const [state, setState] = useState(snapshot)
  useEffect(() => {
    listeners.add(setState)
    ensureChannel()
    if (!snapshot.loaded) void reloadModuleControls()
    return () => {
      listeners.delete(setState)
    }
  }, [])
  return state
}

/**
 * Save the switches for some modules: `changes` is { key: { enabled, adminAccess } }.
 * The database refuses anyone but the Super Admin.
 */
export async function saveModuleControls(changes) {
  const rows = Object.entries(changes).map(([key, c]) => ({
    key,
    enabled: c.enabled !== false,
    admin_access: c.adminAccess !== false,
  }))
  if (!rows.length) return
  const { data, error } = await supabase.from("module_controls").upsert(rows, { onConflict: "key" }).select("key")
  if (error) throw error
  // A write RLS refuses returns no rows rather than an error.
  if ((data?.length || 0) < rows.length) throw new Error("Only the Super Admin can change module switches")
  await reloadModuleControls()
}
