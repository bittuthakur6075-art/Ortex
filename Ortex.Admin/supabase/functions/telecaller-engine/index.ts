// Edge Function: telecaller-engine
//
// The scheduler tick for the AI telecaller. On every run it:
//   1. queues follow-up jobs for new leads / enquiries that nobody has called,
//   2. queues feedback calls N days after an invoice and upsell calls M days
//      after (cadences live in Settings → Telecaller),
//   3. dials whatever is due, inside calling hours, under the daily cap.
//
// Two ways in, same as social-publish / indiamart-pull:
//   a) pg_cron: the service-role key as the bearer, OR the anon key as bearer plus
//      TELECALLER_WEBHOOK_SECRET in the x-telecaller-secret header (keeps the
//      service key out of cron.job). Body { mode: "sweep" }.
//   b) an admin pressing "Run sweep now" in the console ({ mode: "sweep" }), or
//      "Refresh queue" ({ mode: "enqueue" }) which queues but does not dial.
//
// Staff cannot make it dial outside calling hours or past the cap unless they
// pass { force: true }, which only an admin may do.
//
// Schedule (Supabase SQL editor — see docs/guides/TELECALLER_SETUP.md):
//   select cron.schedule('telecaller-sweep', '*/10 * * * *', $$ select net.http_post(
//     url := 'https://<ref>.supabase.co/functions/v1/telecaller-engine',
//     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
//     body := jsonb_build_object('mode','sweep')) $$);

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { sweep } from "../_shared/telecaller.ts"
import { refreshPulse } from "../_shared/telecallerPulse.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const url = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!service) return json({ error: "Telecaller is not configured (missing service role)." }, 500)

  const bearer = (req.headers.get("Authorization") || "").replace(/^bearer\s+/i, "").trim()
  const cronSecret = Deno.env.get("TELECALLER_WEBHOOK_SECRET") || ""
  const givenSecret = req.headers.get("x-telecaller-secret") || ""
  const isScheduler = bearer === service || (cronSecret.length > 0 && givenSecret === cronSecret)
  let force = false
  if (!isScheduler) {
    const staff = await requireStaff(req)
    if (staff instanceof Response) return staff
    const body = await req.clone().json().catch(() => ({}))
    force = body.force === true && staff.role === "admin"
  }

  try {
    const body = await req.json().catch(() => ({}))
    const mode = body.mode === "enqueue" ? "enqueue" : body.mode === "pulse" ? "pulse" : "sweep"
    const db = createClient(url, service)
    if (mode === "pulse") {
      const pulse = await refreshPulse(db)
      return json({ ok: true, mode, pulse })
    }
    const report = await sweep(db, { force, dial: mode === "sweep" })
    return json({ ok: true, mode, ...report })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("telecaller-engine:", msg)
    return json({ error: msg }, 500)
  }
})
