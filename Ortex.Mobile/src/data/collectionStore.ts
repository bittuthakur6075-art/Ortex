import { AppState, type AppStateStatus } from "react-native"

import { repo, type Collection, type Fetched } from "@/data/repo"
import { errorMessage } from "@/data/supabase"

/**
 * One in-memory copy of each collection, shared by every screen that reads it.
 *
 * `useCollection` used to be self-contained: each call fetched the whole table,
 * kept its own copy, and refetched on every realtime event. An enquiry page
 * mounts three of them, global search five, and each bottom sheet adds another,
 * so a single edit at a desk set off five to eight paged fetches on the open
 * screen and the same rows sat in memory that many times over.
 *
 * Now a table is fetched ONCE while anyone is reading it, an in-flight fetch is
 * shared by everyone who asks during it, a realtime event for that table alone
 * triggers one refetch (coalesced, so a burst of writes is one round trip), and
 * the snapshot is the same object for every subscriber, which is what
 * `useSyncExternalStore` needs to skip renders.
 *
 * The state also says where the rows came from. `fromCache` is true when the
 * network failed and these are the AsyncStorage mirror; `error` is the last
 * failure in words. Screens show both rather than passing stale data off as
 * live — a rep in a basement showroom deserves to know the catalogue is
 * yesterday's.
 */
export type CollectionSnapshot<T> = {
  items: T[]
  /** True until the first fetch (or cache read) has settled. */
  loading: boolean
  /** True while a refetch runs after the first load — pull-to-refresh spinner. */
  refreshing: boolean
  error: string | null
  fromCache: boolean
  cachedAt: number | null
}

type Entry = {
  snapshot: CollectionSnapshot<unknown>
  listeners: Set<() => void>
  inflight: Promise<void> | null
  loadedOnce: boolean
  coalesce: ReturnType<typeof setTimeout> | null
  unsubscribeRealtime: (() => void) | null
}

const EMPTY: CollectionSnapshot<never> = {
  items: [],
  loading: true,
  refreshing: false,
  error: null,
  fromCache: false,
  cachedAt: null,
}

const entries = new Map<Collection, Entry>()

/** Realtime events inside this window collapse into one refetch. */
const COALESCE_MS = 250
/** Coming back to the foreground refetches anything older than this. */
const FOREGROUND_STALE_MS = 15_000

function entryFor(name: Collection): Entry {
  let entry = entries.get(name)
  if (!entry) {
    entry = {
      snapshot: EMPTY,
      listeners: new Set(),
      inflight: null,
      loadedOnce: false,
      coalesce: null,
      unsubscribeRealtime: null,
    }
    entries.set(name, entry)
  }
  return entry
}

function publish(entry: Entry, patch: Partial<CollectionSnapshot<unknown>>) {
  entry.snapshot = { ...entry.snapshot, ...patch }
  entry.listeners.forEach((cb) => cb())
}

/** Fetch `name`, sharing the round trip with any fetch already running. */
export function loadCollection(name: Collection): Promise<void> {
  const entry = entryFor(name)
  if (entry.inflight) return entry.inflight
  publish(entry, entry.loadedOnce ? { refreshing: true } : { loading: true })
  entry.inflight = repo
    .fetch<unknown>(name)
    .then((result: Fetched<unknown>) => {
      publish(entry, {
        items: result.items,
        error: null,
        fromCache: result.fromCache,
        cachedAt: result.cachedAt,
      })
    })
    .catch((e: unknown) => {
      // Keep whatever rows are already on screen; only the message changes.
      publish(entry, { error: errorMessage(e, "Could not load") })
    })
    .finally(() => {
      entry.inflight = null
      entry.loadedOnce = true
      publish(entry, { loading: false, refreshing: false })
    })
  return entry.inflight
}

function scheduleReload(name: Collection) {
  const entry = entryFor(name)
  if (entry.coalesce) clearTimeout(entry.coalesce)
  entry.coalesce = setTimeout(() => {
    entry.coalesce = null
    if (entry.listeners.size > 0) void loadCollection(name)
  }, COALESCE_MS)
}

/**
 * Subscribe to `name`. The first subscriber starts the fetch and the realtime
 * listener; the last one leaving tears the listener down but KEEPS the rows, so
 * returning to a tab is instant and the next subscriber only refreshes.
 */
export function subscribeCollection(name: Collection, listener: () => void): () => void {
  const entry = entryFor(name)
  entry.listeners.add(listener)
  if (entry.listeners.size === 1) {
    entry.unsubscribeRealtime = repo.subscribe(() => scheduleReload(name), name)
    void loadCollection(name)
  }
  return () => {
    entry.listeners.delete(listener)
    if (entry.listeners.size === 0) {
      entry.unsubscribeRealtime?.()
      entry.unsubscribeRealtime = null
    }
  }
}

export function getCollectionSnapshot<T>(name: Collection): CollectionSnapshot<T> {
  return entryFor(name).snapshot as CollectionSnapshot<T>
}

/** Forget every collection — sign-out, so the next user never sees the last one's rows. */
export function resetCollections() {
  entries.forEach((entry) => {
    if (entry.coalesce) clearTimeout(entry.coalesce)
    entry.unsubscribeRealtime?.()
  })
  entries.clear()
}

// Waking from the background: the realtime socket may have died while the phone
// slept, and anything read more than a few seconds ago is worth confirming.
let lastState: AppStateStatus = AppState.currentState
AppState.addEventListener("change", (next) => {
  const wasBackground = lastState !== "active"
  lastState = next
  if (next !== "active" || !wasBackground) return
  repo.reconnect()
  const now = Date.now()
  entries.forEach((entry, name) => {
    if (entry.listeners.size === 0) return
    if (entry.snapshot.cachedAt && now - entry.snapshot.cachedAt < FOREGROUND_STALE_MS) return
    void loadCollection(name)
  })
})
