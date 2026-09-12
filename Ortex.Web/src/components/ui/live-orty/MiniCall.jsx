import { motion, AnimatePresence } from "framer-motion"
import { ArrowUp2, CallSlash } from "iconsax-react"
import AnuAvatar from "./AnuAvatar"
import { MORPH_SPRING, mmss } from "./shared"

// The call, minimised: a dark pill in the launcher's corner that keeps the
// conversation going while the visitor reads the page. The ring round her face
// still reacts to the voice, so it is obvious the line is open. Tap to expand.
export default function MiniCall({ call }) {
  const { status, speaking, audioBlocked, seconds, readLevel, endCall, expand } = call
  const mood = status === "connecting" ? "connecting" : speaking ? "speaking" : "listening"
  // Any tap on the pill counts as the gesture that unlocks sound (see useLiveSession).
  const label = status === "connecting" ? "Connecting…" : audioBlocked ? "Sound paused" : speaking ? "Speaking" : "Listening"

  return (
    <motion.div
      layoutId="anu-morph"
      transition={MORPH_SPRING}
      className="fixed z-[80] right-4 md:right-[50px] bottom-[calc(1rem+env(safe-area-inset-bottom))] md:bottom-[50px] flex items-center gap-1 p-1.5 pr-2 text-white ring-1 ring-inset ring-white/[0.08]"
      style={{ borderRadius: 9999, background: "rgba(12,13,22,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1 } }} className="flex items-center gap-1">
        <button onClick={expand} aria-label="Open your call with Anu" className="flex items-center gap-2.5 rounded-full py-0.5 pl-0.5 pr-3 transition hover:bg-white/5">
          <AnuAvatar mood={mood} size={44} readLevel={readLevel} />
          <span className="text-left leading-tight">
            <span className="block text-[14px] font-semibold">Anu</span>
            <span className="block text-[12px] tabular-nums text-white/55">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} className="inline-block">
                  {label}
                </motion.span>
              </AnimatePresence>
              {status === "live" && ` · ${mmss(seconds)}`}
            </span>
          </span>
          <ArrowUp2 size={16} variant="Linear" color="currentColor" className="text-white/40" />
        </button>

        <motion.button
          whileTap={{ scale: 0.9 }} onClick={endCall} aria-label="End call"
          className="grid h-10 w-10 place-items-center rounded-full bg-red-500 transition-colors hover:bg-red-600"
        >
          <CallSlash size={18} variant="Bold" color="currentColor" />
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
