import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowDown2, CallSlash, CloseCircle, Microphone2, MicrophoneSlash1, Refresh2, TickCircle, VolumeHigh, Whatsapp } from "iconsax-react"
import Orb from "./Orb"
import { whatsappLink } from "../../../constants/site"
import { MORPH_SPRING, EASE, mmss } from "./shared"

/* ============================================================
   CallPanel: the open call. A dark card docked bottom-right (a
   bottom sheet on phones) that never blocks the page, so a visitor can keep
   browsing products while Anu talks them through it.

   Three faces share the one card: the live call (orb, status sentence, live
   caption, the "Your details" checklist, mute + end), the
   error (reason, retry, WhatsApp fallback) and the summary after hang-up
   (duration, the confirmed details, call again / request a quote). Shares
   `layoutId="anu-morph"` with the launcher and the minimised pill, so each
   morphs into the others.
   ============================================================ */

// Rotating examples shown before the visitor has said anything. Only products
// Ortex actually makes (see prompt.js), so a hint never promises something new.
const HINTS = [
  "“We need 500 branded lanyards for our staff”",
  "“Acrylic trophies for our annual awards”",
  "“Corporate gift hampers for 200 clients”",
  "“Mujhe apne logo ke saath 300 keychains chahiye”",
]

// The five details Anu captures and confirms, in the order she asks for them.
const DETAIL_FIELDS = [
  { key: "name", label: "Name", read: (d) => d.name },
  { key: "phone", label: "WhatsApp", read: (d) => (d.phone ? `+91 ${d.phone.slice(0, 5)} ${d.phone.slice(5)}` : "") },
  { key: "items", label: "Products", read: (d) => (d.items || []).map((i) => [i.quantity, i.product].filter(Boolean).join(" × ")).join(", ") },
  { key: "timeline", label: "Timeline", read: (d) => d.timeline },
  { key: "city", label: "City", read: (d) => d.city },
]
const isDone = (d, f) => Boolean(f.read(d)) && !(d.missing || []).includes(f.key)

