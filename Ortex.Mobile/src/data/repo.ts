// Repository over the Supabase tables.
//
// PORT OF Ortex.Admin/src/data/store/apiStore.js, narrowed to what this app
// reads and writes. Every collection is a table of
// { id, doc jsonb, created_at, updated_at } rows; this module maps rows <-> the
// flat records the screens use: { ...doc, id, createdAt, updatedAt }.
// Cross-references between records live inside `doc` and point at other rows'
// ids, exactly as they do in the console.

import { mergeSettings, type Settings } from "@/domain/settings"
import { readCache, writeCache } from "@/data/cache"
import { supabase } from "@/data/supabase"

const SETTINGS_ROW_ID = true // single-row settings table (id boolean primary key)

export type Collection = "products" | "categories" | "customers" | "enquiries" | "quotations"

type Row = { id: string; doc: Record<string, unknown>; created_at?: string; updated_at?: string }

// row {id, doc, created_at, updated_at} -> flat app record
function fromRow<T>(row: Row | null): T | null {
  if (!row) return null
  const { id, doc, created_at, updated_at } = row
  return { ...doc, id, createdAt: created_at, updatedAt: updated_at } as T
}

// flat app record -> the JSONB `doc` payload (strip server-managed columns)
function toDoc(data: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const { id, createdAt, updatedAt, created_at, updated_at, ...doc } = (data || {}) as Record<string, unknown>
  void id
  void createdAt
  void updatedAt
  void created_at
  void updated_at
  return doc
}

// Realtime: a SINGLE shared channel over all public tables fans out to every
// subscriber. Screens each call subscribe(); creating one channel per caller
// re-adds postgres_changes callbacks to the same topic and the SDK throws
// ("cannot add callbacks after subscribe()"), so we share one channel and keep
// a listener set — created on the first subscriber, torn down after the last.
let channel: ReturnType<typeof supabase.channel> | null = null
const subscribers = new Set<() => void>()

function ensureChannel() {
  if (channel) return
  channel = supabase
    .channel("ortex-mobile-db")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      subscribers.forEach((cb) => cb())
    })
    .subscribe()
}

export const repo = {
  subscribe(callback: () => void) {
    subscribers.add(callback)
    ensureChannel()
    return () => {
      subscribers.delete(callback)
      if (subscribers.size === 0 && channel) {
        supabase.removeChannel(channel)
        channel = null
      }
    }
  },

  // PostgREST caps a single response at the project's max-rows (1000 by
  // default) and gives no signal that it truncated — a plain .select("*") on a
  // growing table silently returns "the newest 1000 rows", so anything counted
  // from the result is wrong without saying so. Page explicitly instead.
  //
  // The result is mirrored to AsyncStorage and served back when the fetch
  // throws, so a salesperson with no signal still has their catalogue and
  // contacts. `fromCache` on the result tells the screen to say so.
  async list<T>(name: Collection, { limit = Infinity }: { limit?: number } = {}): Promise<T[]> {
    const PAGE = 1000
    const rows: T[] = []
    try {
      for (let from = 0; rows.length < limit; from += PAGE) {
        const size = Math.min(PAGE, limit - rows.length)
        const { data, error } = await supabase
          .from(name)
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + size - 1)
        if (error) throw error
        rows.push(...(data as Row[]).map((r) => fromRow<T>(r) as T))
        if (data.length < size) break // short page => no more rows
      }
    } catch (error) {
      const cached = await readCache<T[]>(name)
      if (cached) return cached
      throw error
    }
    void writeCache(name, rows)
    return rows
  },

  async get<T>(name: Collection, id: string): Promise<T | null> {
    const { data, error } = await supabase.from(name).select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return fromRow<T>(data as Row | null)
  },

  async create<T>(name: Collection, data: Record<string, unknown>): Promise<T> {
    const { data: created, error } = await supabase
      .from(name)
      .insert({ doc: toDoc(data) })
      .select("*")
      .single()
    if (error) throw error
    return fromRow<T>(created as Row) as T
  },

  // Top-level shallow merge, matching the console's {...existing, ...patch}.
  async update<T>(name: Collection, id: string, patch: Record<string, unknown>): Promise<T | null> {
    const existing = await this.get<Record<string, unknown>>(name, id)
    if (!existing) return null
    const { data, error } = await supabase
      .from(name)
      .update({ doc: { ...toDoc(existing), ...toDoc(patch) } })
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return fromRow<T>(data as Row)
  },

  async remove(name: Collection, id: string): Promise<boolean> {
    const { error } = await supabase.from(name).delete().eq("id", id)
    if (error) throw error
    return true
  },

  async getSettings(): Promise<Settings> {
    try {
      const { data, error } = await supabase
        .from("settings")
        .select("doc")
        .eq("id", SETTINGS_ROW_ID)
        .maybeSingle()
      if (error) throw error
      const settings = mergeSettings((data as { doc?: unknown } | null)?.doc || null)
      void writeCache("settings", settings)
      return settings
    } catch (error) {
      const cached = await readCache<Settings>("settings")
      if (cached) return mergeSettings(cached)
      throw error
    }
  },

  // Atomic server-side counter — delegates to the next_sequence() SQL function,
  // the same one the console uses, so a quotation raised on the phone can never
  // collide with one raised at a desk.
  async nextSequence(series: string): Promise<number> {
    const { data, error } = await supabase.rpc("next_sequence", { p_series: series })
    if (error) throw error
    return data as number
  },
}
