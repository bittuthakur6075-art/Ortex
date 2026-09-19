// Edge Function: attendance-housekeeping
//
// Deletes clock-in selfies older than the Super Admin's retention setting
// (attendance_settings.doc.selfieRetentionDays, 90 by default). Storage files
// can only be removed through the Storage API, which is why this is a function
// and not part of the nightly SQL job (migration 0034).
//
// Two callers:
//   · the `attendance-housekeeping` pg_cron job, nightly, with the header
//     x-cron-secret: the value is generated inside the database's Vault by
//     migration 0034 and checked here through attendance_cron_secret_ok();
//   · the Super Admin, from Attendance → Settings ("Delete old selfies now"),
//     with their own session.
//
// Deploy with --no-verify-jwt (pg_cron sends no user JWT; both paths are
// checked below).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"

const BUCKET = "attendance-selfies"
const BATCH = 100
const MAX_PER_RUN = 2000

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "POST only" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const db = createClient(url, service, { auth: { persistSession: false } })

  const cronSecret = req.headers.get("x-cron-secret")
  if (cronSecret) {
    const { data: ok } = await db.rpc("attendance_cron_secret_ok", { p_secret: cronSecret })
    if (ok !== true) return json({ error: "unauthorised" }, 401)
  } else {
    const staff = await requireStaff(req, ["super_admin"], "Only the Super Admin can delete selfies")
    if (staff instanceof Response) return staff
  }

  let removed = 0
  let failed = 0
  while (removed + failed < MAX_PER_RUN) {
    const { data: rows, error } = await db.rpc("attendance_expired_selfies", { p_limit: BATCH })
    if (error) return json({ error: error.message, removed, failed }, 500)
    if (!rows?.length) break

    const paths = rows.map((r: { path: string }) => r.path)
    const { error: rmErr } = await db.storage.from(BUCKET).remove(paths)
    if (rmErr) {
      failed += rows.length
      break
    }
    // A path whose file was already gone is still cleared, so the row stops
    // pointing at nothing and the next run does not try it again.
    const { error: markErr } = await db.rpc("attendance_selfies_purged", {
      p_ids: rows.map((r: { punch_id: string }) => r.punch_id),
    })
    if (markErr) return json({ error: markErr.message, removed, failed }, 500)
    removed += rows.length
    if (rows.length < BATCH) break
  }

  return json({ ok: true, removed, failed })
})
