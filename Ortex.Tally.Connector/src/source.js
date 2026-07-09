// Supabase data source for the connector. Reads records that haven't been
// pushed to Tally yet and writes the sync result back into the record's `doc`
// (doc.tally = { status, voucherRef, syncedAt, error }) so the admin panel can
// show a status badge and nothing double-posts. Uses the service-role key —
// this runs on your own machine, never in a browser.

import { createClient } from "@supabase/supabase-js"

export function makeSource(cfg) {
  const db = createClient(cfg.supabase.url, cfg.supabase.serviceKey, {
    auth: { persistSession: false },
  })

  async function unsynced(collection) {
    // Page through the whole collection with a stable order. The previous
    // single .limit(1000) with no .order() meant that once a collection grew
    // past 1000 rows, records outside an arbitrary window were NEVER synced.
    // The "not yet synced" test stays client-side because brand-new rows have
    // no doc.tally block at all (a server-side JSON filter would drop those).
    const pageSize = 1000
    const out = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await db
        .from(collection)
        .select("id, doc")
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw new Error(`read ${collection}: ${error.message}`)
      if (!data || data.length === 0) break
      for (const r of data) {
        if ((r.doc?.tally?.status ?? "pending") !== "synced") out.push(r)
      }
      if (data.length < pageSize) break
    }
    return out
  }

  async function writeBack(collection, id, doc, result) {
    const tally = result.ok
      ? { status: "synced", syncedAt: new Date().toISOString(), voucherRef: result.voucherRef || null }
      : { status: "error", triedAt: new Date().toISOString(), error: result.error }
    const { error } = await db.from(collection).update({ doc: { ...doc, tally } }).eq("id", id)
    if (error) throw new Error(`writeback ${collection}/${id}: ${error.message}`)
  }

  return { unsynced, writeBack }
}
