import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { GoogleGenAI, Modality } from "@google/genai"
import { supabase, hasSupabase } from "../../data/store/supabaseClient"
import { repo } from "../../data/store/repository"
import { canAccess } from "../../data/domain/modules"
import { ENQUIRY_STATUS } from "../../data/domain/schema"
import { INPUT_RATE, OUTPUT_RATE, floatTo16BitPCM, int16ToBase64, base64ToInt16 } from "../../pages/telecaller/audio"
import { voiceCallsFrom } from "../../pages/voice-leads/helpers"
import { cardFor, draftLines, findCustomers, routeFor } from "../../lib/anu"
import { accessFor, denied, runReadTool } from "./readTools"
import { staffInstruction } from "./prompt"
import { ANU_TOOLS } from "./tools"

/* ============================================================
   useAnuSession: one conversation with Anu in the console.

   The console port of Ortex.Mobile/src/features/anu/useAnuSession.ts. The
   phone needs an invisible WebView to reach the Live protocol; a browser does
   not, so this speaks Gemini Live through @google/genai exactly as the
   telecaller's practice call does (pages/telecaller/useLiveCall.js).

   What is different on a desk:
   · It lives in the LAYOUT, not a page, so the conversation survives route
     changes. Opening a record or a draft navigates the console and the call
     carries on beside it (the phone has to hang up to show a screen).
   · The person can TYPE into the live session as well as speak, for an open
     office where talking to a laptop is not an option.
   · A write Anu proposes appears as a card with Confirm and Cancel, so a yes
     can be a click. A click is reported back to her as text.

   ACCESS IS CHECKED TWICE, deliberately: `canAccess` here turns a question
   about a module the person lacks into a plain "not in your access" for Anu to
   say, and RLS underneath means a check forgotten here still returns nothing.
   ============================================================ */

const LIVE_MODEL = "gemini-3.1-flash-live-preview"
/** The model's end-of-speech wait. A colleague asking a quick question should not sit through a pause. */
const SILENCE_MS = 550
/** How long a goodbye may keep playing before the call is closed regardless. */
const GOODBYE_GRACE_MS = 6000

const ERROR_TEXT = {
  "mic-denied": "Anu needs the microphone. Allow it for this site in the browser's address bar, then try again.",
  "mic-failed": "Could not open the microphone. Another app may be using it.",
  network: "Lost the connection to Anu. Check your internet and try again.",
  token: "Anu could not start. Check your connection and try again.",
  backend: "Anu needs the Supabase backend, which is not configured here.",
}

/** A short-lived Live token. The staff-only function first, then the website's while it is not deployed. */
async function mintToken() {
  for (const fn of ["anu-staff-token", "orty-live-token"]) {
    const { data, error } = await supabase.functions.invoke(fn, { body: {} })
    if (!error && data?.token) return data.token
    const status = error?.context?.status
    // Fall through ONLY when the staff function is not deployed yet. A refusal
    // (401/403) from it is an answer, not a reason to try the public one.
    if (fn === "anu-staff-token" && (status === 404 || /failed to send a request/i.test(error?.message || ""))) continue
    throw new Error("token")
  }
  throw new Error("token")
}

const levelOf = (analyser, buf) => {
  if (!analyser) return 0
  analyser.getByteTimeDomainData(buf)
  let sum = 0
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128
    sum += v * v
  }
  return Math.min(1, Math.sqrt(sum / buf.length) * 4)
}

// What a tool call looked like, in the words the transcript shows.
function activityLabel(name, args) {
  const q = args.query ? ` for "${args.query}"` : ""
  switch (name) {
    case "get_briefing": return "Checked today's briefing"
    case "find_customers": return `Searched customers${q}`
    case "find_enquiries": return `Searched leads${q}${args.status ? `, ${args.status}` : ""}${args.days ? `, last ${args.days} days` : ""}`
    case "find_quotations": return `Searched quotations${q}${args.status ? `, ${args.status}` : ""}`
    case "get_quotation": return "Opened a quotation's details"
    case "find_products": return `Searched the catalogue${q}`
    case "sales_summary": return `Summarised the last ${args.days || 30} days`
    case "set_enquiry_status": return args.confirmed === true ? "Updated a lead's status" : "Proposed a status change"
    case "start_quotation": return args.confirmed === true ? "Started a draft quotation" : "Proposed a draft quotation"
    case "open_record": return "Opened a record"
    default: return ""
  }
}

