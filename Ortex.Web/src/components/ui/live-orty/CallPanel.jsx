import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowDown2, CallSlash, CloseCircle, Microphone2, MicrophoneSlash1, Refresh2, TickCircle, VolumeHigh, Whatsapp } from "iconsax-react"
import Orb from "./Orb"
import { whatsappLink } from "../../../constants/site"
import { MORPH_SPRING, EASE, mmss } from "./shared"

/* ============================================================
   CallPanel — the open call. A dark glass card docked bottom-right (a
   bottom sheet on phones) that never blocks the page, so a visitor can keep
   browsing products while Anu talks them through it.

   Three faces share the one card: the live call (orb, status sentence, live
   caption, saved-details chip, mute + end), the error (reason, retry,
   WhatsApp fallback) and the summary after hang-up (duration, what was saved,
   call again / written quote). Shares `layoutId="anu-morph"` with the
   launcher and the minimised pill, so each morphs into the others.
   ============================================================ */

// Rotating prompts shown before the visitor has said anything.
const HINTS = [
  "“Mujhe 500 lanyards chahiye, logo ke saath”",
  "“Acrylic trophies for our annual event”",
  "“MDF gift boxes with our branding”",
  "“Can you white-label this for my brand?”",
]

function statusFor({ status, speaking, muted, audioBlocked }) {
  if (status === "connecting") return { text: "Connecting you to Anu…", dot: "bg-slate-400", pulse: true }
  if (audioBlocked) return { text: "Your browser paused the sound", dot: "bg-amber-400", pulse: true }
  if (muted) return { text: "You're muted", dot: "bg-zinc-400", pulse: false }
  if (speaking) return { text: "Anu is speaking", dot: "bg-violet-400", pulse: true }
  return { text: "Listening — go ahead", dot: "bg-emerald-400", pulse: true }
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE, delay } },
})

