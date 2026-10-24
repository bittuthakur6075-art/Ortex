import { GoogleGenAI, Modality, StartSensitivity } from "@google/genai"
import { INPUT_RATE, OUTPUT_RATE, base64ToInt16, downsample, floatTo16BitPCM, int16ToBase64 } from "../lib/audio"
import { liveOpener, liveResume, liveSystem } from "../lib/prompt"

/* ============================================================
   PanditCall: one live pooja session with Pandit Ji.

   Flow: ephemeral token (api/live-token) -> Gemini Live WebSocket -> stream
   the mic as 16 kHz PCM and one camera frame a second as JPEG, play Pandit
   Ji's 24 kHz voice back. He moves the on-screen step card with show_step.

   A pooja runs for hours, longer than one Live connection lives, so the call
   keeps the latest session-resumption handle and reconnects with it when the
   server sends goAway or the socket drops. Mic, camera and audio output stay
   up across reconnects; only the session is replaced.

   Plain class rather than a hook: connect, reconnect and the message handler
   call each other, which is awkward with useCallback. useLivePandit wraps it.
   ============================================================ */

const MIC_BUFFER = 1024 // 64 ms at 16 kHz
const MIC_WORKLET_URL = `${import.meta.env.BASE_URL}mic-worklet.js`
const FRAME_MS = 1000 // Gemini Live takes video at about 1 frame a second
const FRAME_WIDTH = 640
const JPEG_QUALITY = 0.7
// Start a reply this far ahead so chunks behind it arrive in time.
const PLAYBACK_LEAD = 0.15
const MAX_RECONNECTS = 5
const VOICE = "Charon"
// See Ortex.Web's useLiveSession for how these were tuned for Indian homes:
// LOW start sensitivity ignores a fan, a bell or a "haan"; 700 ms of silence
// lets a devotee finish repeating a mantra phrase without being cut off.
const END_OF_SPEECH_SILENCE_MS = 700
const START_OF_SPEECH_PREFIX_MS = 200

const TOOLS = [{
  functionDeclarations: [{
    name: "show_step",
    behavior: "BLOCKING",
    description: "Show a step of the pooja on the devotee's screen. Call it silently just before you begin each step.",
    parameters: {
      type: "OBJECT",
      properties: { step: { type: "INTEGER", description: "Step number, starting at 1" } },
      required: ["step"],
    },
  }],
}]

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function friendlyError(err) {
  if (err?.userMessage) return err.userMessage
  const name = err?.name || ""
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera or microphone access is blocked. Please allow both from your browser's address bar and try again."
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "We could not find a camera or microphone. Please connect one and try again."
  }
  if (name === "NotReadableError") return "Your camera is being used by another app. Please close it and try again."
  return "We could not connect to Pandit Ji. Please check your internet connection and try again."
}

export class PanditCall {
  constructor(pooja, on) {
    this.pooja = pooja
    this.on = on // { status(s, message?), step(i), caption(who, text), turnDone(), speaking(bool) }
    this.session = null
    this.handle = null
    this.ending = false
    this.reconnecting = false
    this.reconnects = 0
    this.step = 0
    this.muted = false
    this.cameraOn = true
    this.sources = new Set()
    this.nextTime = 0
  }

