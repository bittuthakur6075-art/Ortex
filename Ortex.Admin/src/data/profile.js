// Current user's profile (role + module access), used to gate the nav and
// routes. Reloads whenever the auth state changes. In no-backend (localStorage)
// mode there are no profiles, so the single local operator is treated as an
// admin with every module — the app stays fully usable without Supabase.

import { useState, useEffect } from "react"
import { supabase, hasSupabase } from "./supabaseClient"
import { useAuth, currentUserId } from "../lib/auth"
import { ALL_MODULE_KEYS } from "./modules"

const LOCAL_ADMIN = { role: "admin", modules: ALL_MODULE_KEYS, name: "Local", email: "" }

export function useProfile() {
  const authed = useAuth()
  const [profile, setProfile] = useState(hasSupabase ? null : LOCAL_ADMIN)

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
  }, [authed])

  return profile
}
