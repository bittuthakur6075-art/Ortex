// Edge Function: telecaller-webhook
//
// Where a real phone call comes home. Vapi posts server messages here while a
// call runs ("status-update") and once it ends ("end-of-call-report" with the
// transcript, recording and cost). We match the call by our own callId (sent
// as metadata when dialing) or by the provider's call id, store the transcript,
// run the Gemini analysis and roll the outcome up to the job, lead / enquiry
// and the next scheduled call — all via finalizeCall in _shared/telecaller.ts.
//
// Auth: the request must carry the shared secret in `x-vapi-secret` (Vapi sets
// it from the `server.secret` we pass when dialing). Supabase's gateway also
// expects a JWT, so the dial request asks Vapi to send the anon key in the
// Authorization header; alternatively deploy with --no-verify-jwt.
//
// Deploy:
//   supabase functions deploy telecaller-webhook
//   supabase secrets set TELECALLER_WEBHOOK_SECRET=<same random string used by telecaller-dial>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { cors, json } from "../_shared/http.ts"
import { finalizeCall, getDoc, patchDoc, type Doc } from "../_shared/telecaller.ts"

const timingSafeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Vapi's artifact.messages → our {role, text}[] turns. */
function turnsFrom(artifact: Doc | undefined, transcript: string | undefined) {
  const msgs = Array.isArray(artifact?.messages) ? artifact!.messages : []
  const turns = msgs
    .filter((m: Doc) => ["bot", "user", "assistant", "customer"].includes(m.role) && (m.message || m.content))
    .map((m: Doc) => ({ role: m.role === "user" || m.role === "customer" ? "customer" : "agent", text: String(m.message || m.content).slice(0, 1000) }))
  if (turns.length) return turns
  // Fall back to the plain transcript ("AI: ...\nUser: ...").
  return String(transcript || "")
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(AI|Assistant|Agent|Bot|User|Customer)\s*:\s*(.*)$/i)
      return m ? { role: /user|customer/i.test(m[1]) ? "customer" : "agent", text: m[2] } : null
    })
    .filter((t): t is { role: string; text: string } => !!t && !!t.text)
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const secret = Deno.env.get("TELECALLER_WEBHOOK_SECRET") || ""
  const given = req.headers.get("x-vapi-secret") || ""
  if (!secret || !timingSafeEqual(given, secret)) return json({ error: "Unauthorized" }, 401)

  const url = Deno.env.get("SUPABASE_URL")!
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!service) return json({ error: "Missing service role" }, 500)
  const db = createClient(url, service)

  try {
    const body = await req.json().catch(() => ({}))
    const msg: Doc = body.message || body
    const type = String(msg.type || "")
    const call: Doc = msg.call || {}
    const meta: Doc = call.metadata || msg.metadata || call.assistantOverrides?.metadata || {}

    // Locate our call row: metadata.callId first, provider id second.
    let row: Doc | null = meta.callId ? await getDoc(db, "telecaller_calls", meta.callId) : null
    if (!row && call.id) {
      const { data } = await db.from("telecaller_calls").select("*").eq("doc->>providerCallId", call.id).maybeSingle()
      if (data) row = { ...data.doc, id: data.id }
    }
    if (!row) return json({ ok: true, ignored: "unknown call" })

    if (type === "status-update") {
      const status = String(msg.status || "")
      const map: Record<string, string> = { queued: "dialing", ringing: "ringing", "in-progress": "in_progress", forwarding: "in_progress", ended: "ended" }
      if (map[status] && row.status !== "completed") await patchDoc(db, "telecaller_calls", row.id, { status: map[status], providerCallId: call.id || row.providerCallId })
      return json({ ok: true })
    }

    if (type === "end-of-call-report" || type === "hang" || msg.endedReason) {
      const artifact: Doc = msg.artifact || call.artifact || {}
      const turns = turnsFrom(artifact, msg.transcript || artifact.transcript)
      const started = msg.startedAt || call.startedAt
      const ended = msg.endedAt || call.endedAt
      const durationSec = Number(msg.durationSeconds) || (started && ended ? Math.round((new Date(ended).getTime() - new Date(started).getTime()) / 1000) : 0)
      const analysis = await finalizeCall(db, row.id, {
        transcript: turns,
        transcriptText: String(msg.transcript || artifact.transcript || ""),
        endedReason: String(msg.endedReason || call.endedReason || ""),
        durationSec,
        startedAt: started,
        recordingUrl: msg.recordingUrl || artifact.recordingUrl || artifact.recording?.url || null,
        cost: typeof msg.cost === "number" ? msg.cost : undefined,
        providerSummary: msg.summary || msg.analysis?.summary,
      })
      return json({ ok: true, outcome: analysis.outcome })
    }

    return json({ ok: true, ignored: type || "no type" })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    console.error("telecaller-webhook:", m)
    return json({ error: m }, 500)
  }
})
