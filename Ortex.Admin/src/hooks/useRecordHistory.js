import { useCallback, useEffect, useRef, useState } from "react"
import { repo } from "../data/store/repository"

// The staff directory is the same handful of rows for every record on every
// page, and it changes about as often as somebody joins the company. One
// module-level promise means opening ten quotations in a row costs one request,
// not ten.
let _directory = null
function loadDirectory() {
  if (!_directory) {
    _directory = repo.staffDirectory().catch((e) => {
      // A failed lookup must not stop the history rendering — the entries are
      // still true, they just say "Unknown" instead of a name. Clearing the
      // cache lets the next mount try again.
      console.error("Failed to load staff directory:", e)
      _directory = null
      return {}
    })
  }
  return _directory
}

// Reads the append-only change history for one record (migration 0023) and
// resolves each actor uuid to a person.
//
// `createdBy` / `updatedBy` on the record itself answer "who owns this" in one
// line without a round trip; this hook is for the full story underneath. Both
// are NULL for anything written before 0023 was applied, and for anything
// written by the service role (the Tally connector, the telecaller cron), which
// is why `actorOf` returns a labelled sentinel rather than an empty string.
export function useRecordHistory(collection, id) {
  const [entries, setEntries] = useState([])
  const [directory, setDirectory] = useState({})
  const [loading, setLoading] = useState(Boolean(collection && id))
  const mounted = useRef(true)

  const load = useCallback(async () => {
    if (!collection || !id) {
      setEntries([])
      setLoading(false)
      return
    }
    try {
      const [rows, dir] = await Promise.all([repo.history(collection, id), loadDirectory()])
      if (!mounted.current) return
      setEntries(rows)
      setDirectory(dir)
    } catch (e) {
      console.error(`Failed to load history for ${collection}/${id}:`, e)
      if (mounted.current) setEntries([])
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [collection, id])

  useEffect(() => {
    mounted.current = true
    load()
    // A write to this record from another tab (or the phone) should show up in
    // its own history without a refresh, so ride the same store subscription
    // every list already uses.
    const unsub = repo.subscribe(load)
    return () => {
      mounted.current = false
      unsub()
    }
  }, [load])

  return { entries, directory, loading, reload: load }
}

// Turns an actor uuid into something printable. A null uuid is ambiguous and
// only the CALLER can resolve it, which is why `fallback` is required rather
// than defaulted: inside a history entry it means the service role wrote the
// row (an edge function, the cron sweep, the Tally connector — auth.uid() is
// null for all three), while on a record header it far more often means the
// record predates migration 0023 and was never attributed at all. Printing
// "Automation" in the second case would be an invented fact.
export function actorOf(uuid, directory, fallback) {
  if (!uuid) return { name: fallback, avatarUrl: "", role: "", known: false }
  const hit = directory?.[uuid]
  // A uuid with no directory row is a real person whose account has since been
  // deleted; `profiles.id` cascades from auth.users, so the name is gone.
  if (!hit) return { name: "Removed user", avatarUrl: "", role: "", known: false }
  return { name: hit.name || "Unnamed user", avatarUrl: hit.avatarUrl || "", role: hit.role || "", known: true }
}
