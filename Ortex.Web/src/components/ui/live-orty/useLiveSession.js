import { useState, useRef, useEffect, useCallback } from "react"
import { GoogleGenAI, Modality } from "@google/genai"
import { supabase, hasSupabase } from "../../../lib/supabaseClient"
import { INPUT_RATE, OUTPUT_RATE, floatTo16BitPCM, int16ToBase64, base64ToInt16 } from "./audio"
import { VOICE_SYSTEM_INSTRUCTION, buildOpener } from "./prompt"
import { LIVE_TOOLS } from "./tools"
import { SPOKEN_FIELD, parseQuantity, validateLead, saveVoiceLead } from "./leads"
import { MEMORY_KEY, MAX_MEMORY_LINES, loadMemory } from "./memory"
import { newCallId, recordingPath, startCallRecording, uploadCallRecording } from "./recording"
import { catalogueBlock, classifyItem, loadCatalogue, lookupProduct } from "./catalogue"

/* ============================================================
   useLiveSession: the whole lifecycle of one voice call.

   Flow: ephemeral token (orty-live-token Edge Function) → Live WebSocket →
   stream mic as 16 kHz PCM, play Orty's 24 kHz PCM voice back.

   Audio contexts, the Live session, the mic stream, the recorder and the call
   timer are all torn down together in `stop`, so they live in one hook rather
   than being split across several. Drawing is NOT done here: the orb pulls a
   loudness value through `readLevel()` on its own animation frame.

   The page, not the model, owns the rules of a call. Every capture_lead is
   checked by validateLead (leads.js) and answered with what is still missing
   and what to do next; end_call with reason "completed" is refused once while
   the five details are missing or unconfirmed.

   A call ends in one of three ways, all through `finish()`: the visitor hangs
   up, Anu calls end_call, or the server closes the socket. Each leaves the
   panel open on a summary, and a call that produced a lead has its recording
   uploaded for the console (recording.js).
   ============================================================ */

const LIVE_MODEL = "gemini-3.1-flash-live-preview"
const MAX_CAPTION_CHUNKS = 80
// When the playback queue has run dry (a new reply, or network jitter), start
// the next chunk this far ahead so the ones behind it arrive in time instead of
// leaving an audible hole. Measured: one 37 ms hole per ~14 s without it.
const PLAYBACK_LEAD = 0.08
// De-click ramp on every discontinuity in Anu's audio: the start of a chunk
// that follows silence, and the end of one that is cut short by an
// interruption. 12 ms is inaudible as a fade and long enough to kill the step.
const FADE = 0.012
// Mic capture block. At 16 kHz a 4096-sample buffer is 256 ms, so a quarter of
// a second of the customer's speech sat in the browser before it was sent, on
// top of the model's own end-of-speech wait: she answered late for no reason.
// 1024 samples is 64 ms, still comfortably above the main thread's jitter.
const MIC_BUFFER = 1024
// How long the customer has to be silent before the model treats the turn as
// finished. The default waits noticeably longer than a person would.
const END_OF_SPEECH_SILENCE_MS = 450
// Gemini's voice peaks at about -0.3 dBFS; 0.9x leaves headroom so cheap
// speakers do not distort on loud syllables.
const OUTPUT_GAIN = 0.9
// How many times end_call may be refused for missing details before the page
// lets Anu hang up anyway. Once is enough to make her ask; refusing for ever
// would trap a customer who simply wants to go.
const MAX_END_REFUSALS = 1
// Marks that this browser session has already been offered a call.
const AUTO_OPEN_KEY = "ortex_anu_autocall"

const spoken = (keys) => keys.map((k) => SPOKEN_FIELD[k]).join(", ")

