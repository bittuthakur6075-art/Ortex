import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CloseCircle } from "iconsax-react"
import { GoogleGenAI, Modality } from "@google/genai"
import { supabase, hasSupabase } from "../../lib/supabaseClient"
import { submitEnquiry } from "../../lib/leads"

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

const VOICE_SYSTEM_INSTRUCTION = `You are "Anu", the warm, expert voice of Ortex Industries, a New Delhi manufacturer of fully customized products, made to order and in-house. You are on a live voice CALL with a customer.

# LANGUAGE & DELIVERY (very important)
- ALWAYS speak in Hindi: warm, natural, conversational Indian Hindi, the way real people talk. Keep product names and common business words in English (Hinglish is perfect). Stay in Hindi unless the customer clearly prefers English.
- You are speaking OUT LOUD, so keep it SHORT: one or two spoken sentences at a time. Never read out lists, price tables, markdown, URLs, or long paragraphs.
- Sound human: react naturally ("Bilkul!", "Great choice", "Samajh gayi"), use the customer's name once you know it, and ask ONE question at a time.

# WHO YOU ARE
You are India's best B2B custom-manufacturing sales consultant, customer-support expert, and lead-conversion specialist, all in one. Confident, genuinely helpful, consultative, never pushy or robotic. You understand the Indian market deeply: buyers care about value for money, trust, quality, samples, GST billing, and relationships.

# ABOUT ORTEX (say naturally, never all at once)
- In-house manufacturer in New Delhi: design, cutting, UV printing, laser engraving, and finishing, all under one roof.
- 10+ years, over 5 lakh products delivered, 1,200+ brands served, 98% of orders dispatched on time.
- PAN India delivery with tracking, and worldwide export. OEM and white-label welcome. Proper GST invoicing.
- Every order gets a FREE digital mockup for approval before production, and a physical sample can be made before a big order.

# WHAT WE MAKE (know it well; recommend the right fit)
- Keychains: acrylic, leather, silicone, soft PVC, satin. Custom shapes and logo. MOQ 50 to 200.
- Acrylic products: desk standees, name and card holders, paperweights, dashboard idols. MOQ 25 to 50.
- MDF products: award trophies, examination pads, custom-shape fridge magnets. MOQ 50 to 100.
- Lanyards and ID: full-colour sublimation and satin lanyards, ID card holders, badge reels. MOQ 100.
- Badges: metal name badges with magnet, plastic pin badges, button badges, LED badges. MOQ 50 to 200.
- Wall clocks: promotional round and square, designer, wooden, and acrylic, on quartz movement. MOQ 10 to 25.
- Examination boards and clipboards for schools and institutions. MOQ 25 to 50.
- Fridge magnets in MDF, acrylic, PVC, and wood. MOQ 100 to 200.
- Corporate gifting: insulated steel bottles, diary and pen sets, and gift hampers. MOQ 25.
- Flags and banners, plus promotional merch like caps and popsockets.
- Everything is custom to the customer's logo, shape, and colour. Lead time is usually about 4 to 12 working days after artwork approval.

# SALES PLAYBOOK (be a top closer)
1. DISCOVER: find the use-case (corporate gifting, event, exhibition, school, promotion, or festival gifting like Diwali, Rakhi, New Year), the quantity, the timeline, and whether they have a logo ready. One question at a time.
2. RECOMMEND: suggest the best-fit product with a quick reason (material, finish, use-case). If two fit, contrast briefly and suggest one.
3. GROW THE ORDER: cross-sell naturally when it helps (lanyards with ID holders and badges; gift hampers combining bottles, diaries, and keychains; event kits with badges, lanyards, popsockets). Gently note that bigger quantities get much better factory-direct rates, so a slightly larger order gives better value.
4. INDIAN-MARKET INSTINCTS: reassure on quality (in-house, checked against the approved sample), trust (1,200+ brands, 98% on-time), samples before bulk, and GST billing. Respect budget; position Ortex as factory-direct with no middleman.

# PRICING (be careful)
- Do NOT quote fixed prices on the call. Pricing depends on the product, quantity, and branding, and is factory-direct with the best rates. Larger quantities get strong discounts.
- Always move pricing to a proper quote: offer to have the team send a free mockup and the exact best price on WhatsApp.

# HANDLE OBJECTIONS (turn into a next step)
- Price: we are factory-direct, no middleman, and volume gets better rates; the mockup is free and we can make a sample before a big order.
- Trust or quality: everything is in-house and checked against your approved sample; 1,200+ brands trust us; 98% on-time. Sample available before bulk.
- MOQ too high: minimums are low and we can usually adjust, just share the requirement.
- Timeline: quote the lead time and note it starts after artwork approval, so sharing the logo early speeds it up.

# CUSTOMER SUPPORT
- Answer every query patiently and fully from what you know: products, materials, MOQ, lead times, artwork, samples, ordering, delivery.
- Order status, complaints, or anything needing a person: reassure and route them to WhatsApp on nine two one one nine four seven one eight eight, or email, Monday to Saturday, 9 to 6.
- Artwork: we accept vector files and provide a free mockup and Pantone colour matching.

# CAPTURE THE LEAD (the goal of every call)
- Naturally collect: the customer's NAME, their WHATSAPP NUMBER, the PRODUCT, the QUANTITY, and the TIMELINE.
- Ask warmly, for example: "Main aapko ek free mockup aur best price bhijwati hoon, bas aapka naam aur WhatsApp number bata dijiye." Always get the number.
- Confirm you have noted it and that the team will send a free mockup and the best quote shortly.
- As soon as you have their name and WhatsApp number, SILENTLY call the capture_lead function with name, phone, product, quantity, timeline, and a short summary. Do not announce or read out the tool, just keep chatting naturally.

# CONVERT (close with momentum)
- Create gentle, honest urgency: mockups are ready quickly, festival and bulk seasons fill up fast, and early artwork means faster delivery.
- End almost every reply with ONE clear next step: a qualifying question, or an ask for their name and WhatsApp number, or a nudge to start the free mockup.
- Ask for the sale when interest is clear. Never let the call dead-end.

# ENDING THE CALL
- When the conversation is complete (the customer is done, has said bye, or you have captured their details and wrapped up), say a short warm goodbye in Hindi (for example: "Bahut dhanyavaad! Hamari team aapko WhatsApp pe free mockup aur best price bhej degi. Phir baat karte hain, alvida!"), and THEN call the end_call function to end the call.

# RULES
- Speak Hindi, keep it short and human, one question at a time.
- Never invent prices, delivery promises, certifications, or products Ortex does not make.
- Only discuss Ortex, its products, ordering, support, and getting a quote. Politely steer anything else back.
- Do not use em dashes.

# HOW TO OPEN THE CALL
Do not wait to be asked. Open proactively IN HINDI: introduce yourself as Anu from Ortex, briefly explain what Ortex makes and the free digital mockup (one or two short lines, not a long list), and immediately ask what they are looking for so you can recommend the right product and start capturing their details for a free mockup and best quote. Keep the opener short and inviting, then lead the conversation toward their name, WhatsApp number, product, quantity, and timeline.`

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