function statusFor({ status, speaking, muted, audioBlocked }) {
  if (status === "connecting") return { text: "Connecting you to Anu…", dot: "bg-slate-400", pulse: true }
  if (audioBlocked) return { text: "Sound is paused by your browser", dot: "bg-amber-400", pulse: true }
  if (muted) return { text: "Your microphone is muted", dot: "bg-zinc-400", pulse: false }
  if (speaking) return { text: "Anu is speaking", dot: "bg-violet-400", pulse: true }
  return { text: "Anu is listening", dot: "bg-emerald-400", pulse: true }
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
      className="fixed z-[80] inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-6 sm:bottom-6 md:right-[50px] md:bottom-[50px] sm:w-[384px] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain text-white"
      style={{ borderRadius: 32, background: "rgba(12,13,22,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      {/* Flat surface: one hairline edge, no shadow, no glow */}
      <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-white/[0.08]" />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12, duration: 0.25 } }} className="relative flex flex-col">
        <Header view={view} status={status} seconds={seconds} onMinimize={minimize} onClose={dismiss} />

        <AnimatePresence mode="wait" initial={false}>
          {view === "live" && (
            <motion.div key="live" exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }} className="flex flex-col items-center px-6">
              {/* The orb steps back once there are details to show, so the
                  checklist fits without the card growing past a laptop screen. */}
              <motion.div animate={{ height: lead ? 148 : 196 }} transition={MORPH_SPRING} className="flex w-full items-center justify-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.6, filter: "blur(12px)" }}
                  animate={{ opacity: 1, scale: lead ? 0.74 : 1, filter: "blur(0px)" }}
                  transition={{ ...MORPH_SPRING, delay: 0.1 }}
                >
                  <Orb mood={mood} size={196} readLevel={readLevel} />
                </motion.div>
              </motion.div>
              <StatusLine {...statusFor({ status, speaking, muted, audioBlocked })} />
              {audioBlocked && status === "live"
                ? <SoundPrompt onUnlock={unlockAudio} />
                : <Caption caption={caption} live={status === "live"} />}
              <DetailsCard details={lead} />
              <Controls muted={muted} disabled={status !== "live"} onMute={toggleMute} onEnd={endCall} />
            </motion.div>
          )}

          {view === "error" && (
            <motion.div key="error" {...fadeUp()} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="flex flex-col items-center px-6 pb-6 text-center">
              <Orb mood="error" size={132} />
              <h3 className="mt-2 text-[19px] font-semibold tracking-tight">We couldn't connect your call</h3>
              <p className="mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-white/60">{errorMsg || "Something went wrong. Please try again."}</p>
              <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
                <motion.button whileTap={{ scale: 0.97 }} onClick={start} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-zinc-900 transition hover:bg-white/90">
                  <Refresh2 size={18} variant="Linear" color="currentColor" /> Try again
                </motion.button>
                <a href={whatsappLink("Hello Ortex team, I tried to speak with Anu on your website and would like a quotation.")} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/10 text-[15px] font-semibold text-white transition hover:bg-white/15">
                  <Whatsapp size={18} variant="Bold" color="#4ADE80" /> Chat on WhatsApp
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
        <p className="truncate text-[13px] text-white/50">Product consultant, Ortex · Hindi & English</p>
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
            You can say {HINTS[hint]}
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
        Turn on sound
      </motion.button>
    </div>
  )
}

// What Anu has captured so far, checked by the page rather than taken on her
// word. Collapsed to a progress bar while the call is gathering details; it
// opens by itself once everything is in, so the customer can check the list
// while Anu reads it back.
function DetailsCard({ details }) {
  const [open, setOpen] = useState(false)
  const readyToConfirm = Boolean(details?.complete && !details?.confirmed)
  useEffect(() => { if (readyToConfirm) setOpen(true) }, [readyToConfirm])
  const count = details ? DETAIL_FIELDS.filter((f) => isDone(details, f)).length : 0

  return (
    <AnimatePresence initial={false}>
      {details && (
        <motion.div
          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
          transition={MORPH_SPRING}
          className="w-full overflow-hidden"
        >
          <div className="mt-3 rounded-2xl bg-white/[0.06] ring-1 ring-inset ring-white/10">
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 pt-3 pb-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  Your details
                  <AnimatePresence>
                    {details.confirmed && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                        transition={MORPH_SPRING}
                        className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300"
                      >
                        Confirmed
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="block text-[12px] tabular-nums text-white/50">{count} of {DETAIL_FIELDS.length} captured</span>
              </span>
              <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="text-white/50">
                <ArrowDown2 size={16} variant="Linear" color="currentColor" />
              </motion.span>
            </button>
            <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className="h-full rounded-full bg-emerald-400"
                initial={false}
                animate={{ width: `${(count / DETAIL_FIELDS.length) * 100}%` }}
                transition={{ duration: 0.6, ease: EASE }}
              />
            </div>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="overflow-hidden"
                >
                  <DetailList details={details} className="px-4 pb-3.5" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// One row per detail: a tick when the page has accepted it, amber text when
// something was heard but still needs checking (a product with no quantity),
// "Pending" when nothing is in yet.
function DetailList({ details, className = "" }) {
  return (
    <ul className={`space-y-1.5 text-left ${className}`}>
      {DETAIL_FIELDS.map((f) => {
        const done = isDone(details, f)
        const value = f.read(details)
        return (
          <li key={f.key} className="flex items-start gap-2.5 text-[13px] leading-snug">
            <span className="mt-px grid h-4 w-4 flex-none place-items-center">
              <AnimatePresence mode="wait" initial={false}>
                {done ? (
                  <motion.span key="done" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={MORPH_SPRING}>
                    <TickCircle size={16} variant="Bold" color="#34D399" />
                  </motion.span>
                ) : (
                  <motion.span key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="block h-3.5 w-3.5 rounded-full border border-dashed border-white/30" />
                )}
              </AnimatePresence>
            </span>
            <span className="w-[68px] flex-none text-white/45">{f.label}</span>
            <span className={`min-w-0 flex-1 break-words ${done ? "text-white/90" : value ? "text-amber-200/80" : "text-white/35"}`}>
              {value || "Pending"}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function Controls({ muted, disabled, onMute, onEnd }) {
  return (
    <motion.div {...fadeUp(0.18)} className="mt-4 mb-6 flex w-full items-center justify-center gap-3">
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
  const d = ended.lead
  return (
    <motion.div {...fadeUp()} exit={{ opacity: 0, transition: { duration: 0.15 } }} className="flex flex-col items-center px-6 pb-6 text-center">
      <Orb mood="ended" size={104} />
      <h3 className="mt-1 text-[19px] font-semibold tracking-tight">Call ended</h3>
      <p className="mt-1 text-[14px] tabular-nums text-white/50">Call duration {mmss(ended.seconds)}</p>

      <motion.div {...fadeUp(0.12)} className="mt-5 w-full rounded-2xl bg-white/[0.06] p-4 text-left ring-1 ring-inset ring-white/10">
        {d ? (
          <>
            <div className="flex gap-3">
              <TickCircle size={22} variant="Bold" color="#34D399" className="mt-0.5 flex-none" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold">Thank you, {d.name}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-white/55">
                  {d.complete
                    ? "Our team will share a free design mockup and your quotation on WhatsApp, usually within one working day."
                    : "Our team will contact you on WhatsApp to complete the remaining details and prepare your quotation."}
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-white/10 pt-3">
              <DetailList details={d} />
            </div>
          </>
        ) : (
          <div>
            <p className="text-[14px] font-semibold">Would you like a written quotation?</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-white/55">Share your requirement through our quote form, or call Anu again whenever it suits you.</p>
          </div>
        )}
      </motion.div>

      <motion.div {...fadeUp(0.2)} className="mt-4 grid w-full grid-cols-2 gap-2.5">
        <motion.button whileTap={{ scale: 0.97 }} onClick={onAgain} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-semibold text-zinc-900 transition hover:bg-white/90">
          <Microphone2 size={18} variant="Bold" color="currentColor" /> Call again
        </motion.button>
        <Link to="/quote" onClick={onClose} className="inline-flex h-12 items-center justify-center rounded-full bg-white/10 text-[15px] font-semibold text-white transition hover:bg-white/15">
          Request a quote
        </Link>
      </motion.div>
    </motion.div>
  )
}