// What Anu should do after a successful save, from the page's own check.
function nextStep(check, confirmed) {
  const checks = check.problems.length ? `First check with the customer: ${check.problems.join("; ")}. ` : ""
  if (check.missing.length) {
    const first = check.missing[0]
    // Name the product rather than the field. "Ask for the products with a
    // quantity for each" is how a form talks; the customer has already said
    // what they want, and only the number is missing.
    const noQty = first === "items" ? (check.items || []).find((i) => !i.quantity || parseQuantity(i.quantity) === null) : null
    const ask = noQty
      ? `Ask how many ${noQty.product} they need, and take the answer as a number.`
      : first === "items"
        ? "Ask which product they are looking for, then how many they need."
        : `Ask for the ${SPOKEN_FIELD[first]} next, naturally, one question at a time.`
    return `${checks}Saved. Still needed: ${spoken(check.missing)}. ${ask}`
  }
  if (!confirmed) {
    return `${checks}All five details are captured. Read back the complete summary now: name, WhatsApp number in two groups of five digits, every product with its quantity, timeline and delivery city. Ask the customer to confirm. When they confirm, call capture_lead again with the same details and confirmed=true.`
  }
  return "Confirmed and saved. Tell the customer the team will send the free mockup and quotation on WhatsApp, usually within one working day. Then ASK whether they need anything else and WAIT for their answer. If they raise anything, handle it and ask again. Only when they have nothing further, say a short warm goodbye and call end_call with reason completed."
}

// Why end_call should be refused, or null when the call may end.
function endBlocker(reason, details) {
  if (reason !== "completed") return null
  if (!details) {
    return "Do not end yet: the customer's name and WhatsApp number are not saved. Ask for them, explaining that the team sends the free mockup and quotation on WhatsApp. If the customer does not want to share, call end_call with reason customer_declined."
  }
  if (!details.complete) {
    return `Do not end yet. Still needed: ${spoken(details.missing)}. Ask for these first. If the customer has to leave, call end_call with reason customer_busy.`
  }
  if (!details.confirmed) {
    return "Do not end yet. Read back the complete summary, get the customer's confirmation, save it with confirmed=true, then end the call."
  }
  return null
}

// What a visitor sees when the call cannot start. Setup instructions are only
// useful to a developer; a customer gets a plain sentence.
function friendlyError(err) {
  const name = err?.name || ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Please allow microphone access from your browser's address bar and try again."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "We could not find a microphone. Please connect one and try again."
  }
  return "We could not connect to Anu. Please check your internet connection and try again."
}

