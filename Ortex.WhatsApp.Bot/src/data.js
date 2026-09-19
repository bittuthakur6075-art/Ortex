// Read-only access to the Admin console's Supabase project, with the
// service_role key (like Ortex.Tally.Connector), because the bot answers for the
// business as a whole rather than as one signed-in person. It never writes.
//
// Rows are flattened exactly as Ortex.Admin/src/data/store/apiStore.js does:
// {id, doc, created_at, updated_at} -> {...doc, id, createdAt, updatedAt}.
import { createClient } from "@supabase/supabase-js"

const PAGE = 1000

export const flatten = (row) => ({ ...row.doc, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at })

export function connect(cfg) {
  return createClient(cfg.supabase.url, cfg.supabase.serviceKey, { auth: { persistSession: false } })
}

// Every row of a table, newest first, paged past PostgREST's 1000-row cap.
// `since` (ISO) limits by created_at, `updatedSince` by updated_at, `max` caps it.
export async function list(db, table, { since, updatedSince, max = 50000 } = {}) {
  const out = []
  for (let from = 0; from < max; from += PAGE) {
    let q = db.from(table).select("id, doc, created_at, updated_at").order("created_at", { ascending: false })
    if (since) q = q.gte("created_at", since)
    if (updatedSince) q = q.gte("updated_at", updatedSince)
    const { data, error } = await q.range(from, Math.min(from + PAGE, max) - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data.map(flatten))
    if (data.length < PAGE) break
  }
  return out
}

const DAY = 86400000

// Everything a report or an answer needs. Web activity is limited to the last
// 70 days (two 30-day windows plus slack) because it is by far the largest
// table and nothing older is ever reported.
export async function snapshot(db, now = Date.now()) {
  const [enquiries, quotations, invoices, payments, customers, activities] = await Promise.all([
    list(db, "enquiries"),
    list(db, "quotations"),
    list(db, "invoices"),
    list(db, "payments"),
    list(db, "customers"),
    list(db, "user_activities", { since: new Date(now - 70 * DAY).toISOString(), max: 40000 }),
  ])
  return { enquiries, quotations, invoices, payments, customers, activities, loadedAt: now }
}

// A short-lived cache, so a burst of questions does not reload every table.
export function cachedSnapshot(db, ttlMs = 60000) {
  let cached = null
  let pending = null
  return async () => {
    if (cached && Date.now() - cached.loadedAt < ttlMs) return cached
    if (!pending) {
      pending = snapshot(db).then((s) => (cached = s)).finally(() => (pending = null))
    }
    return pending
  }
}