export function useAnuSession({ profile, navigate }) {
  const [status, setStatus] = useState("idle") // idle | connecting | live | ended | error
  const [error, setError] = useState("")
  const [speaking, setSpeaking] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [muted, setMuted] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [turns, setTurns] = useState([]) // { id, role: user|anu|tool, text, typed?, cards?, stats? }
  const [partial, setPartial] = useState({ user: "", anu: "" })
  const [pendingAction, setPendingAction] = useState(null) // { name, args, title, detail }

  const sessionRef = useRef(null)
  const inCtxRef = useRef(null)
  const outCtxRef = useRef(null)
  const streamRef = useRef(null)
  const procRef = useRef(null)
  const inAnalyserRef = useRef(null)
  const outAnalyserRef = useRef(null)
  const sourcesRef = useRef([])
  const nextTimeRef = useRef(0)
  const timerRef = useRef(0)
  const endWantedRef = useRef(false)
  const endTimerRef = useRef(0)
  const statusRef = useRef("idle")
  const mutedRef = useRef(false)
  const inBufRef = useRef("")
  const outBufRef = useRef("")
  const idRef = useRef(0)
  const cardsRef = useRef(new Map()) // every record surfaced this conversation, by key
  const levelBuf = useRef(new Uint8Array(256))

  const access = useMemo(() => accessFor(canAccess, profile), [profile])
  const accessRef = useRef(access)
  accessRef.current = access
  const profileRef = useRef(profile)
  profileRef.current = profile

  const setStat = (s) => { statusRef.current = s; setStatus(s) }
  const push = (turn) => setTurns((prev) => [...prev, { id: ++idRef.current, ...turn }].slice(-80))
  const firstName = () => (profileRef.current?.name || "").trim().split(/\s+/)[0] || "The person"

  /** Live levels for the face's ring, read on its own animation frame (never a re-render). */
  const readLevel = useCallback(() => {
    const speakingNow = sourcesRef.current.length > 0
    return {
      speaking: speakingNow,
      level: speakingNow ? levelOf(outAnalyserRef.current, levelBuf.current) : mutedRef.current ? 0 : levelOf(inAnalyserRef.current, levelBuf.current),
    }
  }, [])

  const flush = useCallback(() => {
    const u = inBufRef.current.trim()
    const a = outBufRef.current.trim()
    inBufRef.current = ""
    outBufRef.current = ""
    if (u) push({ role: "user", text: u })
    if (a) push({ role: "anu", text: a })
    setPartial({ user: "", anu: "" })
  }, [])

  const stop = useCallback((finalStatus = "ended") => {
    clearInterval(timerRef.current)
    clearTimeout(endTimerRef.current)
    endWantedRef.current = false
    try { procRef.current?.disconnect() } catch { /* noop */ }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()) } catch { /* noop */ }
    const session = sessionRef.current
    sessionRef.current = null
    try { session?.close() } catch { /* noop */ }
    try { inCtxRef.current?.close() } catch { /* noop */ }
    try { outCtxRef.current?.close() } catch { /* noop */ }
    sourcesRef.current = []
    procRef.current = streamRef.current = null
    inCtxRef.current = outCtxRef.current = inAnalyserRef.current = outAnalyserRef.current = null
    nextTimeRef.current = 0
    flush()
    setSpeaking(false)
    setThinking(false)
    setPendingAction(null)
    if (statusRef.current !== "idle" && statusRef.current !== "error") setStat(finalStatus)
  }, [flush])

  // Leaving the console (sign out, closing the tab) never leaves a mic open.
  useEffect(() => () => stop("idle"), [stop])

  useEffect(() => {
    const onUnload = () => stop("ended")
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [stop])

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
    // A small lead on the first chunk of a reply keeps it from underrunning.
    const start = Math.max(ctx.currentTime + (sourcesRef.current.length ? 0 : 0.08), nextTimeRef.current)
    src.start(start)
    nextTimeRef.current = start + buffer.duration
    setSpeaking(true)
    setThinking(false)
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src)
      if (sourcesRef.current.length === 0) {
        setSpeaking(false)
        // The goodbye has finished playing: now it is safe to hang up.
        if (endWantedRef.current) window.setTimeout(() => endWantedRef.current && !sourcesRef.current.length && stop("ended"), 400)
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

  const rows = (name) => repo.list(name)

  const surface = (results) => {
    const list = (Array.isArray(results) ? results : [results]).filter(Boolean)
    const cards = list.map(cardFor).filter(Boolean)
    for (const c of cards) cardsRef.current.set(c.key, c)
    return cards
  }

  const go = (kind, id) => {
    const target = routeFor(kind, id)
    if (target) navigate(target.to, target.state ? { state: target.state } : undefined)
  }

  // Runs one tool. Returns [response for Anu, cards to show under the step].
  const runTool = async (name, args) => {
    const a = accessRef.current
    const now = Date.now()
    switch (name) {
      case "set_enquiry_status": {
        const kind = String(args.kind)
        if (kind === "voice_call" ? !a.voice : !a.enquiries) return [denied(kind === "voice_call" ? "Voice calls" : "Enquiries")]
        const label = ENQUIRY_STATUS.find((s) => s.id === String(args.status))?.label
        if (!label) return [{ ok: false, error: "Unknown status." }]
        const record = cardsRef.current.get(`${kind}:${args.id}`)
        if (args.confirmed !== true) {
          setPendingAction({
            name, args,
            title: `Mark as ${label}`,
            detail: record ? `${record.title}${record.subtitle ? ` · ${record.subtitle}` : ""}` : kind === "voice_call" ? "An Anu call" : "An enquiry",
          })
          return [{ ok: false, needs_confirmation: true, next: "Read the change back and ask for a yes, then call again with confirmed true. The console is also showing Confirm and Cancel." }]
        }
        setPendingAction(null)
        const enquiries = await rows("enquiries")
        const ids = kind === "voice_call"
          ? (voiceCallsFrom(enquiries).find((c) => c.id === args.id)?.rows || []).map((r) => r.id)
          : enquiries.some((e) => e.id === args.id) ? [String(args.id)] : []
        if (!ids.length) return [{ ok: false, error: "That record was not found. Search again first." }]
        try {
          // A folded Anu call is several rows; its status is all of them, as on its page.
          await Promise.all(ids.map((rowId) => repo.update("enquiries", rowId, { status: args.status })))
          return [{ ok: true, saved: `Status is now ${label}.` }, record ? [{ ...record, status: label }] : []]
        } catch (e) {
          return [{ ok: false, error: `The change was not saved: ${e?.message || "unknown error"}. Tell them it did not go through.` }]
        }
      }
      case "start_quotation": {
        if (!a.quotations) return [denied("Quotations")]
        const items = Array.isArray(args.items) ? args.items : []
        if (args.confirmed !== true) {
          setPendingAction({
            name, args,
            title: "Start a draft quotation",
            detail: [args.customer_name || cardsRef.current.get(`customer:${args.customer_id}`)?.title || "No customer named",
              items.map((i) => [i.quantity, i.product].filter(Boolean).join(" x ")).join(", ")].filter(Boolean).join(" · "),
          })
          return [{ ok: false, needs_confirmation: true, next: "Read back the customer and each item with its quantity, get a yes, then call again with confirmed true. The console is also showing Confirm and Cancel." }]
        }
        setPendingAction(null)
        const [customers, products] = await Promise.all([a.customers ? rows("customers") : [], a.products ? rows("products") : []])
        const byId = customers.find((c) => c.id === args.customer_id)
        const byName = !byId && args.customer_name ? findCustomers(customers, [], String(args.customer_name))[0] : null
        const picked = byId || (byName ? customers.find((c) => c.id === byName.id) : null)
        const customer = picked
          ? { name: picked.name || "", company: picked.company || "", email: picked.email || "", phone: picked.phone || "", gstin: picked.gstin || "", stateCode: picked.stateCode || "", address: picked.address || "" }
          : { name: String(args.customer_name || "") }
        const { lines, unmatched } = draftLines(products, items)
        navigate("/quotations", { state: { fromEnquiry: { customer, lines, message: "Drafted with Anu" } } })
        return [{
          ok: true,
          opened: "a draft quotation in the editor",
          customer: picked ? "matched to the saved customer" : "not a saved customer, entered by name",
          lines: lines.length,
          unpriced_items: unmatched.length ? unmatched : undefined,
          next: `Tell them the draft is open for them to check and save${unmatched.length ? `, and that ${unmatched.join(", ")} had no catalogue price so they must add the rate` : ""}.`,
        }]
      }
      case "open_record": {
        const kind = String(args.kind)
        const allowed = { customer: a.customers, enquiry: a.enquiries, voice_call: a.voice, quotation: a.quotations, product: a.products }
        if (!(kind in allowed) || !args.id) return [{ ok: false, error: "Unknown record." }]
        if (!allowed[kind]) return [denied("That record")]
        go(kind, String(args.id))
        return [{ ok: true, next: "Say it is open. Do not end the call." }]
      }
      case "end_call": {
        endWantedRef.current = true
        clearTimeout(endTimerRef.current)
        endTimerRef.current = window.setTimeout(() => endWantedRef.current && stop("ended"), GOODBYE_GRACE_MS)
        if (!sourcesRef.current.length) window.setTimeout(() => endWantedRef.current && !sourcesRef.current.length && stop("ended"), 1500)
        return [{ ok: true }]
      }
      default: {
        const read = await runReadTool(name, args, a, now)
        if (!read) return [{ ok: false, error: `Unknown tool ${name}.` }]
        return [read.response, surface(read.results || []), read.stats]
      }
    }
  }

  const handleTool = async (fc) => {
    const args = fc.args || {}
    setThinking(true)
    flush()
    let response, cards, stats
    try {
      ;[response, cards = [], stats] = await runTool(fc.name, args)
    } catch (e) {
      response = { ok: false, error: `Lookup failed: ${e?.message || "unknown error"}` }
    }
    const label = activityLabel(fc.name, args)
    if (label) {
      const count = response?.total ?? response?.count
      push({
        role: "tool",
        text: label,
        tool: fc.name,
        failed: response?.ok === false && !response?.needs_confirmation,
        count: typeof count === "number" ? count : undefined,
        cards,
        stats,
      })
    }
    try { sessionRef.current?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response }] }) } catch { /* closing */ }
  }

  const handleMessage = (message) => {
    const calls = message?.toolCall?.functionCalls
    if (calls?.length) for (const fc of calls) void handleTool(fc)
    const sc = message?.serverContent
    if (!sc) return
    if (sc.interrupted) clearPlayback()
    if (sc.inputTranscription?.text) {
      inBufRef.current += sc.inputTranscription.text
      setPartial((p) => ({ ...p, user: inBufRef.current }))
    }
    if (sc.outputTranscription?.text) {
      // Her reply starting means the person's turn is over: settle it first.
      if (inBufRef.current.trim()) {
        push({ role: "user", text: inBufRef.current.trim() })
        inBufRef.current = ""
      }
      outBufRef.current += sc.outputTranscription.text
      setPartial({ user: "", anu: outBufRef.current })
    }
    if (sc.turnComplete) flush()
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) playChunk(base64ToInt16(inline.data))
    }
  }
  // Callbacks are bound once at connect; route them through a ref so they
  // always see this render's closures (navigate, access, profile).
  const handlerRef = useRef(handleMessage)
  handlerRef.current = handleMessage

  const sendText = useCallback((text, { echo = true } = {}) => {
    const t = String(text || "").trim()
    if (!t || !sessionRef.current) return false
    if (echo) {
      flush()
      push({ role: "user", text: t, typed: true })
    }
    setThinking(true)
    try {
      sessionRef.current.sendClientContent({ turns: [{ role: "user", parts: [{ text: t }] }], turnComplete: true })
      return true
    } catch {
      return false
    }
  }, [flush])

  const start = useCallback(async (question) => {
    if (statusRef.current === "connecting" || statusRef.current === "live") {
      if (question) sendText(question)
      return
    }
    if (!hasSupabase) { setError(ERROR_TEXT.backend); setStat("error"); return }
    setError("")
    setTurns([])
    setPartial({ user: "", anu: "" })
    setPendingAction(null)
    cardsRef.current = new Map()
    inBufRef.current = outBufRef.current = ""
    setSeconds(0)
    setMuted(false)
    mutedRef.current = false
    endWantedRef.current = false
    setStat("connecting")

    try {
      // Audio contexts first, inside the click, so autoplay policy lets them run.
      const AC = window.AudioContext || window.webkitAudioContext
      inCtxRef.current = new AC({ sampleRate: INPUT_RATE })
      outCtxRef.current = new AC({ sampleRate: OUTPUT_RATE })
      inCtxRef.current.resume?.().catch(() => {})
      outCtxRef.current.resume?.().catch(() => {})
      const outAnalyser = outCtxRef.current.createAnalyser()
      outAnalyser.fftSize = 512
      outAnalyser.connect(outCtxRef.current.destination)
      outAnalyserRef.current = outAnalyser

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      } catch (e) {
        throw new Error(e?.name === "NotAllowedError" || e?.name === "SecurityError" ? "mic-denied" : "mic-failed")
      }
      streamRef.current = stream
      if (statusRef.current !== "connecting") { stop("idle"); return }

      const token = await mintToken()
      if (statusRef.current !== "connecting") { stop("idle"); return }

      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } })
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: staffInstruction(profileRef.current),
          // hi-IN, as on the website and the phone: the voice that carries Hinglish naturally.
          speechConfig: { languageCode: "hi-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } } },
          realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: SILENCE_MS } },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          tools: ANU_TOOLS,
        },
        callbacks: {
          onopen: () => {
            setStat("live")
            timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
          },
          onmessage: (m) => handlerRef.current(m),
          onerror: () => { setError(ERROR_TEXT.network); setStat("error"); stop("error") },
          onclose: () => { if (sessionRef.current) stop("ended") },
        },
      })
      sessionRef.current = session

      const first = firstName()
      if (question) {
        push({ role: "user", text: question, typed: true })
        sendText(`[${first} opened Anu in the console and asks:] ${question}`, { echo: false })
      } else {
        sendText(`[${first} just opened Anu in the console. Greet them in one short Hinglish line.]`, { echo: false })
      }

      const micSrc = inCtxRef.current.createMediaStreamSource(stream)
      const inAnalyser = inCtxRef.current.createAnalyser()
      inAnalyser.fftSize = 512
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
      // A ScriptProcessor only runs while connected to a destination; it writes
      // no output, so this is silence, never the mic fed back to the speakers.
      micSrc.connect(proc)
      proc.connect(inCtxRef.current.destination)
      procRef.current = proc
    } catch (e) {
      console.error("Anu failed to start:", e)
      setError(ERROR_TEXT[e?.message] || ERROR_TEXT.token)
      setStat("error")
      stop("error")
    }
  }, [sendText, stop])

  const hangUp = useCallback(() => stop("ended"), [stop])

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      mutedRef.current = !m
      return !m
    })
  }, [])

  const reset = useCallback(() => {
    stop("idle")
    setStat("idle")
    setTurns([])
    setSeconds(0)
    setError("")
  }, [stop])

  // A click on the pending card is a yes: run the write here and tell Anu what happened.
  const confirmAction = useCallback(async () => {
    const action = pendingAction
    if (!action) return
    setPendingAction(null)
    setThinking(true)
    let response
    let cards = []
    try {
      ;[response, cards = []] = await runTool(action.name, { ...action.args, confirmed: true })
    } catch (e) {
      response = { ok: false, error: e?.message || "unknown error" }
    }
    push({ role: "tool", text: action.name === "start_quotation" ? "Started a draft quotation" : "Updated a lead's status", tool: action.name, failed: response?.ok === false, cards })
    sendText(`[${firstName()} pressed Confirm on screen. Result: ${JSON.stringify(response)}. Tell them the outcome in one short line.]`, { echo: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, sendText])

  const cancelAction = useCallback(() => {
    if (!pendingAction) return
    setPendingAction(null)
    push({ role: "tool", text: "Change cancelled", tool: "cancel" })
    sendText(`[${firstName()} pressed Cancel on screen. Do not make that change. Acknowledge in a few words.]`, { echo: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, sendText])

  const openCard = (card) => go(card.kind, card.id)

  return {
    status, error, speaking, thinking, muted, seconds, turns, partial, pendingAction, access,
    readLevel, start, hangUp, reset, toggleMute, sendText, confirmAction, cancelAction, openCard,
  }
}