export function useLiveSession() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("idle") // idle | connecting | live | error
  const [speaking, setSpeaking] = useState(false)
  // True while the browser's autoplay policy holds Anu's audio suspended.
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [showLauncher, setShowLauncher] = useState(false)
  const [minimized, setMinimized] = useState(false)
  // Live caption of whoever spoke last: { id, who: "anu" | "you", chunks: [] }
  const [caption, setCaption] = useState(null)
  // What this call has captured so far, as validated by the page:
  // { name, phone, city, timeline, items, missing, complete, confirmed }
  const [lead, setLead] = useState(null)
  // Summary of the call that just finished: { seconds, lead }
  const [ended, setEnded] = useState(null)
  const autoOpenRef = useRef(false)

  const sessionRef = useRef(null)
  const busyRef = useRef(false)
  const inCtxRef = useRef(null)
  const outCtxRef = useRef(null)
  const streamRef = useRef(null)
  const procRef = useRef(null)
  const inAnalyserRef = useRef(null)
  const outAnalyserRef = useRef(null)
  const levelBufRef = useRef(null)
  const sourcesRef = useRef([])
  const nextTimeRef = useRef(0)
  const timerRef = useRef(0)
  const secondsRef = useRef(0)
  const endWantedRef = useRef(false)
  const endRefusalsRef = useRef(0)
  const callLeadRef = useRef(null)
  const turnDoneRef = useRef(true)
  const callIdRef = useRef(null)
  const catalogueRef = useRef(null)
  const recorderRef = useRef(null)
  const recPathRef = useRef(null)

  // Conversation memory: rolling transcript lines + latest captured lead.
  const convoRef = useRef([])
  const inBufRef = useRef("")
  const outBufRef = useRef("")
  const leadRef = useRef(null)

  const persistMemory = useCallback(() => {
    try {
      const lines = convoRef.current.slice(-MAX_MEMORY_LINES)
      if (!lines.length && !leadRef.current) return
      localStorage.setItem(MEMORY_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), lead: leadRef.current, lines }))
    } catch { /* localStorage full or blocked; memory is best-effort */ }
  }, [])

  // Close out a turn: fold the buffered user + Anu transcripts into the rolling
  // log (kept bounded) and persist. Called on every turnComplete.
  const flushTranscript = useCallback(() => {
    const u = inBufRef.current.trim()
    const a = outBufRef.current.trim()
    inBufRef.current = ""
    outBufRef.current = ""
    if (u) convoRef.current.push(`Customer: ${u}`)
    if (a) convoRef.current.push(`Anu: ${a}`)
    if (u || a) {
      convoRef.current = convoRef.current.slice(-MAX_MEMORY_LINES * 2)
      persistMemory()
    }
  }, [persistMemory])

  // Append streamed transcript text to the on-screen caption. A change of
  // speaker, or a new turn after turnComplete, starts a fresh caption.
  const pushCaption = useCallback((who, text) => {
    const fresh = turnDoneRef.current
    turnDoneRef.current = false
    setCaption((c) => {
      if (c && c.who === who && !fresh) return { ...c, chunks: [...c.chunks, text].slice(-MAX_CAPTION_CHUNKS) }
      return { id: Date.now(), who, chunks: [text] }
    })
  }, [])

  const stop = useCallback(() => {
    clearInterval(timerRef.current)
    // A recorder still running here belongs to a call being abandoned (closed
    // while connecting, or torn down on unmount): discard it. finish() and the
    // error path take theirs out first, through closeRecording.
    try { recorderRef.current?.stop() } catch { /* noop */ }
    recorderRef.current = null
    try { procRef.current?.disconnect() } catch { /* noop */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    // Null the session BEFORE closing it: onclose checks it to tell our own
    // hang-up apart from the server dropping the call.
    const session = sessionRef.current
    sessionRef.current = null
    try { session?.close() } catch { /* noop */ }
    if (outCtxRef.current) outCtxRef.current.onstatechange = null
    try { inCtxRef.current?.close() } catch { /* noop */ }
    try { outCtxRef.current?.close() } catch { /* noop */ }
    sourcesRef.current = []
    procRef.current = streamRef.current = null
    inCtxRef.current = outCtxRef.current = inAnalyserRef.current = outAnalyserRef.current = null
    nextTimeRef.current = 0
    secondsRef.current = 0
    endWantedRef.current = false
    setAudioBlocked(false)
    setSpeaking(false)
    setStatus("idle")
    setSeconds(0)
  }, [])

  // Hand the call's recording to storage. Only a call that produced a lead is
  // kept: the recording is filed against that lead, and a call with no details
  // has nobody to file it under. Must run before stop() closes the audio.
  const closeRecording = useCallback(() => {
    const rec = recorderRef.current
    recorderRef.current = null
    if (!rec) return
    const path = recPathRef.current
    const pending = rec.stop()
    if (callLeadRef.current && path) pending.then((blob) => uploadCallRecording(path, blob))
  }, [])

  // End the call and keep the panel open on its summary.
  const finish = useCallback(() => {
    const summary = { seconds: secondsRef.current, lead: callLeadRef.current }
    closeRecording()
    stop()
    setEnded(summary)
    setMinimized(false)
  }, [stop, closeRecording])

  useEffect(() => () => stop(), [stop])

  const playChunk = useCallback((int16) => {
    const ctx = outCtxRef.current
    const analyser = outAnalyserRef.current
    if (!ctx) return
    const float = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float[i] = (int16[i] / 0x8000) * OUTPUT_GAIN
    const buffer = ctx.createBuffer(1, float.length, OUTPUT_RATE)
    buffer.copyToChannel(float, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    // Every chunk gets its own gain, purely so it can be faded. A PCM buffer
    // that starts or stops mid-waveform is a step change in the signal, and a
    // step is a click: that is the "beep" heard every few seconds, once when
    // the queue underruns and restarts, and again each time the visitor
    // interrupts and the playing buffer is cut dead.
    const gain = ctx.createGain()
    gain.connect(analyser || ctx.destination)
    src.connect(gain)
    const now = ctx.currentTime
    // Contiguous with the chunk before it: the waveform continues, so no fade.
    // Otherwise this is the first chunk after silence and it needs a ramp in.
    const contiguous = nextTimeRef.current > now
    const start = contiguous ? nextTimeRef.current : now + PLAYBACK_LEAD
    if (contiguous) {
      gain.gain.setValueAtTime(1, start)
    } else {
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(1, start + FADE)
    }
    src.start(start)
    nextTimeRef.current = start + buffer.duration
    // Only on the transition. This used to run per chunk, which meant a React
    // render for every ~20 ms of speech, on the same main thread the mic's
    // ScriptProcessorNode runs on: that starved the mic and made her slower to
    // hear you, as well as causing the underruns above.
    if (!sourcesRef.current.length) setSpeaking(true)
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s.src !== src)
      if (sourcesRef.current.length === 0) {
        setSpeaking(false)
        // Anu asked to end the call: close once her goodbye has finished playing.
        if (endWantedRef.current) finish()
      }
    }
    sourcesRef.current.push({ src, gain })
  }, [finish])

  const clearPlayback = useCallback(() => {
    const ctx = outCtxRef.current
    const t = ctx ? ctx.currentTime : 0
    sourcesRef.current.forEach(({ src, gain }) => {
      try {
        // Ramp to silence over a few milliseconds, then stop. Stopping outright
        // is what makes an interruption click.
        gain.gain.cancelScheduledValues(t)
        gain.gain.setValueAtTime(gain.gain.value, t)
        gain.gain.linearRampToValueAtTime(0, t + FADE)
        src.stop(t + FADE)
      } catch { /* already stopped */ }
    })
    sourcesRef.current = []
    nextTimeRef.current = 0
    setSpeaking(false)
  }, [])

  // capture_lead: validate, save when the name and number hold up, and tell Anu
  // what is still missing and what to do next.
  const captureLead = useCallback((args) => {
    // MERGE OVER WHAT THIS CALL ALREADY CAPTURED, rather than validating the
    // payload in isolation. Anu is told to resend the complete picture every
    // time, and often does not: she sends just the city, or just the new item.
    // Validating that alone reported the name, phone and timeline as missing,
    // so the reply instructed her to ask for details the customer had already
    // given, and she sounded like she had forgotten the whole conversation.
    // Anything she does send still wins, so a correction ("Pune, not Delhi")
    // overwrites; only blanks fall back to what we already hold.
    const prior = callLeadRef.current || {}
    const keep = (next, held) => {
      const v = String(next ?? "").trim()
      return v || held || ""
    }
    const catalogue = catalogueRef.current
    const sentItems = Array.isArray(args.items) && args.items.length
      ? args.items
      : (args.product ? [{ product: args.product, quantity: args.quantity }] : [])
    // She is told to send the full list, so a list she sends replaces ours
    // (that is how an item gets dropped); no list at all keeps what we have.
    const rawItems = sentItems.length ? sentItems : (prior.items || [])
    const carried = {
      ...args,
      name: keep(args.name, prior.name),
      phone: keep(args.phone, prior.phone),
      city: keep(args.city, prior.city),
      timeline: keep(args.timeline, prior.timeline),
      company: keep(args.company, prior.company),
      email: keep(args.email, prior.email),
      address: keep(args.address, prior.address),
      use_case: keep(args.use_case, prior.use_case),
      summary: keep(args.summary, prior.summary),
    }
    // Decide for ourselves what is a custom run, rather than trusting Anu to
    // set the flag. An off-catalogue item filed as a stock one is a quotation
    // the factory may not be able to honour, and the sales desk cannot tell the
    // two apart afterwards. But a product in Ortex's standard range that has
    // simply not been entered in the console yet (lanyards, trophies,
    // clipboards) is NOT custom: flagging it as such sent the desk a "custom
    // item" note for the most ordinary order on the list.
    const enriched = catalogue
      ? {
          ...carried,
          items: rawItems.map((it) => {
            const kind = classifyItem(catalogue, it?.product)
            // Anu may still flag a listed product she agreed to vary; only a
            // standard-range item has its flag overruled, because that one she
            // is told to leave alone and the desk needs it clean.
            return { ...it, custom: kind === "custom" || (kind === "listed" && it?.custom === true) }
          }),
        }
      : { ...carried, items: rawItems }
    const check = validateLead(enriched)
    if (!check.ok) {
      // Ask about the field that actually failed. Told to confirm both every
      // time, Anu made a customer repeat a name she had heard perfectly,
      // which is the fastest way to sound like a machine.
      const fix = check.badName && check.badPhone
        ? "Ask the customer for their name again, then read the WhatsApp number back in two groups of five digits and correct it."
        : check.badName
          ? "The number is fine, so do NOT read it back again. Just ask for the customer's name once more, warmly, and accept a first name."
          : "The name is fine, so do NOT ask for it again. Read the WhatsApp number back in two groups of five digits and ask them to correct it."
      return {
        ok: false,
        saved: false,
        errors: check.errors,
        next: `Nothing was saved. ${fix} Then call capture_lead again with the complete details. Never tell the customer that anything failed to save.`,
      }
    }
    // A confirmation only counts for a complete order; anything changed after
    // it arrives without the flag and needs confirming again.
    const confirmed = args.confirmed === true && check.complete
    const saved = { ...enriched, name: check.name, phone: check.phone, city: check.city, timeline: check.timeline, items: check.items }
    saveVoiceLead(saved, { id: callIdRef.current, recording: recPathRef.current, confirmed, complete: check.complete })
    // Remember the details so a reopened call already knows them.
    leadRef.current = { ...(leadRef.current || {}), ...saved }
    persistMemory()
    const details = {
      name: check.name, phone: check.phone, city: check.city, timeline: check.timeline, items: check.items,
      missing: check.missing, complete: check.complete, confirmed,
    }
    callLeadRef.current = details
    setLead(details)
    return {
      ok: true,
      saved: true,
      complete: check.complete,
      confirmed,
      missing: check.missing.map((k) => SPOKEN_FIELD[k]),
      problems: check.problems,
      next: nextStep(check, confirmed),
    }
  }, [persistMemory])

  const handleMessage = useCallback((message) => {
    const calls = message?.toolCall?.functionCalls
    if (calls?.length) {
      for (const fc of calls) {
        let response = { ok: true }
        if (fc.name === "lookup_product") {
          const query = String(fc.args?.query || "")
          response = lookupProduct(catalogueRef.current, query)
          if (import.meta.env.DEV) {
            console.info("[Anu] lookup_product:", query, "->", response.matches?.length ? response.matches.map((m) => m.name).join(" | ") : "not in catalogue (custom run)")
          }
        }
        if (fc.name === "capture_lead") response = captureLead(fc.args || {})
        if (fc.name === "end_call") {
          const blocker = endBlocker(String(fc.args?.reason || "completed"), callLeadRef.current)
          if (blocker && endRefusalsRef.current < MAX_END_REFUSALS) {
            endRefusalsRef.current += 1
            response = { ok: false, ended: false, next: blocker }
          } else {
            endWantedRef.current = true
          }
        }
        try { sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response }] }) } catch { /* noop */ }
      }
      if (endWantedRef.current && sourcesRef.current.length === 0) {
        window.setTimeout(() => { if (endWantedRef.current) finish() }, 1200)
      }
    }
    const sc = message?.serverContent
    if (!sc) return
    if (sc.interrupted) {
      clearPlayback()
      if (import.meta.env.DEV && window.__anu) window.__anu.interrupts += 1
    }
    // Accumulate both sides' transcripts (enabled via in/outputAudioTranscription)
    // for the live caption and the running memory persisted across reopens.
    const heard = sc.inputTranscription?.text
    const said = sc.outputTranscription?.text
    if (heard) { inBufRef.current += heard; pushCaption("you", heard) }
    if (said) { outBufRef.current += said; pushCaption("anu", said) }
    if (sc.turnComplete) { flushTranscript(); turnDoneRef.current = true }
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) {
        if (import.meta.env.DEV && window.__anu) window.__anu.chunks += 1
        playChunk(base64ToInt16(inline.data))
      }
    }
  }, [captureLead, clearPlayback, playChunk, finish, flushTranscript, pushCaption])

  // Loudness of whoever is talking (Anu while her audio plays, else the mic),
  // 0..1. Called by the orb every animation frame, so it allocates nothing.
  const readLevel = useCallback(() => {
    const anuTalking = sourcesRef.current.length > 0
    const analyser = anuTalking ? outAnalyserRef.current : inAnalyserRef.current
    if (!analyser) return 0
    const n = analyser.fftSize
    if (!levelBufRef.current || levelBufRef.current.length !== n) levelBufRef.current = new Uint8Array(n)
    const buf = levelBufRef.current
    analyser.getByteTimeDomainData(buf)
    let sum = 0
    for (let i = 0; i < n; i++) { const v = (buf[i] - 128) / 128; sum += v * v }
    return Math.min(1, Math.sqrt(sum / n) * 4.5)
  }, [])

  // Must run inside a click/keypress to satisfy the autoplay policy.
  const unlockAudio = useCallback(() => {
    inCtxRef.current?.resume?.().catch(() => {})
    outCtxRef.current?.resume?.().catch(() => {})
  }, [])


  const start = useCallback(async () => {
    if (busyRef.current || sessionRef.current) return
    setEnded(null); setCaption(null); setLead(null); setErrorMsg("")
    callLeadRef.current = null
    turnDoneRef.current = true
    endRefusalsRef.current = 0
    callIdRef.current = newCallId()
    recPathRef.current = null
    if (!hasSupabase) {
      setErrorMsg(import.meta.env.DEV
        ? "Voice assistant not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Ortex.Web/.env and restart the dev server."
        : "Voice calls are currently unavailable. Please contact us on WhatsApp.")
      setStatus("error")
      return
    }
    busyRef.current = true
    setStatus("connecting")
    try {
      // Autoplay policy: the audio contexts are created BEFORE the first await,
      // so when a click started the call, that click is still the gesture
      // Chrome requires and Anu is audible. A call auto-opened on the 5s timer
      // has no gesture: its output starts suspended, `audioBlocked` goes true
      // and the panel asks for one tap. Any click or key on the page also
      // unlocks it.
      const AC = window.AudioContext || window.webkitAudioContext
      inCtxRef.current = new AC({ sampleRate: INPUT_RATE })
      // Output runs at the DEVICE's own rate; playChunk still builds 24 kHz
      // buffers and Web Audio resamples them. Forcing a 24 kHz context is what
      // some Windows / Bluetooth output drivers play back as silence.
      const out = new AC()
      outCtxRef.current = out
      const syncBlocked = () => setAudioBlocked(out.state === "suspended")
      out.onstatechange = () => {
        syncBlocked()
        if (import.meta.env.DEV) console.info("[Anu] audio output:", out.state)
      }
      // Dev-only: type `__anu` in the console to see whether Anu's audio is
      // arriving (chunks) and whether the output is running (state). Chunks
      // climbing with state "running" but silence means the device, not the page.
      if (import.meta.env.DEV) {
        window.__anu = { get state() { return out.state }, sampleRate: out.sampleRate, chunks: 0, interrupts: 0 }
      }
      unlockAudio()
      // resume() stays pending rather than rejecting while blocked, so look again after a beat.
      window.setTimeout(syncBlocked, 500)
      const onGesture = () => {
        unlockAudio()
        if (out.state !== "suspended") {
          window.removeEventListener("pointerdown", onGesture)
          window.removeEventListener("keydown", onGesture)
        }
      }
      window.addEventListener("pointerdown", onGesture)
      window.addEventListener("keydown", onGesture)
      const outAnalyser = out.createAnalyser()
      outAnalyser.fftSize = 256
      outAnalyser.connect(out.destination)
      outAnalyserRef.current = outAnalyser

      // The catalogue is read per call, so a product added or edited in the
      // console is described on the next call without a deploy. It rides
      // alongside the token fetch rather than delaying the connection.
      const [{ data, error }, catalogue] = await Promise.all([
        supabase.functions.invoke("orty-live-token", { body: {} }),
        loadCatalogue(),
      ])
      catalogueRef.current = catalogue
      if (import.meta.env.DEV) {
        console.info("[Anu] catalogue:", catalogue ? `${catalogue.products.length} products, ${catalogue.categories.length} categories` : "unavailable, using the prompt's general range")
      }
      // Closed while connecting: stop() already tore everything down.
      if (outCtxRef.current !== out) return
      if (error) throw error
      if (data?.error || !data?.token) throw new Error(data?.error || "No token")

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (outCtxRef.current !== out) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream

      // Record both voices from the first second. The path is fixed now, so
      // every lead row saved during the call can point at it.
      const recorder = startCallRecording(out, outAnalyser, stream)
      recorderRef.current = recorder
      recPathRef.current = recorder ? recordingPath(callIdRef.current, recorder.ext) : null

      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } })
      let live = null
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: VOICE_SYSTEM_INSTRUCTION + catalogueBlock(catalogue),
          speechConfig: { languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          // Let the model decide a turn has ended sooner than its default, so
          // she does not leave a long pause after the customer stops speaking.
          realtimeInputConfig: {
            automaticActivityDetection: { silenceDurationMs: END_OF_SPEECH_SILENCE_MS },
          },
          // Text of both sides: the live caption, and a rolling memory across reopens.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: LIVE_TOOLS,
        },
        callbacks: {
          onopen: () => {
            setStatus("live")
            timerRef.current = window.setInterval(() => {
              secondsRef.current += 1
              setSeconds(secondsRef.current)
            }, 1000)
          },
          onmessage: handleMessage,
          onerror: () => {
            if (sessionRef.current !== live) return
            closeRecording()
            stop()
            setErrorMsg("Your call was disconnected. Please check your internet connection and try again.")
            setStatus("error")
          },
          // Our own hang-up nulls sessionRef first; anything else is the
          // server ending the call, which gets the same summary as a hang-up.
          onclose: () => { if (live && sessionRef.current === live) finish() },
        },
      })
      live = session
      sessionRef.current = session
      // Orty greets first, before the visitor says anything. If the customer has
      // spoken to Anu before (within the memory window), resume with what we know
      // instead of a cold open, so reopening the panel does not forget the quote.
      try {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: buildOpener(loadMemory()) }] }],
          turnComplete: true,
        })
      } catch { /* ignore */ }

      const micSrc = inCtxRef.current.createMediaStreamSource(stream)
      const inAnalyser = inCtxRef.current.createAnalyser()
      inAnalyser.fftSize = 256
      micSrc.connect(inAnalyser)
      inAnalyserRef.current = inAnalyser

      const proc = inCtxRef.current.createScriptProcessor(MIC_BUFFER, 1, 1)
      proc.onaudioprocess = (e) => {
        if (!sessionRef.current) return
        try {
          sessionRef.current.sendRealtimeInput({
            audio: { data: int16ToBase64(floatTo16BitPCM(e.inputBuffer.getChannelData(0))), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
          })
        } catch { /* closing */ }
      }
      micSrc.connect(proc)
      // A ScriptProcessorNode only runs while it is connected to a destination,
      // but its own output must never reach the speakers: wiring the mic
      // processor straight to the destination puts the microphone on the
      // speakers, which feeds back as a beep or whine on a laptop. Route it
      // through a silent gain node instead, which keeps it pumping while
      // emitting nothing.
      const sink = inCtxRef.current.createGain()
      sink.gain.value = 0
      proc.connect(sink)
      sink.connect(inCtxRef.current.destination)
      procRef.current = proc
    } catch (err) {
      console.error("Live Orty failed:", err)
      // stop() resets status to idle, so it must run BEFORE the error is set.
      stop()
      setErrorMsg(friendlyError(err))
      setStatus("error")
    } finally {
      busyRef.current = false
    }
  }, [handleMessage, stop, finish, unlockAudio, closeRecording])

  const openCall = useCallback(() => { setOpen(true); setMinimized(false); start() }, [start])
  const endCall = useCallback(() => finish(), [finish])
  // Close the panel entirely (from the summary or an error) back to the launcher.
  const dismiss = useCallback(() => {
    stop()
    setOpen(false); setMinimized(false); setEnded(null); setErrorMsg("")
    setShowLauncher(true)
  }, [stop])

  // Auto-open the voice call 5s after load, ONCE per browser session. The
  // launcher stays hidden until the customer closes that first call, then lives
  // in the bottom-right corner.
  //
  // Once per session, not once per page load: a visitor moving around the site
  // (or a dev-server hot reload) would otherwise be rung again every few
  // minutes, and every one of those calls reopens the microphone, which many
  // laptops and headsets announce with a beep.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (autoOpenRef.current) return
      autoOpenRef.current = true
      try {
        if (sessionStorage.getItem(AUTO_OPEN_KEY)) { setShowLauncher(true); return }
        sessionStorage.setItem(AUTO_OPEN_KEY, String(Date.now()))
      } catch { /* private mode or blocked storage: fall through and open */ }
      setOpen(true)
      start()
    }, 5000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    open, status, speaking, audioBlocked, errorMsg, seconds, showLauncher, minimized, caption, lead, ended,
    readLevel, start, openCall, endCall, dismiss, unlockAudio,
    minimize: () => setMinimized(true),
    expand: () => setMinimized(false),
  }
}
