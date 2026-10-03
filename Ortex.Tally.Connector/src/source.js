// Supabase data source for the connector. Reads records that haven't been
// pushed to Tally yet and writes the sync result back into the record's `doc`
// (doc.tally = { status, voucherRef, syncedAt, error }) so the admin panel can
// show a status badge and nothing double-posts. `db` is a supabase-js client
// on the service-role key (index.js); this runs on your own machine, never in
// a browser.

// The tally_mark RPC (migration 0066) is missing on an older database.
const missingRpc = (e) => e?.code === "PGRST202" || e?.code === "42883"

export function makeSource(db) {
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
        .select("id, doc, updated_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
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

  // Sets ONLY doc.tally. The doc read at the start of the pass may be stale by
  // now (an invoice marked paid while Tally was posting), so the whole doc is
  // never written back blindly: tally_mark merges the key server-side, and on
  // a database without it the update is conditional on updated_at, re-reading
  // the row when someone saved it in between.
  async function writeBack(collection, row, result) {
    const tally = result.ok
      ? { status: "synced", syncedAt: new Date().toISOString(), voucherRef: result.voucherRef || null }
      : { status: "error", triedAt: new Date().toISOString(), error: result.error }

    const rpc = await db.rpc("tally_mark", { p_table: collection, p_id: row.id, p_tally: tally })
    // false: the row is gone, or the database refused the stamp (a legacy row
    // the 0066 CHECK rejects). Either way it is not stamped: say so.
    if (!rpc.error) {
      if (rpc.data === false) throw new Error(`writeback ${collection}/${row.id}: not stamped (the row is gone or fails the payment check; the Super Admin must correct it)`)
      return
    }
    if (!missingRpc(rpc.error)) throw new Error(`writeback ${collection}/${row.id}: ${rpc.error.message}`)

    let cur = row
    for (let i = 0; i < 5; i++) {
      const { data, error } = await db
        .from(collection)
        .update({ doc: { ...cur.doc, tally } })
        .eq("id", row.id)
        .eq("updated_at", cur.updated_at)
        .select("id")
      if (error) throw new Error(`writeback ${collection}/${row.id}: ${error.message}`)
      if (data?.length) return
      const fresh = await db.from(collection).select("id, doc, updated_at").eq("id", row.id).maybeSingle()
      if (fresh.error) throw new Error(`writeback ${collection}/${row.id}: ${fresh.error.message}`)
      if (!fresh.data) return // deleted meanwhile: nothing to mark
      cur = fresh.data
    }
    throw new Error(`writeback ${collection}/${row.id}: row kept changing, gave up`)
  }

  return { unsynced, writeBack }
}
