import { useCallback, useEffect, useRef, useState } from "react"

import { repo, type HistoryEntry } from "@/data/repo"

// MIRRORS Ortex.Admin/src/hooks/useActorHistory.js.
//
// Every audited change ONE account made, newest first — useRecordHistory keyed
// on a person instead of a record. Unlike that hook it keeps the error: an empty
// list and a failed read look identical on screen, and they are opposite facts.
export function useActorHistory(actorId?: string | null, limit = 200) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(Boolean(actorId))
  const [error, setError] = useState("")
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!actorId) {
      setEntries([])
      setLoading(false)
      return
    }
    try {
      const rows = await repo.actorHistory(actorId, limit)
      if (!mounted.current) return
      setEntries(rows)
      setError("")
    } catch (e) {
      console.error(`Failed to load activity for ${actorId}:`, e)
      if (mounted.current) {
        setEntries([])
        setError((e as Error)?.message || "Could not read the activity log")
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [actorId, limit])

  useEffect(() => {
    mounted.current = true
    void load()
    const unsub = repo.subscribe(() => void load(), "audit_log")
    return () => {
      mounted.current = false
      unsub()
    }
  }, [load])

  return { entries, loading, error, reload: load }
}
