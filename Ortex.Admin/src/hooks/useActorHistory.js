import { useCallback, useEffect, useRef, useState } from "react"
import { repo } from "../data/store/repository"
import { loadDirectory } from "./useRecordHistory"

// Every audited change ONE account made, newest first.
//
// The mirror of useRecordHistory: that one is keyed on a record, this one on a
// person. The staff directory is still loaded (and still cached across the
// app), because the timeline names the colleague whose page you are on and the
// same resolver is used for both.
export function useActorHistory(actorId, { limit = 200 } = {}) {
  const [entries, setEntries] = useState([])
  const [directory, setDirectory] = useState({})
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
      const [rows, dir] = await Promise.all([repo.actorHistory(actorId, { limit }), loadDirectory()])
      if (!mounted.current) return
      setEntries(rows)
      setDirectory(dir)
      setError("")
    } catch (e) {
      console.error(`Failed to load activity for ${actorId}:`, e)
      // An empty list and a failed read look identical on screen, and they are
      // opposite facts. Keep the reason so the page can print it.
      if (mounted.current) {
        setEntries([])
        setError(e?.message || "Could not read the activity log")
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [actorId, limit])

  useEffect(() => {
    mounted.current = true
    load()
    // Somebody working in another tab (or on the phone) should appear here
    // without a refresh, same store subscription every list rides.
    const unsub = repo.subscribe(load)
    return () => {
      mounted.current = false
      unsub()
    }
  }, [load])

  return { entries, directory, loading, error, reload: load }
}
