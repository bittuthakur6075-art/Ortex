// Edge Function: telecaller-dial
//
// "Call this person now" from the console. Staff-gated. Either dials an
// existing job ({ jobId }) or creates one from a target and dials it at once
// ({ target: { phone, contactName, kind, leadId | enquiryId | invoiceId,
// context, objective } }). Pass { queueOnly: true } to create the job without
// dialing (it then waits for the engine's next sweep inside calling hours).
//
// With provider "simulate" (the default until Vapi is configured) the call is
// role-played by Gemini and completes inside this request, so the caller gets
// the analysis back immediately. With "vapi" the response is "ringing" and the
// outcome lands via telecaller-webhook.
//
// Deploy:
//   supabase functions deploy telecaller-dial
//   supabase secrets set GEMINI_API_KEY=...            (analysis + simulator)
//   supabase secrets set VAPI_API_KEY=... VAPI_PHONE_NUMBER_ID=...   (real calls)
//   supabase secrets set TELECALLER_WEBHOOK_SECRET=<random string>

import { cors, json } from "../_shared/http.ts"
import { requireStaff } from "../_shared/auth.ts"
import { briefForJob, dialJob, insertDoc, isIndianMobile, loadSettings, newJob, normalizePhone, recordLiveCall, vapiConfigured } from "../_shared/telecaller.ts"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const staff = await requireStaff(req)
  if (staff instanceof Response) return staff
  if (!Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return json({ error: "Telecaller is not configured (missing service role)." }, 500)

  try {
    const body = await req.json().catch(() => ({}))
    const { telecaller } = await loadSettings(staff.db)
    let jobId: string = body.jobId

    if (!jobId) {
      const t = body.target || {}
      const phone = normalizePhone(t.phone)
      if (!isIndianMobile(phone)) return json({ error: "A valid 10-digit Indian mobile number is required." }, 400)
      if (telecaller.doNotCall.includes(phone)) return json({ error: "This number is on the do-not-call list." }, 400)
      const job = await insertDoc(staff.db, "telecaller_jobs", newJob({
        ...t,
        phone,
        kind: ["followup", "pitch", "feedback", "upsell", "manual"].includes(t.kind) ? t.kind : "manual",
        maxAttempts: telecaller.maxAttempts,
        createdBy: staff.email || staff.userId,
        source: t.source || "console",
      }))
      jobId = job.id
      if (body.queueOnly) return json({ ok: true, jobId, queued: true })
    }

    // Browser practice (Gemini Live in the console): hand back the brief, or
    // store + analyse the transcript the browser captured.
    if (body.mode === "brief") {
      const { job, brief, settings } = await briefForJob(staff.db, jobId)
      return json({ ok: true, jobId, job: { id: jobId, kind: job.kind, contactName: job.contactName, phone: job.phone }, brief, language: settings.language, agentName: settings.agentName })
    }
    if (body.mode === "record") {
      const turns = (Array.isArray(body.transcript) ? body.transcript : [])
        .filter((t: { role?: string; text?: string }) => t && typeof t.text === "string" && t.text.trim())
        .map((t: { role?: string; text?: string }) => ({ role: t.role === "customer" ? "customer" : "agent", text: String(t.text).slice(0, 1200) }))
        .slice(0, 400)
      if (!turns.length) return json({ error: "No transcript captured — nothing to analyse." }, 400)
      const result = await recordLiveCall(staff.db, jobId, { transcript: turns, durationSec: Number(body.durationSec) || 0, startedAt: body.startedAt, practice: body.practice !== false, by: staff.email || staff.userId })
      return json({ ok: true, jobId, ...result, simulated: true })
    }

    const provider = body.provider === "simulate" ? "simulate" : body.provider === "vapi" ? "vapi" : undefined
    const result = await dialJob(staff.db, jobId, { force: true, provider })
    return json({
      ok: !result.error,
      jobId,
      ...result,
      providerConfigured: vapiConfigured(),
    }, result.error ? 502 : 200)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("telecaller-dial:", msg)
    return json({ error: msg }, 500)
  }
})
