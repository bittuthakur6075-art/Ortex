import { supabase, hasSupabase } from "../../../lib/supabaseClient"

// ---- Call recording --------------------------------------------------------
// Both voices, mixed in the output audio context into one Opus file, recorded
// from the first second of the call. When the call ends with a lead, the file
// uploads to the private `voice-recordings` bucket
// (Ortex.Admin/supabase/migrations/0025_voice_call_recordings.sql), and every
// lead row of that call already carries its path in `doc.call.recording`, so
// the console's Voice calls drawer can play it. Visitors may only upload, and
// only under the name pattern the bucket policy allows.
//
// Known gap: a visitor who closes the tab mid-call leaves no recording, since
// an upload cannot be guaranteed to finish during page unload. The console
// says "Recording not available" for those.

export const RECORDING_BUCKET = "voice-recordings"

// First format the browser can record. Safari has no WebM, hence mp4.
const FORMATS = [
  ["audio/webm;codecs=opus", "webm"],
  ["audio/webm", "webm"],
  ["audio/ogg;codecs=opus", "ogg"],
  ["audio/mp4", "mp4"],
]

// One id per call. It names the recording and groups the call's lead rows.
export function newCallId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const b = new Uint8Array(16)
  globalThis.crypto.getRandomValues(b)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Must match the bucket's insert policy: calls/<year>/<uuid>.<webm|ogg|mp4>.
export function recordingPath(callId, ext) {
  return `calls/${new Date().getFullYear()}/${callId}.${ext}`
}

// Start recording. `voiceNode` carries Anu's audio (the output analyser), the
// mic stream the customer's. Returns null when the browser cannot record, and
// the call simply goes ahead unrecorded.
export function startCallRecording(ctx, voiceNode, micStream) {
  try {
    const format = FORMATS.find(([mime]) => window.MediaRecorder?.isTypeSupported?.(mime))
    if (!format) return null
    const [mime, ext] = format
    const mix = ctx.createMediaStreamDestination()
    voiceNode.connect(mix)
    // The mic goes through its own gain so muting also silences the recording.
    const micGain = ctx.createGain()
    ctx.createMediaStreamSource(micStream).connect(micGain)
    micGain.connect(mix)

    const chunks = []
    const type = mime.split(";")[0]
    const rec = new MediaRecorder(mix.stream, { mimeType: mime, audioBitsPerSecond: 32000 })
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data) }
    rec.start(1000)
    const collect = () => (chunks.length ? new Blob(chunks, { type }) : null)

    return {
      ext,
      setMicEnabled(on) { micGain.gain.value = on ? 1 : 0 },
      // Resolves with the finished file (or null). Call it BEFORE the audio
      // context closes, so the encoder still has a live stream to flush.
      stop() {
        return new Promise((resolve) => {
          if (rec.state === "inactive") return resolve(collect())
          rec.onstop = () => resolve(collect())
          try { rec.stop() } catch { resolve(collect()) }
        })
      },
    }
  } catch (err) {
    console.warn("Call recording unavailable:", err)
    return null
  }
}

/** Upload a finished recording. Resolves with the path, or null on failure. */
export async function uploadCallRecording(path, blob) {
  if (!hasSupabase || !path || !blob) return null
  try {
    const { error } = await supabase.storage.from(RECORDING_BUCKET).upload(path, blob, {
      contentType: blob.type || "audio/webm",
      upsert: false,
    })
    if (error) { console.warn("Call recording upload failed:", error.message); return null }
    return path
  } catch (err) {
    console.warn("Call recording upload failed:", err?.message || err)
    return null
  }
}
