import { useState, useRef, useEffect, useCallback } from "react"
import { GoogleGenAI, Modality } from "@google/genai"
import { supabase, hasSupabase } from "../../../lib/supabaseClient"
import { INPUT_RATE, OUTPUT_RATE, floatTo16BitPCM, int16ToBase64, base64ToInt16 } from "./audio"
import { VOICE_SYSTEM_INSTRUCTION, buildOpener } from "./prompt"
import { LIVE_TOOLS } from "./tools"
import { validateLead, saveVoiceLead } from "./leads"
import { MEMORY_KEY, MAX_MEMORY_LINES, loadMemory } from "./memory"

/* ============================================================
   useLiveSession — the whole lifecycle of one voice call.

   Flow: ephemeral token (orty-live-token Edge Function) → Live WebSocket →
   stream mic as 16 kHz PCM, play Orty's 24 kHz PCM voice back.

   Audio contexts, the Live session, the mic stream and the call timer are all
   torn down together in `stop`, so they live in one hook rather than being
   split across several. Drawing is NOT done here: the orb pulls a loudness
   value through `readLevel()` on its own animation frame.

   A call ends in one of three ways, all through `finish()`: the visitor hangs
   up, Anu calls `end_call`, or the server closes the socket. Each leaves the
   panel open on a summary (`ended`) rather than vanishing mid-sentence.
   ============================================================ */

const LIVE_MODEL = "gemini-3.1-flash-live-preview"
const MAX_CAPTION_CHUNKS = 80
// When the playback queue has run dry (a new reply, or network jitter), start
// the next chunk this far ahead so the ones behind it arrive in time instead of
// leaving an audible hole. Measured: one 37 ms hole per ~14 s without it.
const PLAYBACK_LEAD = 0.08
// Gemini's voice peaks at about -0.3 dBFS; 0.9x leaves headroom so cheap
// speakers do not distort on loud syllables.
const OUTPUT_GAIN = 0.9

// What a visitor sees when the call cannot start. Setup instructions are only
// useful to a developer; a customer gets a plain sentence.
function friendlyError(err) {
  const name = err?.name || ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access is blocked. Allow the mic from your browser's address bar, then try again."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No microphone found. Plug one in or switch devices, then try again."
  }
  return "Couldn't reach Anu. Check your connection and try again."
}