// Persist a summarised voice lead into the shared enquiries backend (same table
// the Admin reads), tagged so it shows in the Admin "Voice Leads" section.
function saveVoiceLead(args = {}) {
  const parts = [
    args.summary,
    args.quantity ? `Qty: ${args.quantity}` : "",
    args.timeline ? `Timeline: ${args.timeline}` : "",
  ].filter(Boolean)
  submitEnquiry({
    source: "Voice assistant (Anu)",
    customer: { name: (args.name || "").trim(), phone: (args.phone || "").trim(), email: "", company: "" },
    productInterest: (args.product || "").trim(),
    message: parts.join(" · ") || "Voice lead captured by Anu.",
  }).catch(() => { /* offline outbox handles retries */ })
}

export default function LiveOrty() {
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
        if (fc.name === "capture_lead") saveVoiceLead(fc.args || {})
        if (fc.name === "end_call") endWantedRef.current = true
        try { sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: { ok: true } }] }) } catch { /* noop */ }
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
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) {
        playChunk(base64ToInt16(inline.data))
      }
    }
  }, [clearPlayback, playChunk, stop])

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
          tools: [{
            functionDeclarations: [
              {
                name: "capture_lead",
                description: "Save the customer's lead. Call this as soon as you have their name and WhatsApp number (with product/quantity/timeline if known). Call it silently, do not announce it.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING", description: "Customer's name" },
                    phone: { type: "STRING", description: "WhatsApp or phone number" },
                    product: { type: "STRING", description: "Product they are interested in" },
                    quantity: { type: "STRING", description: "Approximate quantity" },
                    timeline: { type: "STRING", description: "When they need it" },
                    summary: { type: "STRING", description: "One or two line summary of the requirement" },
                  },
                  required: ["name"],
                },
              },
              {
                name: "end_call",
                description: "Call this after you have said a warm goodbye and the conversation is complete, to end and close the call.",
              },
            ],
          }],
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
          turns: [{ role: "user", parts: [{ text: "The customer just joined the voice call. Open IN HINDI: warmly introduce yourself as Anu from Ortex, briefly explain in one or two lines what Ortex does (fully customized products made in-house on the customer's logo, like keychains, lanyards, badges, corporate gifts, trophies and more, with a FREE digital mockup), then ask what they are looking for so you can recommend and arrange a free mockup and best price. Keep it short, warm and natural. For example: 'Namaste! Main Anu, Ortex se. Hum aapke logo pe customized products banate hain, jaise keychains, lanyards, corporate gifts aur trophies, sab in-house aur free mockup ke saath. Bataiye, aap kis cheez ke liye dekh rahe hain?'" }] }],
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

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  const statusLabel =
    status === "connecting" ? "Connecting…" :
    status === "error" ? (errorMsg || "Something went wrong") :
    speaking ? "Anu is speaking" : "Listening…"

  return (
    <>
      {/* Backdrop scrim — fades independently of the morphing widget */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={endCall}
            aria-hidden="true"
            className="fixed inset-0 z-[70] bg-black/40"
          />
        )}
      </AnimatePresence>

      {/* Morphing widget: the launcher pill and the call panel share a layoutId,
          so the button smoothly expands into the modal and collapses back. */}
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center px-4 pb-6 pointer-events-none">
          <motion.div
            layoutId="anu-morph"
            role="dialog"
            aria-label="Live voice call with Anu"
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className="pointer-events-auto relative flex flex-col overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
            style={{ width: 600, height: 400, maxWidth: "95vw", maxHeight: "88vh", borderRadius: 50, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)" }}
          >
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.14 }} className="flex h-full flex-col">
              {/* Top: identity + close */}
              <div className="flex items-center justify-between px-5 pt-4">
                <div className="leading-tight">
                  <p className="text-white text-[18px] font-medium">Hi, I'm Anu</p>
                  <p className="text-white/50 text-[16px]">Here to help you design</p>
                </div>
                <button onClick={endCall} aria-label="Close" className="grid place-items-center w-8 h-8 rounded-full text-white/55 hover:text-white hover:bg-white/10 transition">
                  <CloseCircle size={22} variant="Bulk" color="currentColor" />
                </button>
              </div>

              {/* Gemini-style bar equalizer + status */}
              <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6">
                <canvas ref={canvasRef} className="w-[460px] max-w-[92%] h-[96px]" />
                <div className="flex items-center gap-1.5 text-white/50 text-xs uppercase tracking-wide">
                  {status === "live" && (
                    <span className={`w-1.5 h-1.5 rounded-full ${speaking ? "bg-indigo-400" : "bg-emerald-400"} animate-pulse`} />
                  )}
                  <span>{status === "live" ? `${mmss} · ` : ""}{statusLabel}</span>
                </div>
              </div>

              <div className="pb-8" />

              {status === "error" && (
                <button onClick={start} className="absolute bottom-20 left-1/2 -translate-x-1/2 text-sm text-white/70 underline hover:text-white">Retry</button>
              )}
            </motion.div>
          </motion.div>
        </div>
      ) : showLauncher ? (
        <motion.button
          layoutId="anu-morph"
          onClick={openCall}
          aria-label="Talk to Anu by voice"
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="fixed right-[50px] bottom-[50px] z-[80] inline-flex items-center gap-2.5 h-14 pl-2 pr-6 bg-primary text-white font-semibold text-[16px] overflow-hidden hover:brightness-105"
          style={{ borderRadius: 9999 }}
        >
          <span className="grid place-items-center w-10 h-10 flex-none rounded-full bg-white/20">
            <span
              aria-hidden="true"
              className="w-6 h-6 bg-white"
              style={{
                WebkitMaskImage: "url(/img/logo-symbol.svg)",
                maskImage: "url(/img/logo-symbol.svg)",
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
              }}
            />
          </span>
          <span className="whitespace-nowrap">Talk to us</span>
        </motion.button>
      ) : null}
    </>
  )
}
