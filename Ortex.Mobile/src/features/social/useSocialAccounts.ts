import React from "react"

import type { AccountStatus } from "@/domain/social"
import { invokeEdge } from "@/lib/edgeFunction"

// Which accounts posts can go to, from the console's `social-accounts` function
// (never a token). One copy for the whole app, kept a minute, so the list and
// the editor ask once. Mirrors Admin src/hooks/useSocialAccounts.js.

const TTL_MS = 60_000
let cached: AccountStatus = null
let cachedAt = 0
let inflight: Promise<AccountStatus> | null = null

async function fetchStatus(force: boolean): Promise<AccountStatus> {
  if (!force && cached && Date.now() - cachedAt < TTL_MS) return cached
  if (!inflight) {
    inflight = invokeEdge<NonNullable<AccountStatus>>("social-accounts", { action: "status" })
      .then(({ data, error }) => {
        if (error) throw new Error(error)
        cached = data ?? null
        cachedAt = Date.now()
        return cached
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useSocialAccounts() {
  const [status, setStatus] = React.useState<AccountStatus>(cached)
  const [error, setError] = React.useState("")

  const load = React.useCallback(async (force = false) => {
    try {
      setStatus(await fetchStatus(force))
      setError("")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const reload = React.useCallback(() => load(true), [load])
  return { status, error, reload }
}