export function useLiveSession() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("idle") // idle | connecting | live | error
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  // True while the browser's autoplay policy holds Anu's audio suspended.
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [showLauncher, setShowLauncher] = useState(false)
  const [minimized, setMinimized] = useState(false)
  // Live caption of whoever spoke last: { id, who: "anu" | "you", chunks: [] }
  const [caption, setCaption] = useState(null)
  // Details Anu confirmed and saved during THIS call.
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
  const mutedRef = useRef(false)
  const endWantedRef = useRef(false)
  const callLeadRef = useRef(null)
  const turnDoneRef = useRef(true)

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
    } catch { /* localStorage full or blocked — memory is best-effort */ }
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
    mutedRef.current = false
    endWantedRef.current = false
    setMuted(false)
    setAudioBlocked(false)
    setSpeaking(false)
    setStatus("idle")
    setSeconds(0)
  }, [])

  // End the call and keep the panel open on its summary.
  const finish = useCallback(() => {
    const summary = { seconds: secondsRef.current, lead: callLeadRef.current }
    stop()
    setEnded(summary)
    setMinimized(false)
  }, [stop])

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
    src.connect(analyser || ctx.destination)
    const start = nextTimeRef.current > ctx.currentTime ? nextTimeRef.current : ctx.currentTime + PLAYBACK_LEAD
    src.start(start)
    nextTimeRef.current = start + buffer.duration
    setSpeaking(true)
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src)
      if (sourcesRef.current.length === 0) {
        setSpeaking(false)
        // Anu asked to end the call: close once her goodbye has finished playing.
        if (endWantedRef.current) finish()
      }
    }
    sourcesRef.current.push(src)
  }, [finish])

  const clearPlayback = useCallback(() => {
    sourcesRef.current.forEach((s) => { try { s.stop() } catch { /* noop */ } })
    sourcesRef.current = []
    nextTimeRef.current = 0
    setSpeaking(false)
  }, [])

  const handleMessage = useCallback((message) => {
    // Tool calls: capture the lead, and/or end the call from Anu's side.
    const calls = message?.toolCall?.functionCalls
    if (calls?.length) {
      for (const fc of calls) {
        let response = { ok: true }
        if (fc.name === "capture_lead") {
          // Validate before saving. On failure, tell Anu exactly what is wrong so
          // she reads the number back and re-asks, then calls capture_lead again,
          // instead of a bad lead landing silently in the Admin.
          const check = validateLead(fc.args || {})
          if (check.ok) {
            const saved = { ...(fc.args || {}), name: check.name, phone: check.phone }
            saveVoiceLead(saved)
            // Remember the confirmed details so a reopened call already knows them.
            leadRef.current = { ...(leadRef.current || {}), ...saved }
            callLeadRef.current = saved
            setLead(saved)
            persistMemory()
            response = { ok: true, saved: true }
          } else {
            response = {
              ok: false,
              saved: false,
              errors: check.errors,
              retry: "Politely read the WhatsApp number back digit by digit to confirm it, correct any mistake, then call capture_lead again.",
            }
          }
        }
        if (fc.name === "end_call") endWantedRef.current = true
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
  }, [clearPlayback, playChunk, finish, flushTranscript, persistMemory, pushCaption])

  // Loudness of whoever is talking (Anu while her audio plays, else the mic),
  // 0..1. Called by the orb every animation frame, so it allocates nothing.
  const readLevel = useCallback(() => {
    const anuTalking = sourcesRef.current.length > 0
    const analyser = anuTalking ? outAnalyserRef.current : (mutedRef.current ? null : inAnalyserRef.current)
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

  const toggleMute = useCallback(() => {
    mutedRef.current = !mutedRef.current
    setMuted(mutedRef.current)
  }, [])

  const start = useCallback(async () => {
    if (busyRef.current || sessionRef.current) return
    setEnded(null); setCaption(null); setLead(null); setErrorMsg("")
    callLeadRef.current = null
    turnDoneRef.current = true
    if (!hasSupabase) {
      setErrorMsg(import.meta.env.DEV
        ? "Voice assistant not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Ortex.Web/.env and restart the dev server."
        : "Voice calls are unavailable right now. Please reach us on WhatsApp instead.")
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

      const { data, error } = await supabase.functions.invoke("orty-live-token", { body: {} })
      // Closed while connecting: stop() already tore everything down.
      if (outCtxRef.current !== out) return
      if (error) throw error
      if (data?.error || !data?.token) throw new Error(data?.error || "No token")

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (outCtxRef.current !== out) { stream.getTracks().forEach((t) => t.stop()); return }
      streamRef.current = stream

      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } })
      let live = null
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: VOICE_SYSTEM_INSTRUCTION,
          speechConfig: { languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
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
            stop()
            setErrorMsg("The call dropped. Check your connection and try again.")
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

      const proc = inCtxRef.current.createScriptProcessor(4096, 1, 1)
      proc.onaudioprocess = (e) => {
        if (!sessionRef.current || mutedRef.current) return
        try {
          sessionRef.current.sendRealtimeInput({
            audio: { data: int16ToBase64(floatTo16BitPCM(e.inputBuffer.getChannelData(0))), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
          })
        } catch { /* closing */ }
      }
      micSrc.connect(proc)
      proc.connect(inCtxRef.current.destination)
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
  }, [handleMessage, stop, finish, unlockAudio])

  const openCall = useCallback(() => { setOpen(true); setMinimized(false); start() }, [start])
  const endCall = useCallback(() => finish(), [finish])
  // Close the panel entirely (from the summary or an error) back to the launcher.
  const dismiss = useCallback(() => {
    stop()
    setOpen(false); setMinimized(false); setEnded(null); setErrorMsg("")
    setShowLauncher(true)
  }, [stop])

  // Auto-open the voice call 5s after load. The launcher stays hidden until the
  // customer closes that first call, then lives in the bottom-right corner.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (autoOpenRef.current) return
      autoOpenRef.current = true
      setOpen(true)
      start()
    }, 5000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    open, status, speaking, muted, audioBlocked, errorMsg, seconds, showLauncher, minimized, caption, lead, ended,
    readLevel, start, openCall, endCall, dismiss, toggleMute, unlockAudio,
    minimize: () => setMinimized(true),
    expand: () => setMinimized(false),
  }
}
