// ApiStore — Supabase-backed implementation of the repository contract.
//
// Same async surface as localStore (see repository.js), so switching the app
// from browser storage to a real backend is a one-line change in repository.js.
// Every collection is a table of { id, doc, created_at, updated_at } rows; this
// module maps rows <-> the flat records the app uses: {...doc, id, createdAt,
// updatedAt}. Cross-references between records live inside `doc` and point at
// other rows' ids, exactly as they did in localStore.

import { supabase } from "./supabaseClient"
import { mergeSettings, DEFAULT_SETTINGS } from "./settingsDefaults"

const SETTINGS_ROW_ID = true // single-row settings table (id boolean primary key)

// row {id, doc, created_at, updated_at} -> flat app record
function fromRow(row) {
  if (!row) return null
  const { id, doc, created_at, updated_at } = row
  return { ...doc, id, createdAt: created_at, updatedAt: updated_at }
}

// flat app record -> the JSONB `doc` payload (strip server-managed columns)
function toDoc(data) {
  const { id, createdAt, updatedAt, created_at, updated_at, ...doc } = data || {}
  void id; void createdAt; void updatedAt; void created_at; void updated_at
  return doc
}

const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// Realtime: a SINGLE shared channel over all public tables fans out to every
// subscriber. Components each call subscribe(); creating one channel per caller
// re-adds postgres_changes callbacks to the same topic and the SDK throws
// ("cannot add callbacks after subscribe()"), so we share one channel and keep
// a listener set — created on the first subscriber, torn down after the last.
let _channel = null
const _subscribers = new Set()

function _ensureChannel() {
  if (_channel) return
  _channel = supabase
    .channel("ortex-admin-db")
    .on("postgres_changes", { event: "*", schema: "public" }, () => {
      _subscribers.forEach((cb) => cb())
    })
    .subscribe()
}

export const apiStore = {
  kind: "api",

  subscribe(callback) {
    _subscribers.add(callback)
    _ensureChannel()
    return () => {
      _subscribers.delete(callback)
      if (_subscribers.size === 0 && _channel) {
        supabase.removeChannel(_channel)
        _channel = null
      }
    }
  },

  async list(name) {
    const { data, error } = await supabase.from(name).select("*").order("created_at", { ascending: false })
    if (error) throw error
    return data.map(fromRow)
  },

  async get(name, id) {
    const { data, error } = await supabase.from(name).select("*").eq("id", id).maybeSingle()
    if (error) throw error
    return fromRow(data)
  },

  async create(name, data) {
    const row = { doc: toDoc(data) }
    if (isUuid(data?.id)) row.id = data.id // preserve a caller-supplied uuid
    const { data: created, error } = await supabase.from(name).insert(row).select("*").single()
    if (error) throw error
    return fromRow(created)
  },

  async bulkCreate(name, items) {
    const rows = items.map((d) => (isUuid(d?.id) ? { id: d.id, doc: toDoc(d) } : { doc: toDoc(d) }))
    const { data, error } = await supabase.from(name).insert(rows).select("*")
    if (error) throw error
    return data.map(fromRow)
  },

  // Top-level shallow merge, matching localStore's {...existing, ...patch}.
  async update(name, id, patch) {
    const existing = await this.get(name, id)
    if (!existing) return null
    const { data, error } = await supabase
      .from(name)
      .update({ doc: { ...toDoc(existing), ...toDoc(patch) } })
      .eq("id", id)
      .select("*")
      .single()
    if (error) throw error
    return fromRow(data)
  },

  async remove(name, id) {
    const { error } = await supabase.from(name).delete().eq("id", id)
    if (error) throw error
    return true
  },

  async getSettings() {
    const { data, error } = await supabase.from("settings").select("doc").eq("id", SETTINGS_ROW_ID).maybeSingle()
    if (error) throw error
    return mergeSettings(data?.doc || null)
  },

  async saveSettings(next) {
    const { error } = await supabase
      .from("settings")
      .upsert({ id: SETTINGS_ROW_ID, doc: next }, { onConflict: "id" })
    if (error) throw error
    return next
  },

  // Atomic server-side counter — delegates to the next_sequence() SQL function.
  async nextSequence(series) {
    const { data, error } = await supabase.rpc("next_sequence", { p_series: series })
    if (error) throw error
    return data
  },

  async clearAll() {
    // Guarded destructive op — wipes every business table for this project.
    const tables = ["products", "categories", "customers", "enquiries", "leads", "quotations", "invoices", "payments", "notifications"]
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000")
      if (error) throw error
    }
    await supabase.from("settings").upsert({ id: SETTINGS_ROW_ID, doc: DEFAULT_SETTINGS }, { onConflict: "id" })
    return true
  },

  async exportAll() {
    const tables = ["products", "categories", "customers", "enquiries", "leads", "quotations", "invoices", "payments", "notifications"]
    const out = {}
    for (const t of tables) out[t] = await this.list(t)
    out.settings = await this.getSettings()
    return out
  },
}
