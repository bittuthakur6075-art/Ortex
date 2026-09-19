import { useCallback, useEffect, useState } from "react"
import { supabase, hasSupabase, functionErrorMessage } from "../data/store/supabaseClient"

// Which social accounts can be published to, from the `social-accounts` Edge
// Function (it never returns a token): { meta: { instagram, facebook },
// linkedin: { configured, connected, expired, name, reconnectBy } }.
//
// One shared copy, kept 60 s, so the Social page and the post editor ask once.

const TTL_MS = 60_000
let cached = null
let cachedAt = 0
let inflight = null

async function fetchStatus(force = false) {
  if (!hasSupabase) return null
  if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached
  if (!inflight) {
    inflight = supabase.functions
      .invoke("social-accounts", { body: { action: "status" } })
      .then(async ({ data, error }) => {
        if (error) throw new Error(await functionErrorMessage(error, "Could not check the connected accounts"))
        if (data?.error) throw new Error(data.error)
        cached = data
        cachedAt = Date.now()
        return data
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useSocialAccounts() {
  const [status, setStatus] = useState(cached)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState(null)

  const load = useCallback(async (force = false) => {
    setLoading(true)
    try {
      setStatus(await fetchStatus(force))
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(() => load(true), [load])
  return { status, loading, error, reload }
}

/** Is this platform ready to post to? Unknown (still loading) counts as ready. */
export function platformReady(status, platform) {
  if (!status) return true
  if (platform === "linkedin") return Boolean(status.linkedin?.connected)
  return Boolean(status.meta?.[platform])
}
