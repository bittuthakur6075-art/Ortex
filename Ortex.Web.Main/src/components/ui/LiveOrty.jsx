import { useEffect, useRef } from "react"
import { LayoutGroup, MotionConfig } from "framer-motion"
import { useLiveSession } from "./live-orty/useLiveSession"
import CallPanel from "./live-orty/CallPanel"
import MiniCall from "./live-orty/MiniCall"
import Launcher from "./live-orty/Launcher"
import { primeTurnstile } from "./live-orty/turnstile"

/* ============================================================
   Live Orty: realtime VOICE assistant (Gemini Live API), "Anu" on screen.

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
  const rootRef = useRef(null)
  // Whether keyboard focus was last inside the widget. Each shape replaces the
  // one before it, so the focused button is removed and focus falls to <body>;
  // a keyboard or screen-reader user then had to tab through the whole page to
  // reach End call. A removed element fires no focusin elsewhere, so this still
  // holds the last answer when the shape changes.
  const focusInsideRef = useRef(false)
  const shape = !open ? (showLauncher ? "launcher" : "none") : minimized ? "mini" : ended ? "ended" : status === "error" ? "error" : "panel"

  // Solve the bot check in the background now, so a token is waiting before the
  // auto-open (a no-op without a Turnstile site key).
  useEffect(() => { primeTurnstile() }, [])

  useEffect(() => {
    const onFocus = (e) => { focusInsideRef.current = Boolean(rootRef.current?.contains(e.target)) }
    document.addEventListener("focusin", onFocus)
    return () => document.removeEventListener("focusin", onFocus)
  }, [])

  // Move focus to the new shape's main control, but only when the change came
  // from inside the widget: an auto-opened call never steals focus from the page.
  useEffect(() => {
    if (!focusInsideRef.current) return
    const active = document.activeElement
    if (active && active !== document.body && rootRef.current?.contains(active)) return
    const t = window.setTimeout(() => rootRef.current?.querySelector("[data-anu-primary]")?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [shape])

  // Esc tucks a live call away instead of hanging up on the customer. Not when
  // another dialog on the page took the key (a photo lightbox, the menu), so
  // closing one of those does not also shrink the call.
  useEffect(() => {
    if (!open || minimized || ended || status === "error") return
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      const other = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
        .some((el) => !rootRef.current?.contains(el) && el.getClientRects().length > 0)
      if (other) return
      minimize()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, minimized, ended, status, minimize])

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id="anu">
        {/* No box of its own: every shape is position: fixed. */}
        <div ref={rootRef} data-anu-widget>
          {open ? (
            minimized ? <MiniCall call={call} /> : <CallPanel call={call} />
          ) : showLauncher ? (
            <Launcher onOpen={call.openCall} />
          ) : null}
        </div>
      </LayoutGroup>
    </MotionConfig>
  )
}
