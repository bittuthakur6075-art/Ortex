import React from "react"

import {
  getCollectionSnapshot,
  loadCollection,
  subscribeCollection,
  type CollectionSnapshot,
} from "@/data/collectionStore"
import type { Collection } from "@/data/repo"

// PORT OF Ortex.Admin/src/hooks/useCollection.js.
//
// Same contract, same strategy: re-fetch the whole collection on any database
// change rather than patching deltas. The volumes here are small (hundreds of
// rows, not millions) and a full refetch can never drift from the server, which
// on a phone that has been asleep for a day is worth more than the saved bytes.
//
// The hook itself is now a thin view over data/collectionStore.ts: every screen
// reading the same table shares one fetch and one copy of the rows, and a
// realtime event refetches that table once, not once per mounted hook.

export type CollectionState<T> = CollectionSnapshot<T> & {
  reload: () => Promise<void>
}

export function useCollection<T>(name: Collection): CollectionState<T> {
  const subscribe = React.useCallback((listener: () => void) => subscribeCollection(name, listener), [name])
  const getSnapshot = React.useCallback(() => getCollectionSnapshot<T>(name), [name])
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const reload = React.useCallback(() => loadCollection(name), [name])

  return React.useMemo(() => ({ ...snapshot, reload }), [snapshot, reload])
}
