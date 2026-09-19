// Current user's profile (role + module access), used to gate the nav and
// routes. Reloads whenever the auth state changes, or when refreshProfile() is
// called after the user edits their own record (name, photo). In no-backend
// (localStorage) mode there are no profiles, so the single local operator is
// treated as an admin with every module. The app stays fully usable without
// Supabase.

import { useState, useEffect, useMemo } from "react"
import { reloadRolePermissions, useRolePermissions } from "./useRolePermissions"
import { supabase, hasSupabase } from "../data/store/supabaseClient"
import { useAuth, currentUserId } from "../lib/auth"
import { ALL_MODULE_KEYS } from "../data/domain/modules"
import { isAdmin } from "../lib/roles"

const LOCAL_ADMIN = { role: "super_admin", modules: ALL_MODULE_KEYS, name: "Local", email: "" }

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

  // The role's grants (role_permissions, migration 0032), attached so
  // canAccess() can union them with this person's own extras. Read live, so a
  // Super Admin's change on Roles & permissions opens or closes pages for
  // everyone in that role without a reload. Until the table is readable,
  // roleModules stays unset and canAccess() uses DEFAULT_ROLE_MODULES.
  const { grants, ready } = useRolePermissions()
  // A read made before sign-in was refused by RLS; read again as this person.
  const profileId = profile?.id
  useEffect(() => {
    if (profileId) void reloadRolePermissions()
  }, [profileId])
  return useMemo(() => {
    if (!profile || isAdmin(profile) || !ready) return profile
    return { ...profile, roleModules: grants[profile.role] || [] }
  }, [profile, grants, ready])
}
