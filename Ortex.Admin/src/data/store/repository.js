// Repository facade.
//
// The whole app imports `repo` from here and never touches a storage
// implementation directly. `apiStore` (Supabase) is used whenever the env vars
// are configured; `localStore` (browser localStorage) is the offline fallback.
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
