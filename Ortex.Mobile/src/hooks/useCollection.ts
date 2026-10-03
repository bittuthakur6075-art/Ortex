import React from "react"

import {
  getCollectionSnapshot,
  loadCollection,
  subscribeCollection,
  type CollectionSnapshot,
} from "@/data/collectionStore"
import { isCompanyTable, type Collection } from "@/data/repo"
import { inCompanies } from "@/domain/modules"
import { useCompany } from "@/store/CompanyContext"

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

// The four company tables (customers, enquiries, quotations, payments) are
// filtered to the company the person has chosen, or all of theirs in All mode
// (store/CompanyContext.tsx). The store underneath stays whole, so the cache and
// realtime never depend on the choice. `everyCompany` keeps every row RLS gives:
// a record page opened from a notification or a link must open whatever the
// switcher says.
export function useCollection<T>(name: Collection, { everyCompany = false }: { everyCompany?: boolean } = {}): CollectionState<T> {
  const { scope } = useCompany()
  const subscribe = React.useCallback((listener: () => void) => subscribeCollection(name, listener), [name])
  const getSnapshot = React.useCallback(() => getCollectionSnapshot<T>(name), [name])
  const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const reload = React.useCallback(() => loadCollection(name), [name])

  const filter = !everyCompany && isCompanyTable(name) ? scope : null
  return React.useMemo(
    () => ({ ...snapshot, items: filter ? inCompanies(snapshot.items, filter) : snapshot.items, reload }),
    [snapshot, reload, filter],
  )
}
