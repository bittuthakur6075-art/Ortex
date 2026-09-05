// Outbound calls to the telecaller Edge Functions. The browser never dials
// anything itself: it queues a job (a plain repo write) or asks the function to
// dial now, and reads the outcome back from the telecaller_* collections.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

async function invoke(name, body) {
  if (!hasSupabase) return { error: "Backend not configured - the AI telecaller needs Supabase." }
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let message = error.message
    try {
      const payload = await error.context?.json?.()
      if (payload?.error) message = payload.error
    } catch { /* keep the SDK message */ }
    return { error: message }
  }
  return data || {}
}

/**
 * Dial an existing job now, or create one from `target` and dial it.
 * target: { phone, contactName, company, kind, leadId, enquiryId, invoiceId, context, objective }
 * opts:   { queueOnly, provider }
 */
export function dialNow({ jobId, target, queueOnly = false, provider } = {}) {
  return invoke("telecaller-dial", { jobId, target, queueOnly, provider })
}

/** Run the scheduler tick. mode "sweep" queues + dials, "enqueue" only queues. */
export function runSweep({ mode = "sweep", force = false } = {}) {
  return invoke("telecaller-engine", { mode, force })
}

/** Brief for a browser practice call: { jobId, job, brief: { systemPrompt, firstMessage }, language, agentName }. */
export function briefFor({ jobId, target } = {}) {
  return invoke("telecaller-dial", { jobId, target, mode: "brief" })
}

/** Store + analyse the transcript of a browser practice call. */
export function recordLiveCall({ jobId, transcript, durationSec, startedAt, practice = true, recordingPath }) {
  return invoke("telecaller-dial", { jobId, transcript, durationSec, startedAt, practice, recordingPath, mode: "record" })
}

/** Regenerate today's India business pulse (Gemini + Google Search). */
export function refreshPulse() {
  return invoke("telecaller-engine", { mode: "pulse" })
}

/** Upload a practice-call recording; returns the storage path or null. */
export async function uploadRecording(blob, jobId) {
  if (!hasSupabase || !blob || !blob.size) return null
  const path = `practice/${jobId}/${Date.now()}.webm`
  const { error } = await supabase.storage.from("telecaller-recordings").upload(path, blob, { contentType: blob.type || "audio/webm", upsert: false })
  if (error) { console.warn("recording upload failed:", error.message); return null }
  return path
}

/** Short-lived playback URL for a stored recording. */
export async function recordingUrl(path) {
  if (!hasSupabase || !path) return null
  const { data, error } = await supabase.storage.from("telecaller-recordings").createSignedUrl(path, 3600)
  return error ? null : data?.signedUrl || null
}
