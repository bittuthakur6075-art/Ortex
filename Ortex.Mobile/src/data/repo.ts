// Repository over the Supabase tables.
//
// PORT OF Ortex.Admin/src/data/store/apiStore.js, narrowed to what this app
// reads and writes. Every collection is a table of
// { id, doc jsonb, created_at, updated_at } rows; this module maps rows <-> the
// flat records the screens use: { ...doc, id, createdAt, updatedAt }.
// Cross-references between records live inside `doc` and point at other rows'
// ids, exactly as they do in the console.

import { mergeSettings, type Settings } from "@/domain/settings"
import { cachedAt, readCache, writeCache } from "@/data/cache"
import { supabase } from "@/data/supabase"

const SETTINGS_ROW_ID = true // single-row settings table (id boolean primary key)

export type Collection = "products" | "categories" | "customers" | "enquiries" | "quotations" | "work"

type Row = {
  id: string
  doc: Record<string, unknown>
  created_at?: string
  updated_at?: string
  created_by?: string | null
  updated_by?: string | null
}

// One entry in a record's change history (migration 0023).
export type HistoryEntry = {
  id: number
  collection: string
  recordId: string
  action: "insert" | "update" | "delete"
  actor: string | null
  at: string
  changes: Record<string, { from?: unknown; to?: unknown }>
  label: string
}

export type StaffMember = { name: string; avatarUrl: string; role: string }
export type StaffDirectory = Record<string, StaffMember>

// row {id, doc, created_at, updated_at, created_by, updated_by} -> flat record.
// The two actor uuids are server-owned: a trigger stamps them from auth.uid()
// on every write, so the phone reports the same author the console does without
// either client sending anything.
function fromRow<T>(row: Row | null): T | null {
  if (!row) return null
  const { id, doc, created_at, updated_at, created_by, updated_by } = row
  return {
    ...doc,
    id,
    createdAt: created_at,
    updatedAt: updated_at,
    createdBy: created_by ?? null,
    updatedBy: updated_by ?? null,
  } as T
}

// flat app record -> the JSONB `doc` payload (strip server-managed columns).
// The actor columns are stripped for the same reason as the timestamps: only
// the trigger's value is trustworthy, and a client echo would bury a stale copy
// inside the doc where it would outlive the truth.
function toDoc(data: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const {
    id,
    createdAt,
    updatedAt,
    created_at,
    updated_at,
    createdBy,
    updatedBy,
    created_by,
    updated_by,
    ...doc
  } = (data || {}) as Record<string, unknown>
  void id
  void createdAt
  void updatedAt
  void created_at
  void updated_at
  void createdBy
  void updatedBy
  void created_by
  void updated_by
  return doc
}

// A table or view that does not exist yet (42P01), or a schema cache that has
// not caught up (PGRST205). Both mean 0023 has not reached THIS project, which
// is a real state while environments are a push apart — the history reads
// degrade to empty rather than breaking the screen they decorate.
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist/i.test(error.message || "")
}

// Realtime: ONE shared channel, with a listener set PER TABLE.
//
// Creating a channel per caller re-adds postgres_changes callbacks to the same
// topic and the SDK throws ("cannot add callbacks after subscribe()"), so the
// channel is shared: created on the first subscriber, torn down after the last.
//
// It used to carry a single schema-wide handler that woke every subscriber on
// every write to any table, so a colleague saving a product at a desk made the
// open enquiry page refetch enquiries, products AND quotations, each of them
// paged. Now a change to `products` reaches only the `products` listeners (and
// the few callers that asked for everything), and the collection store on top
// of this (data/collectionStore.ts) fetches each table once however many
// screens are reading it.
export type Table = Collection | "audit_log"
const REALTIME_TABLES: Table[] = ["products", "categories", "customers", "enquiries", "quotations", "work", "audit_log"]

let channel: ReturnType<typeof supabase.channel> | null = null
const listeners = new Map<Table | "*", Set<() => void>>()

function emit(table: Table) {
  listeners.get(table)?.forEach((cb) => cb())
  listeners.get("*")?.forEach((cb) => cb())
}

function ensureChannel() {
  // A channel that errored or timed out (the phone slept, the socket died) never
  // rejoins on its own; drop it and let the next call build a fresh one.
  if (channel && (channel.state === "errored" || channel.state === "closed")) {
    supabase.removeChannel(channel)
    channel = null
  }
  if (channel) return
  let next = supabase.channel("ortex-mobile-db")
  for (const table of REALTIME_TABLES) {
    next = next.on("postgres_changes", { event: "*", schema: "public", table }, () => emit(table))
  }
  channel = next.subscribe()
}

function listenerCount() {
  let n = 0
  listeners.forEach((set) => (n += set.size))
  return n
}

/** What `fetch` hands back: the rows plus where they came from. */
export type Fetched<T> = {
  items: T[]
  /** True when the network failed and these rows are the AsyncStorage mirror. */
  fromCache: boolean
  /** When the rows were last confirmed against the server, cached or not. */
  cachedAt: number | null
}

