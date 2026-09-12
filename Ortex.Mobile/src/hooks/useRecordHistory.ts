import { useCallback, useEffect, useRef, useState } from "react"

import { repo, type Collection, type HistoryEntry, type StaffDirectory } from "@/data/repo"

// MIRRORS Ortex.Admin/src/hooks/useRecordHistory.js. Both clients read the same
// audit_log and the same staff_directory view, so a quotation edited on a phone
// and opened in the console tells one story, not two.

// The directory is the same handful of rows for every record on every screen
// and changes about as often as somebody joins the company, so one module-level
// promise serves the whole session.
let directoryPromise: Promise<StaffDirectory> | null = null
function loadDirectory(): Promise<StaffDirectory> {
  if (!directoryPromise) {
    directoryPromise = repo.staffDirectory().catch((e) => {
      // A failed lookup must not stop the history rendering — the entries are
      // still true, they just say "Unknown" instead of a name. Dropping the
      // cache lets the next screen try again.
      console.error("Failed to load staff directory:", e)
      directoryPromise = null
      return {}
    })
  }
  return directoryPromise
}

export type Actor = { name: string; avatarUrl: string; role: string; known: boolean }

/**
 * Who made this record, who touched it last, and everything in between.
 *
 * `createdBy` / `updatedBy` on the record answer the headline without a round
 * trip; this hook fetches the full history underneath it.
 */
export function useRecordHistory(collection: Collection | null, id?: string | null) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [directory, setDirectory] = useState<StaffDirectory>({})
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
    void load()
    // An edit made at a desk should appear in the phone's copy of the history
    // without a pull-to-refresh, so ride the shared realtime channel.
    const unsub = repo.subscribe(() => void load(), "audit_log")
    return () => {
      mounted.current = false
      unsub()
    }
  }, [load])

  return { entries, directory, loading, reload: load }
}

/**
 * An actor uuid as something printable.
 *
 * `fallback` is required rather than defaulted because a null actor means two
 * different things and only the caller knows which: inside a history entry it
 * is the service role (an edge function, the telecaller sweep, the Tally
 * connector — none of which have an auth.uid()), while on a record header it
 * usually means the record predates the audit trail and was never attributed.
 */
export function actorOf(uuid: string | null | undefined, directory: StaffDirectory, fallback: string): Actor {
  if (!uuid) return { name: fallback, avatarUrl: "", role: "", known: false }
  const hit = directory?.[uuid]
  // A uuid with no directory row is a real person whose account has since been
  // deleted: profiles.id cascades from auth.users, so the name is gone.
  if (!hit) return { name: "Removed user", avatarUrl: "", role: "", known: false }
  return { name: hit.name || "Unnamed user", avatarUrl: hit.avatarUrl || "", role: hit.role || "", known: true }
}
