import React from "react"

import { repo, type Collection } from "@/data/repo"
import { errorMessage } from "@/data/supabase"

// PORT OF Ortex.Admin/src/hooks/useCollection.js.
//
// Same contract, same strategy: re-fetch the whole collection on any database
// change rather than patching deltas. The volumes here are small (hundreds of
// rows, not millions) and a full refetch can never drift from the server, which
// on a phone that has been asleep for a day is worth more than the saved bytes.

export type CollectionState<T> = {
  items: T[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useCollection<T>(name: Collection): CollectionState<T> {
  const [items, setItems] = React.useState<T[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const rows = await repo.list<T>(name)
      setItems(rows)
      setError(null)
    } catch (e) {
      setError(errorMessage(e, "Could not load"))
    } finally {
      setLoading(false)
    }
  }, [name])

  React.useEffect(() => {
    void load()
    const unsub = repo.subscribe(() => {
      void load()
    })
    return unsub
  }, [load])

  return { items, loading, error, reload: load }
}
