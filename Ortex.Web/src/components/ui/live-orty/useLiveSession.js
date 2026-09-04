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

   Audio contexts, the Live session, the mic stream, the waveform rAF loop and
   the call timer are all torn down together in `stop`, so they live in one hook
   rather than being split across several.
   ============================================================ */

const LIVE_MODEL = "gemini-3.1-flash-live-preview"
export const BARS = 54

export function useLiveSession() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("idle") // idle | connecting | live | error
  const [speaking, setSpeaking] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [showLauncher, setShowLauncher] = useState(false)
  const autoOpenRef = useRef(false)

  const sessionRef = useRef(null)
  const inCtxRef = useRef(null)
  const outCtxRef = useRef(null)
  const streamRef = useRef(null)
  const procRef = useRef(null)
  const inAnalyserRef = useRef(null)
  const outAnalyserRef = useRef(null)
  const sourcesRef = useRef([])
  const nextTimeRef = useRef(0)
  const rafRef = useRef(0)
  const timerRef = useRef(0)
  const mutedRef = useRef(false)
  const endWantedRef = useRef(false)
  const smoothRef = useRef(new Float32Array(BARS))
  const canvasRef = useRef(null)

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

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    clearInterval(timerRef.current)
    try { procRef.current?.disconnect() } catch { /* noop */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    try { sessionRef.current?.close() } catch { /* noop */ }
    try { inCtxRef.current?.close() } catch { /* noop */ }
    try { outCtxRef.current?.close() } catch { /* noop */ }
    sourcesRef.current = []
    sessionRef.current = procRef.current = streamRef.current = null
    inCtxRef.current = outCtxRef.current = inAnalyserRef.current = outAnalyserRef.current = null
    nextTimeRef.current = 0
    smoothRef.current = new Float32Array(BARS)
    setSpeaking(false)
    setStatus("idle")
    setSeconds(0)
  }, [])

  useEffect(() => () => stop(), [stop])

  const playChunk = useCallback((int16) => {
    const ctx = outCtxRef.current
    const analyser = outAnalyserRef.current
    if (!ctx) return
    const float = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000
    const buffer = ctx.createBuffer(1, float.length, OUTPUT_RATE)
    buffer.copyToChannel(float, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(analyser || ctx.destination)
    const start = Math.max(ctx.currentTime, nextTimeRef.current)
    src.start(start)
    nextTimeRef.current = start + buffer.duration
    setSpeaking(true)
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src)
      if (sourcesRef.current.length === 0) {
        setSpeaking(false)
        // Anu asked to end the call: close once her goodbye has finished playing.
        if (endWantedRef.current) {
          endWantedRef.current = false
          stop(); setOpen(false); setShowLauncher(true)
        }
      }
    }
    sourcesRef.current.push(src)
  }, [stop])

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
            const lead = { ...(fc.args || {}), name: check.name, phone: check.phone }
            saveVoiceLead(lead)
            // Remember the confirmed details so a reopened call already knows them.
            leadRef.current = { ...(leadRef.current || {}), ...lead }
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
        window.setTimeout(() => {
          if (endWantedRef.current) { endWantedRef.current = false; stop(); setOpen(false); setShowLauncher(true) }
        }, 1200)
      }
    }
    const sc = message?.serverContent
    if (!sc) return
    if (sc.interrupted) clearPlayback()
    // Accumulate both sides' transcripts (enabled via in/outputAudioTranscription)
    // so we can persist a running memory of the conversation across reopens.
    if (sc.inputTranscription?.text) inBufRef.current += sc.inputTranscription.text
    if (sc.outputTranscription?.text) outBufRef.current += sc.outputTranscription.text
    if (sc.turnComplete) flushTranscript()
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) {
        playChunk(base64ToInt16(inline.data))
      }
    }
  }, [clearPlayback, playChunk, stop, flushTranscript, persistMemory])

  // rAF: Gemini-style bar equalizer reacting to the active analyser's spectrum
  // (Anu's voice while speaking, else the mic). Idle ripple when silent.
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth || 460
      const cssH = canvas.clientHeight || 96
      if (canvas.width !== Math.round(cssW * dpr)) { canvas.width = cssW * dpr; canvas.height = cssH * dpr }
      const g = canvas.getContext("2d")
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, cssW, cssH)

      const speakingNow = sourcesRef.current.length > 0
      const analyser = speakingNow ? outAnalyserRef.current : inAnalyserRef.current
      let bins = null
      if (analyser) { bins = new Uint8Array(analyser.frequencyBinCount); analyser.getByteFrequencyData(bins) }

      const now = performance.now() / 1000
      const mid = cssH / 2
      const step = cssW / BARS
      const barW = Math.min(4, step * 0.5)
      const smooth = smoothRef.current
      for (let i = 0; i < BARS; i++) {
        const t = i / (BARS - 1)
        const bell = 0.28 + 0.72 * Math.sin(Math.PI * t) // taller in the centre
        let target
        if (bins) {
          const bin = Math.floor((0.04 + t * 0.5) * bins.length)
          target = (bins[bin] / 255) * bell
        } else {
          target = (0.06 + 0.06 * (0.5 + 0.5 * Math.sin(now * 3 + i * 0.5))) * bell
        }
        smooth[i] += (target - smooth[i]) * 0.35
        const barH = Math.max(barW, 3 + smooth[i] * (cssH * 0.9))
        const x = i * step + (step - barW) / 2
        g.fillStyle = speakingNow ? "rgba(150,170,255,0.95)" : "rgba(255,255,255,0.9)"
        g.beginPath()
        g.roundRect(x, mid - barH / 2, barW, barH, barW / 2)
        g.fill()
      }
    }
    rafRef.current = requestAnimationFrame(draw)
  }, [])

  const start = useCallback(async () => {
    if (!hasSupabase) { setErrorMsg("Voice assistant not configured."); setStatus("error"); return }
    setStatus("connecting"); setErrorMsg("")
    rafRef.current = requestAnimationFrame(draw) // start the orb loop
    try {
      const { data, error } = await supabase.functions.invoke("orty-live-token", { body: {} })
      if (error) throw error
      if (data?.error || !data?.token) throw new Error(data?.error || "No token")

      const AC = window.AudioContext || window.webkitAudioContext
      inCtxRef.current = new AC({ sampleRate: INPUT_RATE })
      outCtxRef.current = new AC({ sampleRate: OUTPUT_RATE })
      // Autoplay policy: a call auto-started on a timer may leave the audio
      // suspended until the visitor interacts. Resume now, and again on the
      // first click/keypress anywhere on the page.
      const resumeAudio = () => {
        inCtxRef.current?.resume?.().catch(() => {})
        outCtxRef.current?.resume?.().catch(() => {})
      }
      resumeAudio()
      const onGesture = () => { resumeAudio(); window.removeEventListener("pointerdown", onGesture); window.removeEventListener("keydown", onGesture) }
      window.addEventListener("pointerdown", onGesture)
      window.addEventListener("keydown", onGesture)
      const outAnalyser = outCtxRef.current.createAnalyser()
      outAnalyser.fftSize = 128
      outAnalyser.connect(outCtxRef.current.destination)
      outAnalyserRef.current = outAnalyser

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } })
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: VOICE_SYSTEM_INSTRUCTION,
          speechConfig: { languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          // Text of both sides, so we can persist a rolling memory across reopens.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: LIVE_TOOLS,
        },
        callbacks: {
          onopen: () => {
            setStatus("live")
            timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
          },
          onmessage: handleMessage,
          onerror: () => { setErrorMsg("Connection error."); setStatus("error") },
          onclose: () => stop(),
        },
      })
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
      inAnalyser.fftSize = 128
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
      setErrorMsg(err?.message || "Could not start voice.")
      setStatus("error")
      stop()
    }
  }, [draw, handleMessage, stop])

  const openCall = () => { setOpen(true); start() }
  const endCall = () => { stop(); setOpen(false); setShowLauncher(true) }

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

  return { open, status, speaking, errorMsg, seconds, showLauncher, canvasRef, start, openCall, endCall }
}
