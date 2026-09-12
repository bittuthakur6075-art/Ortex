import { useEffect, useRef, useState } from "react"
import Orb from "./Orb"

/* ============================================================
   AnuAvatar: Anu's face on the call. A round photograph inside a ring that
   still carries everything the orb carried: it breathes while connecting,
   swells with the visitor's voice while listening, throws off ripples while
   Anu speaks, and warms red on an error.

   The ring exists because the photo alone is static, and on a voice call the
   only way a caller can tell the line is open is to SEE something react to
   their own voice. So the reactive part is kept and the sphere is replaced.

   If the photo is missing or fails to load, this falls back to the orb rather
   than drawing a broken image, so the widget works with no asset in place.
   ============================================================ */

// Drop a square headshot here to give Anu a face. Anything roughly 512px works;
// it is drawn at most 196px wide. The photo in the repo is from Unsplash
// (unsplash.com/photos/HVbaH3p9B8k, by IMANA), free to use commercially under
// the Unsplash License. That licence covers the PHOTOGRAPH, not the person in
// it: Unsplash does not supply model releases, so presenting an identifiable
// stranger as an Ortex representative is the owner's call to make, and swapping
// in a real colleague's photo (with their consent) is one file change.
export const ANU_PHOTO = "/img/anu.jpg"

// [core, accent] per mood, matching Orb's palette so the two read as one thing.
const RINGS = {
  idle: [[47, 80, 228], [139, 92, 246]],
  connecting: [[100, 116, 139], [79, 70, 229]],
  listening: [[47, 80, 228], [56, 189, 248]],
  speaking: [[99, 102, 241], [192, 132, 252]],
  error: [[190, 45, 45], [239, 68, 68]],
  ended: [[71, 85, 105], [148, 163, 184]],
}

const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const mix = (from, to, k) => from.map((c, i) => c.map((v, j) => v + (to[i][j] - v) * k))

export default function AnuAvatar({ mood = "idle", size = 200, readLevel, className = "" }) {
  const canvasRef = useRef(null)
  const moodRef = useRef(mood)
  const readRef = useRef(readLevel)
  const [failed, setFailed] = useState(false)
  moodRef.current = mood
  readRef.current = readLevel

  // The photo sits inside the ring, so it never covers the reactive edge.
  const photo = Math.round(size * 0.76)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || failed) return
    const ctx = canvas.getContext("2d")
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr

    let raf = 0
    let palette = RINGS[moodRef.current] || RINGS.idle
    let level = 0
    let ripple = 0
    const t0 = performance.now()
    const cx = size / 2
    const cy = size / 2
    // The ring hugs the photo's edge; everything beyond it is halo and ripple.
    const R = photo / 2

    const frame = (now) => {
      const m = moodRef.current
      const t = ((now - t0) / 1000) * (reduce ? 0.3 : 1)
      palette = mix(palette, RINGS[m] || RINGS.idle, 0.06)
      const [core, accent] = palette

      // Loudness: the real signal while live, a slow breath otherwise.
      let target = 0
      if (m === "listening" || m === "speaking") target = readRef.current?.() || 0
      else if (m === "connecting") target = 0.18 + 0.14 * Math.sin(t * 2.4)
      else if (m === "idle") target = 0.08 + 0.05 * Math.sin(t * 1.6)
      level += (target - level) * (target > level ? 0.3 : 0.07)
      ripple += ((m === "speaking" ? 1 : 0) - ripple) * 0.05

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)

      // Halo, so the face lifts off a dark card.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, size * 0.5)
      halo.addColorStop(0, rgba(accent, 0.1 + level * 0.24))
      halo.addColorStop(1, rgba(accent, 0))
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, size, size)

      // Ripples leaving the face while Anu speaks.
      if (!reduce && ripple > 0.01) {
        for (let k = 0; k < 3; k++) {
          const p = (t * 0.55 + k / 3) % 1
          ctx.beginPath()
          ctx.arc(cx, cy, R * (1.05 + p * 0.42), 0, Math.PI * 2)
          ctx.strokeStyle = rgba(accent, (1 - p) * 0.3 * ripple)
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // The ring itself: a gradient stroke whose width follows the voice, with
      // a brighter arc sweeping around it so it reads as alive even in silence.
      const w = Math.max(2, size * (0.014 + level * 0.022))
      const rr = R + w * 0.75
      const g = ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr)
      g.addColorStop(0, rgba(accent, 0.95))
      g.addColorStop(0.5, rgba(core, 0.95))
      g.addColorStop(1, rgba(accent, 0.6))
      ctx.beginPath()
      ctx.arc(cx, cy, rr, 0, Math.PI * 2)
      ctx.strokeStyle = g
      ctx.lineWidth = w
      ctx.stroke()

      if (!reduce) {
        const a0 = t * 1.1
        ctx.beginPath()
        ctx.arc(cx, cy, rr, a0, a0 + Math.PI * (0.35 + level * 0.5))
        ctx.strokeStyle = rgba([255, 255, 255], 0.35 + level * 0.4)
        ctx.lineWidth = w * 0.55
        ctx.lineCap = "round"
        ctx.stroke()
      }

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size, photo, failed])

  // No photo in the build: keep the orb rather than a broken image.
  if (failed) return <Orb mood={mood} size={size} readLevel={readLevel} className={className} />

  return (
    <div className={`relative grid place-items-center ${className}`} style={{ width: size, height: size }}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0" style={{ width: size, height: size }} />
      <img
        src={ANU_PHOTO}
        alt="Anu, your Ortex consultant"
        onError={() => setFailed(true)}
        draggable="false"
        className="relative rounded-full object-cover select-none"
        style={{ width: photo, height: photo }}
      />
    </div>
  )
}
