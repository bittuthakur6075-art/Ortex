// ApiStore, Supabase-backed implementation of the repository contract.
//
// Same async surface as localStore (see repository.js), so switching the app
// from browser storage to a real backend is a one-line change in repository.js.
// Every collection is a table of { id, doc, created_at, updated_at } rows; this
// module maps rows <-> the flat records the app uses: {...doc, id, createdAt,
// updatedAt}. Cross-references between records live inside `doc` and point at
// other rows' ids, exactly as they did in localStore.

import { supabase } from "./supabaseClient"
import { mergeSettings, DEFAULT_SETTINGS } from "../domain/settingsDefaults"

const SETTINGS_ROW_ID = true // single-row settings table (id boolean primary key)

// row {id, doc, created_at, updated_at, created_by, updated_by} -> flat record.
// The two actor uuids are server-owned (0023 stamps them from auth.uid() in a
// trigger), so they ride alongside the timestamps and are never part of `doc`.
function fromRow(row) {
  if (!row) return null
  const { id, doc, created_at, updated_at, created_by, updated_by } = row
  return {
    ...doc,
    id,
    createdAt: created_at,
    updatedAt: updated_at,
    createdBy: created_by ?? null,
    updatedBy: updated_by ?? null,
  }
}

// flat app record -> the JSONB `doc` payload (strip server-managed columns).
// createdBy/updatedBy are stripped for the same reason as the timestamps: a
// client that echoed them back would bury a stale copy inside the doc, and the
// trigger's value is the only one that is trustworthy anyway.
function toDoc(data) {
  const {
    id, createdAt, updatedAt, created_at, updated_at,
    createdBy, updatedBy, created_by, updated_by,
    ...doc
  } = data || {}
  void id; void createdAt; void updatedAt; void created_at; void updated_at
  void createdBy; void updatedBy; void created_by; void updated_by
  return doc
}

const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

// PostgREST reports an unknown table or view as 42P01 (and a stale schema cache
// as PGRST205). Both mean "migration 0023 has not been applied to THIS project"
// — a real state while production and staging are a push apart — so the audit
// reads degrade to empty instead of breaking the page they decorate.
const isMissingRelation = (error) =>
  error?.code === "42P01" || error?.code === "PGRST205" || /does not exist/i.test(error?.message || "")

// Realtime: a SINGLE shared channel over all public tables fans out to every
// subscriber. Components each call subscribe(); creating one channel per caller
// re-adds postgres_changes callbacks to the same topic and the SDK throws
// ("cannot add callbacks after subscribe()"), so we share one channel and keep
// a listener set, created on the first subscriber, torn down after the last.
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

// One audit_log row as the UI reads it. Shared by history() (one record) and
// actorHistory() (one person), so both feed the same renderer.
const toEntry = (r) => ({
  id: r.id,
  collection: r.table_name,
  recordId: r.row_id,
  action: r.action,
  actor: r.actor,
  at: r.at,
  changes: r.changes || {},
  label: r.label || "",
})

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

  // PostgREST caps a single response at the project's max-rows (1000 by
  // default) and gives no signal that it truncated, a plain .select("*") on a
  // growing table silently returns "the newest 1000 rows", so anything counted
  // from the result is wrong without saying so. Page explicitly instead.
  // `limit` bounds the walk for tables that grow without bound; omit it and
  // you really do get every row.
  async list(name, { limit = Infinity } = {}) {
    const PAGE = 1000
    const rows = []
    for (let from = 0; rows.length < limit; from += PAGE) {
      const size = Math.min(PAGE, limit - rows.length)
      const { data, error } = await supabase
        .from(name)
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + size - 1)
      if (error) throw error
      rows.push(...data.map(fromRow))
      if (data.length < size) break // short page => no more rows
    }
    return rows
  },

  // Exact row count without transferring the rows.
  async count(name) {
    const { count, error } = await supabase.from(name).select("id", { count: "exact", head: true })
    if (error) throw error
    return count ?? 0
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

  // Append-only change history for one record (0023). Oldest last, so the UI
  // reads top-down as "most recent first". Returns [] when the migration has
  // not been applied yet rather than throwing, because the audit card is an
  // enhancement on a page that must still render without it.
  async history(name, id, { limit = 50 } = {}) {
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
    return (data || []).map(toEntry)
  },

  // Everything ONE PERSON did, newest first. history() answers "what happened
  // to this record"; this answers "what has this account been doing", which is
  // the question the user detail page exists to answer. Served by 0023's
  // audit_log_actor_idx (actor, at desc), so it stays cheap as the log grows.
  async actorHistory(actorId, { limit = 200 } = {}) {
    if (!actorId) return []
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("actor", actorId)
      .order("at", { ascending: false })
      .limit(limit)
    if (error) {
      // history() can shrug this off — it is a card on a page about something
      // else. This read IS the page, so an absent table has to be said out
      // loud: an empty timeline would read as "this person did nothing".
      if (isMissingRelation(error)) {
        throw new Error(
          "The audit trail is not installed on this Supabase project (migration 0023). Run: supabase db push",
        )
      }
      throw error
    }
    return (data || []).map(toEntry)
  },

  // id -> { name, avatarUrl, role } for every staff account, so an actor uuid
  // can be drawn as a person. Reads the allow-list view, not `profiles`, which
  // a non-admin cannot read beyond their own row.
  async staffDirectory() {
    const { data, error } = await supabase.from("staff_directory").select("*")
    if (error) {
      if (isMissingRelation(error)) return {}
      throw error
    }
    const out = {}
    for (const p of data || []) out[p.id] = { name: p.name || "", avatarUrl: p.avatar_url || "", role: p.role || "" }
    return out
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

  // Atomic server-side counter, delegates to the next_sequence() SQL function.
  async nextSequence(series) {
    const { data, error } = await supabase.rpc("next_sequence", { p_series: series })
    if (error) throw error
    return data
  },

  async clearAll() {
    // Guarded destructive op, wipes every business table for this project.
    const tables = [
      "products", "categories", "social", "customers", "enquiries", "leads", "quotations", "invoices", "payments", "notifications",
      "user_activities", "event_logs", "whatsapp_logs", "ai_messages", "automation_rules", "message_templates",
      "telecaller_jobs", "telecaller_calls"
    ]
    for (const t of tables) {
      const { error } = await supabase.from(t).delete().neq("id", "00000000-0000-0000-0000-000000000000")
      if (error) throw error
    }
    await supabase.from("settings").upsert({ id: SETTINGS_ROW_ID, doc: DEFAULT_SETTINGS }, { onConflict: "id" })
    return true
  },

  async exportAll() {
    const tables = [
      "products", "categories", "social", "customers", "enquiries", "leads", "quotations", "invoices", "payments", "notifications",
      "user_activities", "event_logs", "whatsapp_logs", "ai_messages", "automation_rules", "message_templates",
      "telecaller_jobs", "telecaller_calls"
    ]
    const out = {}
    for (const t of tables) out[t] = await this.list(t)
    out.settings = await this.getSettings()
    return out
  },
}
