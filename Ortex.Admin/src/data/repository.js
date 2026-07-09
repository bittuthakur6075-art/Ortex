// Repository facade.
//
// The whole app imports `repo` from here and never touches a storage
// implementation directly. Today it points at `localStore`; to go live against
// a real backend, implement the same async surface in an `apiStore` and change
// the one assignment below — no component or module changes required.
//
// Contract (all async):
//   subscribe(cb) -> unsubscribe
//   list(collection, { limit }) / count(collection) / get(collection, id)
//   create(collection, data) / bulkCreate(collection, items)
//   update(collection, id, patch) / remove(collection, id)
//   getSettings() / saveSettings(next) / nextSequence(series)
//   clearAll() / exportAll()

import { localStore } from "./localStore"
import { apiStore } from "./apiStore"
import { hasSupabase } from "./supabaseClient"

// Use the Supabase backend when its env vars are configured (see .env.example);
// otherwise fall back to browser localStorage so the app still runs with no
// backend. Both implement the identical async contract above.
export const repo = hasSupabase ? apiStore : localStore

export const activeStoreKind = repo.kind