export default function CallPanel({ call }) {
  const { status, speaking, muted, audioBlocked, errorMsg, seconds, caption, lead, ended, readLevel, toggleMute, unlockAudio, endCall, dismiss, start, minimize } = call
  const view = ended ? "ended" : status === "error" ? "error" : "live"
  const mood = view === "ended" ? "ended" : view === "error" ? "error" : status === "connecting" ? "connecting" : muted ? "muted" : speaking ? "speaking" : "listening"

  return (
    <motion.div
      layoutId="anu-morph"
      role="dialog"
      aria-label="Voice call with Anu"
      transition={MORPH_SPRING}
      className="fixed z-[80] inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6 sm:bottom-6 md:right-[50px] md:bottom-[50px] sm:w-[384px] overflow-hidden text-white"
      style={{ borderRadius: 32, background: "rgba(12,13,22,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      {/* Flat surface: one hairline edge, no shadow, no glow */}
      <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-white/[0.08]" />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.25 } }} className="relative flex flex-col">
        <Header view={view} status={status} seconds={seconds} onMinimize={minimize} onClose={dismiss} />

        <AnimatePresence mode="wait" initial={false}>
          {view === "live" && (
            <motion.div key="live" exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }} className="flex flex-col items-center px-6">
              <motion.div initial={{ opacity: 0, scale: 0.6, filter: "blur(12px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ ...MORPH_SPRING, delay: 0.1 }}>
                <Orb mood={mood} size={196} readLevel={readLevel} />
              </motion.div>
              <StatusLine {...statusFor({ status, speaking, muted, audioBlocked })} />
              {audioBlocked && status === "live"
                ? <SoundPrompt onUnlock={unlockAudio} />
                : <Caption caption={caption} live={status === "live"} />}
              <LeadChip lead={lead} />
              <Controls muted={muted} disabled={status !== "live"} onMute={toggleMute} onEnd={endCall} />
            </motion.div>
          )}

          {view === "error" && (
            <motion.div key="error" {...fadeUp()} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="flex flex-col items-center px-6 pb-6 text-center">
              <Orb mood="error" size={132} />
              <h3 className="mt-2 text-[19px] font-semibold tracking-tight">Anu couldn't join</h3>
              <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-white/60">{errorMsg || "Something went wrong."}</p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
                <motion.button whileTap={{ scale: 0.97 }} onClick={start} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-zinc-900 transition hover:bg-white/90">
                  <Refresh2 size={18} variant="Linear" color="currentColor" /> Try again
                </motion.button>
                <a href={whatsappLink("Hi Ortex, I tried the voice assistant on your website and would like a quote.")} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/10 text-[15px] font-semibold text-white transition hover:bg-white/15">
                  <Whatsapp size={18} variant="Bold" color="#4ADE80" /> WhatsApp
                </a>
              </div>
            </motion.div>
          )}

          {view === "ended" && <Summary key="ended" ended={ended} onAgain={start} onClose={dismiss} />}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

function Header({ view, status, seconds, onMinimize, onClose }) {
  const live = view === "live" && status === "live"
  return (
    <div className="flex items-center gap-3 px-5 pt-5 pb-1">
      <div className="relative grid h-10 w-10 flex-none place-items-center rounded-full bg-primary text-[15px] font-semibold">
        A
        <AnimatePresence>
          {live && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#0A0B16]" />
          )}
        </AnimatePresence>
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[16px] font-semibold">Anu</p>
        <p className="truncate text-[13px] text-white/50">Ortex design assistant · Hindi & English</p>
      </div>

      <AnimatePresence>
        {live && (
          <motion.span
            initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-white/[0.08] px-2.5 text-[12px] font-medium tabular-nums text-white/80"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            {mmss(seconds)}
          </motion.span>
        )}
      </AnimatePresence>

      {view === "live" ? (
        <IconButton label="Minimise call" onClick={onMinimize}><ArrowDown2 size={18} variant="Linear" color="currentColor" /></IconButton>
      ) : (
        <IconButton label="Close" onClick={onClose}><CloseCircle size={20} variant="Linear" color="currentColor" /></IconButton>
      )}
    </div>
  )
}

function IconButton({ label, onClick, children }) {
  return (
    <motion.button
      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
      onClick={onClick} aria-label={label} title={label}
      className="grid h-9 w-9 flex-none place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </motion.button>
  )
}

function StatusLine({ text, dot, pulse }) {
  return (
    <div className="relative mt-1 h-6 w-full overflow-hidden" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={text}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="absolute inset-0 flex items-center justify-center gap-2 text-[15px] font-medium text-white/85"
        >
          <span className="relative flex h-2 w-2">
            {pulse && <span className={`absolute inset-0 rounded-full ${dot} opacity-70 animate-ping`} />}
            <span className={`relative h-2 w-2 rounded-full ${dot}`} />
          </span>
          {text}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// The last thing said, streamed word-group by word-group. Older lines scroll up
// under a fade so the newest words always sit on the bottom line.
function Caption({ caption, live }) {
  const [hint, setHint] = useState(0)
  useEffect(() => {
    if (caption || !live) return
    const t = window.setInterval(() => setHint((h) => (h + 1) % HINTS.length), 3600)
    return () => window.clearInterval(t)
  }, [caption, live])

  return (
    <div className="relative mt-3 h-[76px] w-full overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_38%)]">
      <AnimatePresence mode="wait" initial={false}>
        {caption ? (
          <motion.p
            key={caption.id}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className={`absolute inset-x-0 bottom-0 text-center text-[15px] leading-[1.55] ${caption.who === "anu" ? "text-white/90" : "text-sky-200/70"}`}
          >
            {caption.who === "you" && <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-300/60">You</span>}
            {caption.chunks.map((chunk, i) => (
              <motion.span key={i} initial={{ opacity: 0, filter: "blur(6px)" }} animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ duration: 0.4 }}>
                {chunk}
              </motion.span>
            ))}
          </motion.p>
        ) : live ? (
          <motion.p
            key={`hint-${hint}`}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute inset-x-0 bottom-1 text-center text-[14px] text-white/40"
          >
            Try saying {HINTS[hint]}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

// Shown when the call auto-opened before the visitor touched the page: Chrome
// holds audio until a gesture, so one tap here is what makes Anu audible.
function SoundPrompt({ onUnlock }) {
  return (
    <div className="mt-3 flex h-[76px] w-full items-center justify-center">
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
        onClick={onUnlock}
        className="relative inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-white"
      >
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-primary"
          animate={{ opacity: [0.7, 0], scale: [1, 1.22] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        />
        <VolumeHigh size={20} variant="Bold" color="currentColor" />
        Tap to hear Anu
      </motion.button>
    </div>
  )
}

function LeadChip({ lead }) {
  return (
    <AnimatePresence>
      {lead && (
        <motion.div
          initial={{ opacity: 0, height: 0, scale: 0.9 }} animate={{ opacity: 1, height: "auto", scale: 1 }} exit={{ opacity: 0, height: 0 }}
          transition={MORPH_SPRING}
          className="w-full overflow-hidden"
        >
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-emerald-400/10 px-3.5 py-2.5 ring-1 ring-inset ring-emerald-400/20">
            <motion.span initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...MORPH_SPRING, delay: 0.15 }}>
              <TickCircle size={20} variant="Bold" color="#34D399" />
            </motion.span>
            <p className="min-w-0 flex-1 truncate text-[13px] text-emerald-100/90">
              Details saved{lead.name ? ` for ${lead.name}` : ""} · WhatsApp +91 {lead.phone}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Controls({ muted, disabled, onMute, onEnd }) {
  return (
    <motion.div {...fadeUp(0.18)} className="mt-5 mb-6 flex w-full items-center justify-center gap-3">
      <motion.button
        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }}
        onClick={onMute} disabled={disabled}
        aria-pressed={muted} aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute" : "Mute"}
        animate={{ backgroundColor: muted ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.1)", color: muted ? "#18181B" : "#FFFFFF" }}
        className="grid h-14 w-14 place-items-center rounded-full disabled:opacity-40"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={muted ? "off" : "on"} initial={{ scale: 0.4, rotate: -45, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.4, rotate: 45, opacity: 0 }} transition={{ duration: 0.22 }}>
            {muted
              ? <MicrophoneSlash1 size={22} variant="Bold" color="currentColor" />
              : <Microphone2 size={22} variant="Bold" color="currentColor" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>

      <motion.button
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.95 }}
        onClick={onEnd}
        className="group inline-flex h-14 flex-1 max-w-[200px] items-center justify-center gap-2 rounded-full bg-red-500 text-[15px] font-semibold text-white transition-colors hover:bg-red-600"
      >
        <CallSlash size={20} variant="Bold" color="currentColor" className="transition-transform duration-300 group-hover:rotate-[135deg]" />
        End call
      </motion.button>
    </motion.div>
  )
}

function Summary({ ended, onAgain, onClose }) {
  const lead = ended.lead
  return (
    <motion.div {...fadeUp()} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="flex flex-col items-center px-6 pb-6 text-center">
      <Orb mood="ended" size={120} />
      <h3 className="mt-1 text-[19px] font-semibold tracking-tight">Call ended</h3>
      <p className="mt-1 text-[14px] tabular-nums text-white/50">{mmss(ended.seconds)} with Anu</p>

      <motion.div {...fadeUp(0.12)} className="mt-5 w-full rounded-2xl bg-white/[0.06] p-4 text-left ring-1 ring-inset ring-white/10">
        {lead ? (
          <div className="flex gap-3">
            <TickCircle size={22} variant="Bold" color="#34D399" className="mt-0.5 flex-none" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">We've got your details{lead.name ? `, ${lead.name}` : ""}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-white/55">Our team will WhatsApp a free mockup and best price to +91 {lead.phone}.</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-[14px] font-semibold">Didn't get to share your requirement?</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-white/55">Build a written quote in two minutes, or call Anu back any time.</p>
          </div>
        )}
      </motion.div>

      <motion.div {...fadeUp(0.2)} className="mt-4 grid w-full grid-cols-2 gap-2.5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onAgain} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-zinc-900 transition hover:bg-white/90">
          <Microphone2 size={18} variant="Bold" color="currentColor" /> Call again
        </motion.button>
        <Link to="/quote" onClick={onClose} className="inline-flex h-12 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold text-white transition hover:bg-white/15">
          Get a quote
        </Link>
      </motion.div>
    </motion.div>
  )
}
