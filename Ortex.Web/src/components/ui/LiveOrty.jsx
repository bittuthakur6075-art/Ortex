import { useEffect } from "react"
import { LayoutGroup, MotionConfig } from "framer-motion"
import { useLiveSession } from "./live-orty/useLiveSession"
import CallPanel from "./live-orty/CallPanel"
import MiniCall from "./live-orty/MiniCall"
import Launcher from "./live-orty/Launcher"

/* ============================================================
   Live Orty — realtime VOICE assistant (Gemini Live API), "Anu" on screen.

   One floating object in the bottom-right corner that changes shape with the
   call, never a page-blocking modal:
     Launcher pill  →  CallPanel (live / error / summary)  ⇄  MiniCall pill
   All three share `layoutId="anu-morph"`, so each spring-morphs into the next.
   Anu's face is a canvas orb (./live-orty/Orb) fed by the live audio level.

   Flow: ephemeral token (orty-live-token Edge Function) → Live WebSocket →
   stream mic as 16 kHz PCM, play Orty's 24 kHz PCM voice back. The session
   lifecycle (token, audio, tool calls, lead capture, memory, captions) lives
   in ./live-orty/useLiveSession; this file only picks which shape to show.
   ============================================================ */

export default function LiveOrty() {
  const call = useLiveSession()
  const { open, minimized, status, ended, showLauncher, minimize } = call

  // Esc tucks a live call away instead of hanging up on the customer.
  useEffect(() => {
    if (!open || minimized || ended || status === "error") return
    const onKey = (e) => { if (e.key === "Escape") minimize() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, minimized, ended, status, minimize])

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="anu">
        {open ? (
          minimized ? <MiniCall call={call} /> : <CallPanel call={call} />
        ) : showLauncher ? (
          <Launcher onOpen={call.openCall} />
        ) : null}
      </LayoutGroup>
    </MotionConfig>
  )
}
