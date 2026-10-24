import { useEffect, useRef, useState } from "react"
import MantraCard from "../components/MantraCard"
import ParticlePandit from "../components/ParticlePandit"
import { useLivePandit } from "../live/useLivePandit"

const BEFORE = [
  "Keep the laptop where its camera sees the chowki, kalash and diya.",
  "Use earphones if you can, so Pandit Ji does not hear himself.",
  "A well-lit room helps him see the samagri clearly.",
  "Stop him to ask anything, any time, in Maithili, Hindi or English.",
]

const BANNER = {
  connecting: "Calling Pandit Ji...",
  reconnecting: "Reconnecting, one moment...",
}

function Icon({ d, className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
const MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3"
const MIC_OFF = "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.8M5 12a7 7 0 0 0 11.9 5M19 12a7 7 0 0 1-.6 2.8M12 19v3"
const CAM = "M15 10l5-3v10l-5-3M4 6h11v12H4z"
const CAM_OFF = "M3 3l18 18M15 10l5-3v10l-5-3M10.5 6H15v4.5M15 15v3H4V6h2"
const HANGUP = "M3 15c5-5 13-5 18 0l-2.5 2.5-3.2-1.6.4-2.6c-2.4-.9-5-.9-7.4 0l.4 2.6-3.2 1.6Z"

// The caption on the tile: whoever spoke last, the last two lines of it.
function LiveCaption({ captions }) {
  const last = captions.at(-1)
  if (!last) return null
  const text = last.text.length > 180 ? `...${last.text.slice(-180)}` : last.text
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center px-4" aria-hidden="true">
      <p className="max-w-2xl rounded-xl bg-black/60 px-4 py-2 text-center text-[15px] leading-relaxed text-white backdrop-blur">
        <span className={`font-semibold ${last.who === "pandit" ? "text-amber-300" : "text-sky-300"}`}>{last.who === "pandit" ? "Pandit Ji" : "You"}: </span>
        {text}
      </p>
    </div>
  )
}

export default function LiveRoom({ pooja }) {
  const videoRef = useRef(null)
  const transcriptRef = useRef(null)
  const call = useLivePandit(pooja)
  const [configured, setConfigured] = useState(true)
  const current = pooja.steps[call.step]
  const inCall = call.status === "connecting" || call.status === "live" || call.status === "reconnecting"

  useEffect(() => {
    fetch("/api/live-token")
      .then((r) => r.json())
      .then((d) => setConfigured(d.configured !== false))
      .catch(() => {})
  }, [])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [call.captions])

  const state = call.speaking ? "Speaking" : call.status === "live" ? "Listening" : BANNER[call.status] ? "Connecting" : "Ready"

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-call text-white" onPointerDown={call.unlockAudio}>
      <header className="lp-wrap flex items-center justify-between py-4">
        <a href={`#/pooja/${pooja.id}`} className="btn btn-ghost -ml-3 text-white/70 hover:bg-white/10 hover:text-white">
          <Icon d="M15 18l-6-6 6-6" className="h-4 w-4" /> Back
        </a>
        <p className="truncate text-sm font-semibold sm:text-base">
          {pooja.name} <span className="deva font-normal text-amber-300">{pooja.nameHi}</span>
        </p>
        <span className="hidden w-20 sm:block" />
      </header>

      <div className="lp-wrap grid flex-1 gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        {/* Main tile: Pandit Ji */}
        <section className="relative min-h-[62vh] min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-call-tile">
          <ParticlePandit readLevel={call.readLevel} speaking={call.speaking} active={inCall} align={inCall ? 0.5 : 0.92} className="absolute inset-0" />

          {inCall && (
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 text-sm backdrop-blur">
              <span className={`h-2 w-2 rounded-full ${call.status === "live" ? "bg-emerald-400" : "bg-amber-400"}`} />
              <span className="font-semibold">Pandit Ji</span>
              <span className="text-white/60">· {state}</span>
            </div>
          )}

          {BANNER[call.status] && (
            <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm backdrop-blur">{BANNER[call.status]}</div>
          )}

          {inCall && <LiveCaption captions={call.captions} />}

          {/* Self view, picture in picture */}
          <div className={`absolute bottom-4 right-4 aspect-video w-36 overflow-hidden rounded-xl border border-white/20 bg-black sm:w-56 ${inCall ? "" : "invisible"}`}>
            <video ref={videoRef} muted playsInline className={`mirror h-full w-full object-cover ${call.cameraOn ? "" : "opacity-0"}`} />
            {!call.cameraOn && <p className="absolute inset-0 grid place-items-center text-xs text-white/60">Camera off</p>}
            <p className="absolute bottom-1.5 left-2 text-xs font-medium text-white/90">You{call.muted ? " · muted" : ""}</p>
          </div>

          {inCall && (
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-3 max-sm:left-4 max-sm:translate-x-0">
              <button onClick={call.toggleMute} aria-label={call.muted ? "Unmute" : "Mute"} className={`grid h-12 w-12 place-items-center rounded-full ${call.muted ? "bg-red-600" : "bg-white/15 hover:bg-white/25"}`}>
                <Icon d={call.muted ? MIC_OFF : MIC} />
              </button>
              <button onClick={call.toggleCamera} aria-label={call.cameraOn ? "Turn camera off" : "Turn camera on"} className={`grid h-12 w-12 place-items-center rounded-full ${call.cameraOn ? "bg-white/15 hover:bg-white/25" : "bg-red-600"}`}>
                <Icon d={call.cameraOn ? CAM : CAM_OFF} />
              </button>
              <button onClick={call.end} aria-label="End the pooja call" className="grid h-12 w-16 place-items-center rounded-full bg-red-600 hover:bg-red-700">
                <Icon d={HANGUP} className="h-6 w-6" />
              </button>
            </div>
          )}

          {!inCall && (
            <div className="absolute inset-0 flex items-center bg-gradient-to-r from-call via-call/85 to-call/0 p-6 sm:p-10 max-md:bg-call/85">
              <div className="max-w-lg">
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-300">{call.status === "ended" ? "Pooja sampann" : "Video call with Pandit Ji"}</p>
                <h1 className="mt-3 text-[30px] font-medium leading-[1.1] tracking-tight sm:text-[40px]">
                  {call.status === "ended" ? (
                    <>Jai Shri Hari. <span className="font-serif italic text-amber-200">Aapka kalyan ho.</span></>
                  ) : (
                    <>He sees your altar and <span className="font-serif italic text-amber-200">guides every step.</span></>
                  )}
                </h1>
                {!configured && (
                  <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                    Pandit Ji has no Gemini key yet. Add <code className="font-mono">GEMINI_API_KEY=...</code> to <code className="font-mono">PanditJi/.env</code>, then restart <code className="font-mono">npm run dev</code>.
                  </p>
                )}
                {configured && call.status === "error" && (
                  <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">{call.error}</p>
                )}
                {call.status !== "ended" && (
                  <ul className="mt-5 space-y-2 text-[15px] text-white/80">
                    {BEFORE.map((b) => (
                      <li key={b} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />{b}</li>
                    ))}
                  </ul>
                )}
                <button onClick={() => call.start(videoRef.current)} disabled={!configured} className="btn btn-primary btn-lg mt-7">
                  <Icon d={CAM} /> {call.status === "idle" ? "Join the video call" : "Call again"}
                </button>
                <p className="mt-4 text-xs text-white/50">
                  Your camera and voice go to Pandit Ji (Google Gemini) only while the call is on. Nothing is recorded or stored on this website.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Side panel: the step, then the transcript */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-4">
          <div className="rounded-2xl bg-white p-5 text-foreground">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Step {String(call.step + 1).padStart(2, "0")} / {pooja.steps.length}</p>
              <div className="flex gap-1">
                <button aria-label="Previous step" disabled={call.step === 0} onClick={() => call.goToStep(call.step - 1)} className="btn btn-ghost h-8 w-8 p-0">
                  <Icon d="M15 18l-6-6 6-6" className="h-4 w-4" />
                </button>
                <button aria-label="Next step" disabled={call.step === pooja.steps.length - 1} onClick={() => call.goToStep(call.step + 1)} className="btn btn-ghost h-8 w-8 p-0">
                  <Icon d="M9 18l6-6-6-6" className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${((call.step + 1) / pooja.steps.length) * 100}%` }} />
            </div>
            <h2 className="mt-4 text-[20px] font-medium leading-snug">
              {current.title} <span className="deva text-[16px] text-primary">{current.titleHi}</span>
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{current.what}</p>
            {current.mantra && <div className="mt-4"><MantraCard mantra={current.mantra} compact /></div>}
          </div>

          <div className="flex min-h-48 flex-1 flex-col rounded-2xl border border-white/10 bg-call-tile">
            <p className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/50">Conversation</p>
            <div ref={transcriptRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto p-4 text-sm lg:max-h-[38vh]">
              {call.captions.length === 0 && <p className="text-white/40">Everything you and Pandit Ji say will appear here. Ask him anything, any time.</p>}
              {call.captions.map((c, i) => (
                <p key={i} className="leading-relaxed text-white/90">
                  <span className={`font-semibold ${c.who === "pandit" ? "text-amber-300" : "text-sky-300"}`}>{c.who === "pandit" ? "Pandit Ji" : "You"}: </span>
                  {c.text}
                </p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
