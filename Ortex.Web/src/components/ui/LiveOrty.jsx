import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Microphone2, MicrophoneSlash, CloseCircle } from "iconsax-react"
import { GoogleGenAI, Modality } from "@google/genai"
import { supabase, hasSupabase } from "../../lib/supabaseClient"

/* ============================================================
   Live Orty — realtime VOICE assistant (Gemini Live API)

   Gemini-style audio UI: a horizontal waveform that reacts to real voice
   frequencies (yours while listening, Orty's while speaking), live captions,
   a call timer, and mute / end controls, in a 600x600 squircle panel docked
   at the centre-bottom of the screen.

   Flow: ephemeral token (orty-live-token Edge Function) → Live WebSocket →
   stream mic as 16 kHz PCM, play Orty's 24 kHz PCM voice back.
   ============================================================ */

const LIVE_MODEL = "gemini-3.1-flash-live-preview"
const INPUT_RATE = 16000
const OUTPUT_RATE = 24000
const BARS = 54

const VOICE_SYSTEM_INSTRUCTION = `You are "Dimple", the friendly voice of Ortex Industries — a New Delhi manufacturer of customized products (MDF, acrylic, keychains, lanyards, badges, wall clocks, fridge magnets, corporate gifts, flags, and promotional merch). Everything is made to order, in-house, with free digital mockups.

You are speaking OUT LOUD on a call, so:
- LANGUAGE: ALWAYS speak in Hindi — warm, natural, conversational Indian Hindi (the way people actually talk). Keep product names and common business terms in English (Hinglish is perfect). Greet in Hindi and stay in Hindi, unless the customer clearly speaks English and prefers it.
- Keep answers short and conversational — one or two sentences. Never read out lists, markdown, URLs, or long paragraphs.
- Be warm, human, and genuinely helpful — a top sales consultant and support expert in one. React naturally ("Great choice!", "Got it").

Your job: understand the need, recommend the right product, answer every question, and move them toward a quote or a chat with sales.
- Ask one qualifying question at a time (what product, how many, when, do they have a logo).
- Mention the free digital mockup and that pricing is factory-direct on quote (never invent exact prices; volume discounts: 300+ units 10% off, 1000+ 20%, 5000+ 30%).
- Low minimums (lanyards 100, most items 25-100) — reassure "we can usually work with you".
- To close: ask for their name and WhatsApp number so the team can send a free mockup and exact pricing.
- Only discuss Ortex, its products, ordering, and support. Politely steer anything else back.
- Never invent prices, delivery promises, or products Ortex does not make.

Open the call with a short, warm greeting IN HINDI and ask how you can help.`

