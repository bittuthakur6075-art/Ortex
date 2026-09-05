import { useCallback, useEffect, useRef, useState } from "react"
import { GoogleGenAI, Modality } from "@google/genai"
import { supabase, hasSupabase } from "../../data/store/supabaseClient"
import { INPUT_RATE, OUTPUT_RATE, floatTo16BitPCM, int16ToBase64, base64ToInt16 } from "./audio"
import { languageMeta } from "../../data/domain/telecallerLanguages"

/* ============================================================
   useLiveCall - a browser practice call with the telecaller agent.

   The console plays the CUSTOMER: the staff member talks into the mic, the
   agent (Gemini Live, same model and token flow as Live Orty on the website)
   answers out loud using the exact brief a phone call would get. Both sides
   are transcribed; on hang-up the transcript goes back to telecaller-dial
   { mode: "record" } and is analysed like any other call.

   Adapted from Ortex.Web/live-orty/useLiveSession.js without the website
   extras (lead capture tool, memory, auto-open).
   ============================================================ */

const LIVE_MODEL = "gemini-3.1-flash-live-preview"
const BARS = 48

const END_TOOL = [{ functionDeclarations: [{ name: "end_call", description: "Hang up once the goodbye has been said." }] }]

export function useLiveCall() {
  const [status, setStatus] = useState("idle") // idle | connecting | live | ended | error
  const [speaking, setSpeaking] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [turns, setTurns] = useState([]) // [{ role: "agent" | "customer", text }]
  const [live, setLive] = useState({ agent: "", customer: "" }) // in-progress partials

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
  const endWantedRef = useRef(false)
  const smoothRef = useRef(new Float32Array(BARS))
  const canvasRef = useRef(null)
  const startedAtRef = useRef("")
  const turnsRef = useRef([])
  const inBufRef = useRef("")
  const outBufRef = useRef("")
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordingRef = useRef(null) // Blob once the recorder has stopped

  const flushTranscript = useCallback(() => {
    const u = inBufRef.current.trim()
    const a = outBufRef.current.trim()
    inBufRef.current = ""
    outBufRef.current = ""
    if (u) turnsRef.current.push({ role: "customer", text: u })
    if (a) turnsRef.current.push({ role: "agent", text: a })
    if (u || a) setTurns([...turnsRef.current])
    setLive({ agent: "", customer: "" })
  }, [])

  const stop = useCallback((finalStatus = "ended") => {
    cancelAnimationFrame(rafRef.current)
    clearInterval(timerRef.current)
    try {
      const rec = recorderRef.current
      if (rec && rec.state !== "inactive") rec.stop() // onstop assembles the blob
    } catch { /* noop */ }
    recorderRef.current = null
    try { procRef.current?.disconnect() } catch { /* noop */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    try { sessionRef.current?.close() } catch { /* noop */ }
    try { inCtxRef.current?.close() } catch { /* noop */ }
    try { outCtxRef.current?.close() } catch { /* noop */ }
    sourcesRef.current = []
    sessionRef.current = procRef.current = streamRef.current = null
    inCtxRef.current = outCtxRef.current = inAnalyserRef.current = outAnalyserRef.current = null
    nextTimeRef.current = 0
    flushTranscript()
    setSpeaking(false)
    setStatus((s) => (s === "idle" ? "idle" : finalStatus))
  }, [flushTranscript])

  useEffect(() => () => stop("idle"), [stop])

  const playChunk = useCallback((int16) => {
    const ctx = outCtxRef.current
    if (!ctx) return
    const float = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float[i] = int16[i] / 0x8000
    const buffer = ctx.createBuffer(1, float.length, OUTPUT_RATE)
    buffer.copyToChannel(float, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(outAnalyserRef.current || ctx.destination)
    const start = Math.max(ctx.currentTime, nextTimeRef.current)
    src.start(start)
    nextTimeRef.current = start + buffer.duration
    setSpeaking(true)
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src)
      if (sourcesRef.current.length === 0) {
        setSpeaking(false)
        if (endWantedRef.current) { endWantedRef.current = false; stop("ended") }
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
    const calls = message?.toolCall?.functionCalls
    if (calls?.length) {
      for (const fc of calls) {
        if (fc.name === "end_call") endWantedRef.current = true
        try { sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { ok: true } }] }) } catch { /* noop */ }
      }
      if (endWantedRef.current && sourcesRef.current.length === 0) {
        window.setTimeout(() => { if (endWantedRef.current) { endWantedRef.current = false; stop("ended") } }, 1200)
      }
    }
    const sc = message?.serverContent
    if (!sc) return
    if (sc.interrupted) clearPlayback()
    if (sc.inputTranscription?.text) { inBufRef.current += sc.inputTranscription.text; setLive((l) => ({ ...l, customer: inBufRef.current })) }
    if (sc.outputTranscription?.text) { outBufRef.current += sc.outputTranscription.text; setLive((l) => ({ ...l, agent: outBufRef.current })) }
    if (sc.turnComplete) flushTranscript()
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) playChunk(base64ToInt16(inline.data))
    }
  }, [clearPlayback, playChunk, stop, flushTranscript])

  // Bar equaliser: the agent's spectrum while speaking, else the mic's.
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth || 400
      const cssH = canvas.clientHeight || 72
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
        const bell = 0.28 + 0.72 * Math.sin(Math.PI * t)
        const target = bins ? (bins[Math.floor((0.04 + t * 0.5) * bins.length)] / 255) * bell : (0.06 + 0.06 * (0.5 + 0.5 * Math.sin(now * 3 + i * 0.5))) * bell
        smooth[i] += (target - smooth[i]) * 0.35
        const barH = Math.max(barW, 3 + smooth[i] * (cssH * 0.9))
        g.fillStyle = speakingNow ? "rgba(59,130,246,0.9)" : "rgba(120,120,140,0.7)"
        g.beginPath()
        g.roundRect(i * step + (step - barW) / 2, mid - barH / 2, barW, barH, barW / 2)
        g.fill()
      }
    }
    rafRef.current = requestAnimationFrame(draw)
  }, [])

  /** brief: { systemPrompt, firstMessage }, language: id from telecallerLanguages.js */
  const start = useCallback(async (brief, language = "auto") => {
    if (!hasSupabase) { setErrorMsg("Backend not configured."); setStatus("error"); return }
    setStatus("connecting"); setErrorMsg("")
    setTurns([]); turnsRef.current = []; inBufRef.current = ""; outBufRef.current = ""
    setSeconds(0)
    startedAtRef.current = new Date().toISOString()
    rafRef.current = requestAnimationFrame(draw)
    try {
      const { data, error } = await supabase.functions.invoke("orty-live-token", { body: {} })
      if (error) throw error
      if (data?.error || !data?.token) throw new Error(data?.error || "No token")

      const AC = window.AudioContext || window.webkitAudioContext
      inCtxRef.current = new AC({ sampleRate: INPUT_RATE })
      outCtxRef.current = new AC({ sampleRate: OUTPUT_RATE })
      inCtxRef.current.resume?.().catch(() => {})
      outCtxRef.current.resume?.().catch(() => {})
      const outAnalyser = outCtxRef.current.createAnalyser()
      outAnalyser.fftSize = 128
      outAnalyser.connect(outCtxRef.current.destination)
      outAnalyserRef.current = outAnalyser

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Record both sides: the agent's playback (via the analyser) and the mic,
      // mixed in the output context so one Opus file holds the whole call.
      try {
        const mix = outCtxRef.current.createMediaStreamDestination()
        outAnalyser.connect(mix)
        outCtxRef.current.createMediaStreamSource(stream).connect(mix)
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((m) => window.MediaRecorder?.isTypeSupported?.(m))
        if (mime) {
          chunksRef.current = []
          recordingRef.current = null
          const rec = new MediaRecorder(mix.stream, { mimeType: mime, audioBitsPerSecond: 48000 })
          rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data) }
          rec.onstop = () => { recordingRef.current = new Blob(chunksRef.current, { type: mime.split(";")[0] }) }
          rec.start(1000)
          recorderRef.current = rec
        }
      } catch (e) { console.warn("recording unavailable:", e) }

      const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } })
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `${brief.systemPrompt}\n\n# VOICE CALL MECHANICS\n- You placed this call; the other person just picked up. Speak your opening line first.\n- When the conversation is over, say a short goodbye and then call the end_call function.`,
          speechConfig: { languageCode: languageMeta(language).speech, voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: END_TOOL,
        },
        callbacks: {
          onopen: () => {
            setStatus("live")
            timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
          },
          onmessage: handleMessage,
          onerror: () => { setErrorMsg("Connection error."); setStatus("error") },
          onclose: () => stop("ended"),
        },
      })
      sessionRef.current = session
      try {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: brief.firstMessage.startsWith("[") ? `[The customer has just answered the phone. ${brief.firstMessage.slice(1)}` : `[The customer has just answered the phone. Open the call now with: "${brief.firstMessage}"]` }] }],
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
        if (!sessionRef.current) return
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
      console.error("Practice call failed:", err)
      setErrorMsg(err?.message || "Could not start the call.")
      setStatus("error")
      stop("error")
    }
  }, [draw, handleMessage, stop])

  const hangUp = useCallback(() => stop("ended"), [stop])
  /** The recorded call as a Blob (resolves once the recorder has flushed), or null. */
  const getRecording = useCallback(() => new Promise((resolve) => {
    const tick = (n) => {
      if (recordingRef.current || n > 20) return resolve(recordingRef.current)
      window.setTimeout(() => tick(n + 1), 100)
    }
    tick(0)
  }), [])
  const reset = useCallback(() => { stop("idle"); setStatus("idle"); setTurns([]); turnsRef.current = []; setSeconds(0); setErrorMsg("") }, [stop])

  return {
    status, speaking, errorMsg, seconds, turns, live, canvasRef,
    startedAt: startedAtRef.current,
    start, hangUp, reset, getRecording,
  }
}