  // Must be called from a click: the audio contexts are created before the
  // first await so the click still counts as the gesture autoplay requires.
  async start(videoEl) {
    this.on.status("connecting")
    try {
      // Camera and mic exist only on HTTPS or localhost; on a LAN address the API is simply missing.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("insecure"), { userMessage: "The camera only works on a secure (https) address. Please open the site with https." })
      }
      const AC = window.AudioContext || window.webkitAudioContext
      try {
        this.inCtx = new AC({ sampleRate: INPUT_RATE })
      } catch {
        this.inCtx = new AC()
      }
      this.outCtx = new AC()
      this.outCtx.resume().catch(() => {})
      // Pandit Ji's voice goes through an analyser so his lips can follow it.
      this.outAnalyser = this.outCtx.createAnalyser()
      this.outAnalyser.fftSize = 512
      this.outAnalyser.connect(this.outCtx.destination)
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      })
      if (this.ending) return this.release()
      this.video = videoEl
      videoEl.srcObject = this.stream
      await videoEl.play().catch(() => {})
      await this.connect(false)
      if (this.ending) return
      await this.startMic()
      this.frameTimer = setInterval(() => this.sendFrame(), FRAME_MS)
      this.on.status("live")
    } catch (err) {
      console.error(err)
      this.release()
      this.on.status("error", friendlyError(err))
    }
  }

  async connect(resume) {
    const r = await fetch("/api/live-token", { method: "POST" })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data.token) throw Object.assign(new Error("token"), { userMessage: data.error })

    const ai = new GoogleGenAI({ apiKey: data.token, httpOptions: { apiVersion: "v1alpha" } })
    let session = null
    const opened = await ai.live.connect({
      model: data.model,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: liveSystem(this.pooja),
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        // Audio + video fills the context fast; the sliding window keeps a long pooja going.
        contextWindowCompression: { slidingWindow: {} },
        sessionResumption: this.handle ? { handle: this.handle } : {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            silenceDurationMs: END_OF_SPEECH_SILENCE_MS,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
            prefixPaddingMs: START_OF_SPEECH_PREFIX_MS,
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: TOOLS,
      },
      callbacks: {
        onmessage: (m) => this.handleMessage(m),
        onerror: (e) => console.warn("[Pandit Ji] socket error", e),
        onclose: (e) => {
          if (!session || this.session !== session) return
          console.info("[Pandit Ji] socket closed", e?.code, e?.reason)
          this.session = null
          if (!this.ending) this.reconnect()
        },
      },
    })
    if (this.ending) {
      try { opened.close() } catch { /* closing */ }
      return
    }
    session = opened
    this.session = opened
    opened.sendClientContent({
      turns: [{ role: "user", parts: [{ text: resume ? liveResume(this.step) : liveOpener(this.pooja) }] }],
      turnComplete: true,
    })
  }

  async reconnect() {
    if (this.ending || this.reconnecting) return
    this.reconnecting = true
    const old = this.session
    this.session = null
    try { old?.close() } catch { /* closing */ }
    this.clearPlayback()
    this.on.status("reconnecting")
    while (!this.ending && this.reconnects < MAX_RECONNECTS) {
      this.reconnects += 1
      try {
        await this.connect(true)
        this.reconnecting = false
        if (!this.ending) this.on.status("live")
        return
      } catch (err) {
        console.warn("[Pandit Ji] reconnect failed", err)
        await wait(1500 * this.reconnects)
      }
    }
    this.reconnecting = false
    if (!this.ending) {
      this.release()
      this.on.status("error", "The connection to Pandit Ji was lost. Please check your internet and start again.")
    }
  }

  handleMessage(m) {
    const update = m.sessionResumptionUpdate
    if (update?.resumable && update.newHandle) this.handle = update.newHandle
    // The server is about to close this connection: move to a fresh one now.
    if (m.goAway) {
      this.reconnect()
      return
    }

    if (m.toolCall?.functionCalls?.length) {
      const functionResponses = m.toolCall.functionCalls.map((fc) => {
        if (fc.name !== "show_step") return { id: fc.id, name: fc.name, response: { error: "Unknown tool" } }
        const n = Math.min(Math.max(Number(fc.args?.step) || 1, 1), this.pooja.steps.length)
        this.step = n - 1
        this.on.step(this.step)
        return { id: fc.id, name: fc.name, response: { ok: true, showing: this.pooja.steps[this.step].title } }
      })
      try { this.session?.sendToolResponse({ functionResponses }) } catch { /* closing */ }
    }

    const sc = m.serverContent
    if (!sc) return
    if (sc.interrupted) this.clearPlayback()
    if (sc.inputTranscription?.text) this.on.caption("you", sc.inputTranscription.text)
    if (sc.outputTranscription?.text) this.on.caption("pandit", sc.outputTranscription.text)
    for (const part of sc.modelTurn?.parts || []) {
      const inline = part?.inlineData
      if (inline?.data && String(inline.mimeType || "").startsWith("audio/pcm")) this.playChunk(base64ToInt16(inline.data))
    }
    if (sc.turnComplete) {
      this.reconnects = 0
      this.on.turnDone()
    }
  }

  async startMic() {
    let ctx = this.inCtx
    let src
    try {
      src = ctx.createMediaStreamSource(this.stream)
    } catch {
      // Firefox cannot feed a mic into a 16 kHz context: capture at the device rate and downsample.
      ctx.close().catch(() => {})
      const AC = window.AudioContext || window.webkitAudioContext
      ctx = this.inCtx = new AC()
      src = ctx.createMediaStreamSource(this.stream)
    }
    ctx.resume().catch(() => {})
    const send = (float32) => {
      if (this.muted || !this.session) return
      try {
        this.session.sendRealtimeInput({
          audio: { data: int16ToBase64(floatTo16BitPCM(downsample(float32, ctx.sampleRate))), mimeType: `audio/pcm;rate=${INPUT_RATE}` },
        })
      } catch { /* closing */ }
    }
    const block = Math.round(MIC_BUFFER * ctx.sampleRate / INPUT_RATE)
    let proc = null
    if (ctx.audioWorklet && window.AudioWorkletNode) {
      try {
        await ctx.audioWorklet.addModule(MIC_WORKLET_URL)
        proc = new AudioWorkletNode(ctx, "pandit-mic", {
          numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: { blockSize: block },
        })
        proc.port.onmessage = (e) => send(e.data)
      } catch (err) {
        console.warn("[Pandit Ji] mic worklet unavailable, using ScriptProcessor", err)
        proc = null
      }
    }
    if (!proc) {
      proc = ctx.createScriptProcessor(2 ** Math.round(Math.log2(block)), 1, 1)
      proc.onaudioprocess = (e) => send(e.inputBuffer.getChannelData(0))
    }
    // A silent path to the destination keeps the graph pulling samples.
    const sink = ctx.createGain()
    sink.gain.value = 0
    src.connect(proc)
    proc.connect(sink)
    sink.connect(ctx.destination)
    this.micSrc = src
    this.proc = proc
  }

  sendFrame() {
    const v = this.video
    if (!this.session || !this.cameraOn || this.frameBusy || !v || v.readyState < 2 || !v.videoWidth) return
    this.canvas ??= document.createElement("canvas")
    const w = Math.min(FRAME_WIDTH, v.videoWidth)
    const h = Math.round(w * v.videoHeight / v.videoWidth)
    this.canvas.width = w
    this.canvas.height = h
    this.canvas.getContext("2d").drawImage(v, 0, 0, w, h)
    this.frameBusy = true
    this.canvas.toBlob(async (blob) => {
      try {
        if (blob && this.session) {
          this.session.sendRealtimeInput({ video: { data: await blobToBase64(blob), mimeType: "image/jpeg" } })
        }
      } catch { /* closing */ } finally {
        this.frameBusy = false
      }
    }, "image/jpeg", JPEG_QUALITY)
  }

  playChunk(int16) {
    const ctx = this.outCtx
    if (!ctx || ctx.state === "closed") return
    const f32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768
    const buffer = ctx.createBuffer(1, f32.length, OUTPUT_RATE)
    buffer.copyToChannel(f32, 0)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(this.outAnalyser || ctx.destination)
    const at =this.nextTime > ctx.currentTime ? this.nextTime : ctx.currentTime + PLAYBACK_LEAD
    src.start(at)
    this.nextTime = at + buffer.duration
    this.sources.add(src)
    this.on.speaking(true)
    src.onended = () => {
      this.sources.delete(src)
      if (!this.sources.size) this.on.speaking(false)
    }
  }

  clearPlayback() {
    for (const s of this.sources) {
      try { s.stop() } catch { /* already stopped */ }
    }
    this.sources.clear()
    this.nextTime = 0
    this.on.speaking(false)
  }

  // Loudness of Pandit Ji's voice, 0..1. Read every animation frame by the
  // avatar, so it reuses one buffer.
  readLevel() {
    const a = this.outAnalyser
    if (!a || !this.sources.size) return 0
    this.levelBuf ??= new Uint8Array(a.fftSize)
    a.getByteTimeDomainData(this.levelBuf)
    let sum = 0
    for (let i = 0; i < this.levelBuf.length; i++) {
      const v = (this.levelBuf[i] - 128) / 128
      sum += v * v
    }
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 3)
  }

  // The devotee moved the step card themselves: keep Pandit Ji in step.
  userStep(index) {
    this.step = index
    this.on.step(index)
    const s = this.pooja.steps[index]
    try {
      this.session?.sendClientContent({
        turns: [{ role: "user", parts: [{ text: `(The devotee moved the screen to step ${index + 1}, "${s.title}". Continue the pooja from that step.)` }] }],
        turnComplete: true,
      })
    } catch { /* closing */ }
  }

  setMuted(muted) {
    this.muted = muted
  }

  setCamera(on) {
    this.cameraOn = on
    for (const t of this.stream?.getVideoTracks() || []) t.enabled = on
  }

  // Tap anywhere to unblock audio if the browser held it.
  unlockAudio() {
    this.outCtx?.resume().catch(() => {})
  }

  release() {
    this.ending = true
    clearInterval(this.frameTimer)
    const s = this.session
    this.session = null
    try { s?.close() } catch { /* closing */ }
    this.clearPlayback()
    try { this.proc?.disconnect() } catch { /* gone */ }
    if (this.proc?.port) this.proc.port.onmessage = null
    try { this.micSrc?.disconnect() } catch { /* gone */ }
    for (const t of this.stream?.getTracks() || []) t.stop()
    if (this.video) this.video.srcObject = null
    this.inCtx?.close().catch(() => {})
    this.outCtx?.close().catch(() => {})
  }

  end() {
    this.release()
    this.on.status("ended")
  }
}