export const repo = {
  /**
   * Run `callback` whenever `table` changes on the server. Omit the table to hear
   * every change (a record page that shows several collections at once). The
   * return value unsubscribes.
   */
  subscribe(callback: () => void, table?: Table) {
    const key: Table | "*" = table ?? "*"
    let set = listeners.get(key)
    if (!set) {
      set = new Set()
      listeners.set(key, set)
    }
    set.add(callback)
    ensureChannel()
    return () => {
      set?.delete(callback)
      if (listenerCount() === 0 && channel) {
        supabase.removeChannel(channel)
        channel = null
      }
    }
  },

  /**
   * Re-join the realtime channel if it has died. Called when the app returns to
   * the foreground: a socket that dropped while the phone slept stays dropped,
   * and every screen would quietly stop hearing about changes.
   */
  reconnect() {
    if (listenerCount() > 0) ensureChannel()
  },

  // PostgREST caps a single response at the project's max-rows (1000 by
  // default) and gives no signal that it truncated — a plain .select("*") on a
  // growing table silently returns "the newest 1000 rows", so anything counted
  // from the result is wrong without saying so. Page explicitly instead.
  //
  // The result is mirrored to AsyncStorage and served back when the fetch
  // throws, so a salesperson with no signal still has their catalogue and
  // contacts. `fromCache` on the result tells the screen to say so.
  async fetch<T>(name: Collection, { limit = Infinity }: { limit?: number } = {}): Promise<Fetched<T>> {
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
      if (cached) return { items: cached, fromCache: true, cachedAt: await cachedAt(name) }
      throw error
    }
    const at = Date.now()
    void writeCache(name, rows)
    return { items: rows, fromCache: false, cachedAt: at }
  },

  /** `fetch` without the provenance, for callers that only want the rows. */
  async list<T>(name: Collection, options: { limit?: number } = {}): Promise<T[]> {
    return (await this.fetch<T>(name, options)).items
  },

  // One record. With no signal it falls back to the collection's cached mirror,
  // so a quotation opened from a list that itself came from the cache still
  // opens rather than reporting that it "no longer exists".
  async get<T>(name: Collection, id: string): Promise<T | null> {
    try {
      const { data, error } = await supabase.from(name).select("*").eq("id", id).maybeSingle()
      if (error) throw error
      return fromRow<T>(data as Row | null)
    } catch (error) {
      const cached = await readCache<Array<T & { id: string }>>(name)
      const hit = cached?.find((r) => r.id === id)
      if (hit) return hit
      throw error
    }
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

  // Append-only change history for one record, newest first. Mirrors
  // apiStore.history() in the console so both clients tell the same story about
  // the same row.
  async history(name: Collection, id: string, limit = 50): Promise<HistoryEntry[]> {
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("table_name", name)
      .eq("row_id", id)
      .order("at", { ascending: false })
      .limit(limit)
    if (error) {
      if (isMissingRelation(error)) return []
      throw error
    }
    return ((data || []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as number,
      collection: r.table_name as string,
      recordId: r.row_id as string,
      action: r.action as HistoryEntry["action"],
      actor: (r.actor as string | null) ?? null,
      at: r.at as string,
      changes: (r.changes || {}) as HistoryEntry["changes"],
      label: (r.label as string) || "",
    }))
  },

  // id -> person, for drawing an actor uuid as a name and a face. Reads the
  // allow-list view: `profiles` is owner-or-admin readable, so a sales user
  // querying it directly would get back only themselves.
  async staffDirectory(): Promise<StaffDirectory> {
    const { data, error } = await supabase.from("staff_directory").select("*")
    if (error) {
      if (isMissingRelation(error)) return {}
      throw error
    }
    const out: StaffDirectory = {}
    for (const p of (data || []) as Array<Record<string, unknown>>) {
      out[p.id as string] = {
        name: (p.name as string) || "",
        avatarUrl: (p.avatar_url as string) || "",
        role: (p.role as string) || "",
      }
    }
    return out
  },

  // The company's GSTIN, home state, numbering prefix, validity and terms: what
  // every quotation is priced and numbered from.
  //
  // Read through `settings_staff` (migration 0024), a view that hands any active
  // staff member the four document blocks and nothing else. The `settings` table
  // itself is admin-only (0007) AND holds integration secrets, so a sales rep
  // reading it directly got back an empty result — no error, no row — which used
  // to be merged over DEFAULT_SETTINGS and cached: their PDFs then carried the
  // placeholder GSTIN and every quotation was taxed as if the company sat in
  // Delhi. An empty read is now an ERROR, so it falls to the cache or surfaces,
  // never to the demo company.
  async getSettings(): Promise<Settings> {
    try {
      let { data, error } = await supabase.from("settings_staff").select("doc").maybeSingle()
      if (error && isMissingRelation(error)) {
        // 0024 not pushed to this project yet: the table still works for admins.
        ;({ data, error } = await supabase.from("settings").select("doc").eq("id", SETTINGS_ROW_ID).maybeSingle())
      }
      if (error) throw error
      const doc = (data as { doc?: unknown } | null)?.doc
      if (!doc) throw new Error("Company settings are not readable by this account.")
      const settings = mergeSettings(doc)
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
