// Current user's profile (role + module access), used to gate the nav and
// routes. Reloads whenever the auth state changes, or when refreshProfile() is
// called after the user edits their own record (name, photo). In no-backend
// (localStorage) mode there are no profiles, so the single local operator is
// treated as an admin with every module — the app stays fully usable without
// Supabase.

import { useState, useEffect } from "react"
import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { useAuth, currentUserId } from "../lib/auth"
import { ALL_MODULE_KEYS } from "../data/domain/modules"

const LOCAL_ADMIN = { role: "admin", modules: ALL_MODULE_KEYS, name: "Local", email: "" }

// Every mounted useProfile() subscribes here, so one save re-reads the row for
// the whole app (header avatar, popover, /profile) instead of just the caller.
const listeners = new Set()

/** Re-read the signed-in user's profile everywhere it is rendered. */
export function refreshProfile() {
  for (const fn of listeners) fn()
}

export function useProfile() {
  const authed = useAuth()
  const [profile, setProfile] = useState(hasSupabase ? null : LOCAL_ADMIN)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    listeners.add(bump)
    return () => {
      listeners.delete(bump)
    }
  }, [])

  useEffect(() => {
    let alive = true
    async function load() {
      if (!hasSupabase) return setProfile(LOCAL_ADMIN)
      if (!authed) return setProfile(null)
      const id = currentUserId()
      if (!id) return setProfile(null)
      const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle()
      if (alive) setProfile(data || { role: "sales", modules: [] })
    }
    load()
    return () => {
      alive = false
    }
  }, [authed, tick])

  return profile
}
