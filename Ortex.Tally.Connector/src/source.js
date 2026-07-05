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
    const { data, error } = await db.from(collection).select("id, doc").limit(1000)
    if (error) throw new Error(`read ${collection}: ${error.message}`)
    // Not yet synced (no tally block, or a previous error/pending state).
    return data.filter((r) => (r.doc?.tally?.status ?? "pending") !== "synced")
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