// ---- PCM helpers ----------------------------------------------------------
function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
function int16ToBase64(int16) {
  let binary = ""
  const bytes = new Uint8Array(int16.buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  return btoa(binary)
}
function base64ToInt16(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

export default function LiveOrty() {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState("idle") // idle | connecting | live | error
  const [speaking, setSpeaking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")
  const [seconds, setSeconds] = useState(0)
  const [caption, setCaption] = useState({ you: "", orty: "" })

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
  const turnDoneRef = useRef({ you: false, orty: false })
  const canvasRef = useRef(null)
  const smoothRef = useRef(new Float32Array(BARS))

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
    setCaption({ you: "", orty: "" })
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
      if (sourcesRef.current.length === 0) setSpeaking(false)
    }
    sourcesRef.current.push(src)
  }, [])

  const clearPlayback = useCallback(() => {
    sourcesRef.current.forEach((s) => { try { s.stop() } catch { /* noop */ } })
    sourcesRef.current = []
    nextTimeRef.current = 0
    setSpeaking(false)
  }, [])

  const handleMessage = useCallback((message) => {
    const sc = message?.serverContent
    if (!sc) return
    if (sc.interrupted) clearPlayback()
    if (sc.inputTranscription?.text) {
      const t = sc.inputTranscription.text
      setCaption((c) => ({ you: turnDoneRef.current.you ? t : c.you + t, orty: turnDoneRef.current.you ? "" : c.orty }))
      turnDoneRef.current = { you: false, orty: false }
    }
    if (sc.outputTranscription?.text) {
      const t = sc.outputTranscription.text
      setCaption((c) => ({ ...c, orty: turnDoneRef.current.orty ? t : c.orty + t }))
      turnDoneRef.current.orty = false
    }
    if (sc.turnComplete) turnDoneRef.current = { you: true, orty: true }
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) {
        playChunk(base64ToInt16(inline.data))
      }
    }
  }, [clearPlayback, playChunk])

  // rAF: draw a Siri-style flowing wave — layered, colour-mixing sine curves
  // whose amplitude reacts to the live voice (Orty's while speaking, else mic).
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas) {
      const dpr = window.devicePixelRatio || 1
      const cssW = canvas.clientWidth || 420
      const cssH = canvas.clientHeight || 72
      if (canvas.width !== Math.round(cssW * dpr)) { canvas.width = cssW * dpr; canvas.height = cssH * dpr }
      const g = canvas.getContext("2d")
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, cssW, cssH)

      // Overall energy from the active analyser (average magnitude), smoothed.
      const speakingNow = sourcesRef.current.length > 0
      const analyser = speakingNow ? outAnalyserRef.current : inAnalyserRef.current
      let raw = 0
      let bins = null
      if (analyser) {
        bins = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(bins)
        let sum = 0
        for (let i = 0; i < bins.length; i++) sum += bins[i]
        raw = sum / bins.length / 255
      }
      const sm = smoothRef.current
      // Fast attack, gentle release → lively but smooth.
      const targetE = Math.min(1, raw * 2.0)
      sm[0] += (targetE - sm[0]) * (targetE > sm[0] ? 0.4 : 0.12)
      const energy = sm[0]

      const now = performance.now() / 1000
      const mid = cssH / 2
      const maxAmp = cssH * 0.46

      // Layered waves — additive blending + glow makes the colours mix and shimmer.
      const waves = [
        { c: "rgba(90,190,255,0.90)", f: 1.2, s: 1.0, a: 1.0, p: 0.0, w: 2.8 },
        { c: "rgba(160,120,255,0.85)", f: 1.9, s: -1.4, a: 0.85, p: 1.2, w: 2.3 },
        { c: "rgba(255,95,190,0.80)", f: 1.6, s: 1.8, a: 0.66, p: 2.4, w: 2.0 },
        { c: "rgba(80,255,215,0.70)", f: 2.5, s: -2.2, a: 0.5, p: 3.3, w: 1.7 },
      ]
      g.globalCompositeOperation = "lighter"
      g.lineCap = "round"
      g.lineJoin = "round"
      for (const wv of waves) {
        g.beginPath()
        for (let x = 0; x <= cssW; x += 2) {
          const t = x / cssW
          const env = Math.pow(Math.sin(Math.PI * t), 1.5) // taper at the edges
          // Sound-reactive: sample the live spectrum along the width so the wave
          // bumps where there is actual energy.
          const spec = bins ? bins[Math.floor((0.03 + t * 0.6) * bins.length)] / 255 : 0
          const amp = maxAmp * wv.a * env * (0.1 + energy * 0.85 + spec * 0.6)
          const y = mid + Math.sin(t * Math.PI * 2 * wv.f + now * wv.s + wv.p) * amp
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y)
        }
        g.strokeStyle = wv.c
        g.lineWidth = wv.w
        g.shadowBlur = 10 + energy * 16
        g.shadowColor = wv.c
        g.stroke()
      }
      g.shadowBlur = 0
      g.globalCompositeOperation = "source-over"
    }
    rafRef.current = requestAnimationFrame(draw)
  }, [])

  const start = useCallback(async () => {
    if (!hasSupabase) { setErrorMsg("Voice assistant not configured."); setStatus("error"); return }
    setStatus("connecting"); setErrorMsg(""); setCaption({ you: "", orty: "" })
    rafRef.current = requestAnimationFrame(draw) // idle ripple while connecting
    try {
      const { data, error } = await supabase.functions.invoke("orty-live-token", { body: {} })
      if (error) throw error
      if (data?.error || !data?.token) throw new Error(data?.error || "No token")

      const AC = window.AudioContext || window.webkitAudioContext
      inCtxRef.current = new AC({ sampleRate: INPUT_RATE })
      outCtxRef.current = new AC({ sampleRate: OUTPUT_RATE })
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
          speechConfig: { languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
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
      // Orty greets first, before the visitor says anything.
      try {
        session.sendClientContent({
          turns: [{ role: "user", parts: [{ text: "The customer just joined the voice call. Greet them warmly IN HINDI in one short, friendly sentence and ask how you can help — for example: 'Namaste! Main hoon Dimple, Ortex se. Bataiye, main aapki kaise madad karoon?'" }] }],
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
  const endCall = () => { stop(); setOpen(false) }
  const toggleMute = () => { const m = !muted; setMuted(m); mutedRef.current = m }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  const statusLabel =
    status === "connecting" ? "Connecting…" :
    status === "error" ? (errorMsg || "Something went wrong") :
    muted ? "Muted" :
    speaking ? "Dimple is speaking" : "Listening…"

  return (
    <>
      {/* Launcher */}
      <button
        onClick={openCall}
        aria-label="Talk to Dimple by voice"
        className="fixed right-6 bottom-24 z-40 inline-flex items-center gap-2.5 h-12 pl-2.5 pr-4 rounded-full bg-foreground text-background font-semibold shadow-[0_10px_30px_rgba(0,0,0,0.25)] hover:brightness-110 transition-all active:scale-95"
      >
        <span className="grid place-items-center w-8 h-8 rounded-full bg-white/15"><Microphone2 size={18} variant="Bulk" color="currentColor" /></span>
        Talk to Dimple
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-6"
          >
            <div className="absolute inset-0 bg-black/40" onClick={endCall} aria-hidden="true" />

            {/* Panel — 500x300 squircle, 60% black, docked centre-bottom */}
            <motion.div
              role="dialog"
              aria-label="Live voice call with Dimple"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.98 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex flex-col overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
              style={{ width: 600, height: 400, maxWidth: "95vw", maxHeight: "88vh", borderRadius: 50, cornerShape: "squircle", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)" }}
            >
              {/* Top: Orty identity + close */}
              <div className="flex items-center justify-between px-5 pt-4">
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-md">
                    <Microphone2 size={22} variant="Bulk" color="currentColor" />
                  </span>
                  <div className="leading-tight">
                    <p className="text-white text-[18px] font-medium">Hi, I'm Dimple</p>
                    <p className="text-white/50 text-[16px]">Here to help you design</p>
                  </div>
                </div>
                <button onClick={endCall} aria-label="Close" className="grid place-items-center w-8 h-8 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition">
                  <CloseCircle size={22} variant="Bulk" color="currentColor" />
                </button>
              </div>

              {/* Waveform + status + caption bubble */}
              <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-6">
                <canvas ref={canvasRef} className="w-[520px] max-w-[92%] h-[96px]" />
                <div className="flex items-center gap-1.5 text-white/45 text-xs uppercase tracking-wide">
                  {status === "live" && (
                    <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-indigo-400" : "bg-emerald-400"} animate-pulse`} />
                  )}
                  <span>{status === "live" ? `${mmss} · ` : ""}{statusLabel}</span>
                </div>
                <div className="min-h-[46px] max-w-[90%] flex items-center justify-center">
                  {caption.orty ? (
                    <p className="px-4 py-2 rounded-2xl bg-white/[0.09] text-white text-[15px] leading-snug font-medium text-center line-clamp-2">{caption.orty}</p>
                  ) : status === "live" ? (
                    <p className="text-white/35 text-xs text-center">Say hello — ask about products, pricing, or how to order.</p>
                  ) : null}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3.5 pb-6">
                <button
                  onClick={toggleMute}
                  disabled={status !== "live"}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className={`grid place-items-center w-12 h-12 rounded-full transition ${muted ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"} disabled:opacity-40`}
                >
                  {muted ? <MicrophoneSlash size={22} variant="Bulk" color="currentColor" /> : <Microphone2 size={22} variant="Bulk" color="currentColor" />}
                </button>
                <button
                  onClick={endCall}
                  aria-label="End chat"
                  className="h-12 px-7 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 transition shadow-lg active:scale-95"
                >
                  End chat
                </button>
              </div>

              {status === "error" && (
                <button onClick={start} className="absolute bottom-20 left-1/2 -translate-x-1/2 text-sm text-white/70 underline hover:text-white">Retry</button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
