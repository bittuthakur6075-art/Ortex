import { motion, AnimatePresence } from "framer-motion"
import { useLiveSession } from "./live-orty/useLiveSession"
import CallPanel from "./live-orty/CallPanel"
import Launcher from "./live-orty/Launcher"

/* ============================================================
   Live Orty — realtime VOICE assistant (Gemini Live API)

   Gemini-style audio UI: a horizontal waveform that reacts to real voice
   frequencies (yours while listening, Orty's while speaking), live captions,
   a call timer, and mute / end controls, in a 600x600 squircle panel docked
   at the centre-bottom of the screen.

   Flow: ephemeral token (orty-live-token Edge Function) → Live WebSocket →
   stream mic as 16 kHz PCM, play Orty's 24 kHz PCM voice back.

   The session lifecycle (token, audio contexts, mic, playback, tool calls,
   lead capture, memory) lives in ./live-orty/useLiveSession; this file only
   composes the scrim, the call panel and the launcher pill.
   ============================================================ */

export default function LiveOrty() {
  const { open, status, speaking, errorMsg, seconds, showLauncher, canvasRef, start, openCall, endCall } = useLiveSession()

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
        <CallPanel
          status={status}
          speaking={speaking}
          mmss={mmss}
          statusLabel={statusLabel}
          canvasRef={canvasRef}
          onEnd={endCall}
          onRetry={start}
        />
      ) : showLauncher ? (
        <Launcher onOpen={openCall} />
      ) : null}
    </>
  )
}
