import { useEffect, useRef, useState } from "react"
import { Sparkles } from "../ui/Icons"
import { cn } from "../../lib/cn"

// Anu's face: her photograph inside a ring that reacts to sound.
//
// The console sibling of Ortex.Web's AnuAvatar and the phone's AnuFace. On a
// voice conversation the only proof the line is open is something that moves
// with your own voice, so the ring swells with the mic while she listens,
// throws soft ripples while she speaks, breathes while connecting, and rests
// still otherwise. Flat strokes in the brand hue, no glow (the console's rule).
// `readLevel()` is polled on this component's own animation frame, so audio
// levels never cause a React render. The photo is optional: without it the
// monogram well shows instead.

export const ANU_PHOTO = "./img/anu.jpg"

const cssColor = (name, alpha) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v ? `hsl(${v} / ${alpha})` : `rgba(47,80,228,${alpha})`
}

export default function AnuFace({ size = 120, mood = "idle", readLevel, className, ring = true }) {
  const canvasRef = useRef(null)
  const [photoOk, setPhotoOk] = useState(true)
  const moodRef = useRef(mood)
  moodRef.current = mood
  const pad = ring ? Math.round(size * 0.22) : 0
  const box = size + pad * 2

  useEffect(() => {
    if (!ring) return
    const canvas = canvasRef.current
    if (!canvas) return
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const dpr = window.devicePixelRatio || 1
    canvas.width = box * dpr
    canvas.height = box * dpr
    const g = canvas.getContext("2d")
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const primary = (a) => cssColor("--primary", a)
    const muted = (a) => cssColor("--muted-foreground", a)
    const danger = (a) => cssColor("--destructive", a)

    let level = 0
    let raf = 0
    const ripples = []
    let lastRipple = 0

    const frame = (ts) => {
      const t = ts / 1000
      const m = moodRef.current
      const live = m === "listening" || m === "speaking" || m === "thinking"
      const reading = live && readLevel ? readLevel() : { level: 0, speaking: false }
      const target = reduce ? 0 : reading.level
      level += (target - level) * 0.25

      g.clearRect(0, 0, box, box)
      const c = box / 2
      const r = size / 2

      if (m === "connecting" && !reduce) {
        // A single arc chasing round the photo: working, not yet open.
        g.lineWidth = 3
        g.strokeStyle = primary(0.85)
        g.lineCap = "round"
        g.beginPath()
        g.arc(c, c, r + 7, t * 4, t * 4 + Math.PI * 0.6)
        g.stroke()
        g.strokeStyle = primary(0.12)
        g.beginPath()
        g.arc(c, c, r + 7, 0, Math.PI * 2)
        g.stroke()
      } else if (m === "error") {
        g.lineWidth = 3
        g.strokeStyle = danger(0.7)
        g.beginPath()
        g.arc(c, c, r + 7, 0, Math.PI * 2)
        g.stroke()
      } else if (live) {
        const speakingNow = reading.speaking || m === "speaking"
        if (speakingNow && level > 0.08 && ts - lastRipple > 380 && !reduce) {
          ripples.push({ born: ts })
          lastRipple = ts
        }
        for (let i = ripples.length - 1; i >= 0; i--) {
          const k = (ts - ripples[i].born) / 1400
          if (k >= 1) { ripples.splice(i, 1); continue }
          g.lineWidth = 2
          g.strokeStyle = primary(0.35 * (1 - k))
          g.beginPath()
          g.arc(c, c, r + 6 + k * pad * 0.9, 0, Math.PI * 2)
          g.stroke()
        }
        // The live ring: thickens and grows with the voice in play.
        const swell = level * pad * 0.55
        g.lineWidth = 3 + level * 4
        g.strokeStyle = speakingNow ? primary(0.9) : m === "thinking" ? primary(0.5) : muted(0.35 + level * 0.5)
        g.beginPath()
        g.arc(c, c, r + 6 + swell, 0, Math.PI * 2)
        g.stroke()
        if (m === "thinking" && !reduce) {
          g.lineWidth = 3
          g.strokeStyle = primary(0.9)
          g.lineCap = "round"
          g.beginPath()
          g.arc(c, c, r + 6, -t * 3, -t * 3 + Math.PI * 0.35)
          g.stroke()
        }
      } else {
        // Idle: a slow breath, so the page reads as ready rather than frozen.
        const breathe = reduce ? 0 : (Math.sin(t * 1.6) + 1) / 2
        g.lineWidth = 2
        g.strokeStyle = primary(0.14 + breathe * 0.12)
        g.beginPath()
        g.arc(c, c, r + 6 + breathe * 3, 0, Math.PI * 2)
        g.stroke()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [box, size, pad, readLevel, ring])

  return (
    <div className={cn("relative flex-none", className)} style={{ width: box, height: box }}>
      {ring && <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />}
      <div
        className="absolute overflow-hidden rounded-full bg-primary/10"
        style={{ left: pad, top: pad, width: size, height: size }}
      >
        {photoOk ? (
          <img src={ANU_PHOTO} alt="Anu" className="h-full w-full object-cover" onError={() => setPhotoOk(false)} draggable={false} />
        ) : (
          <span className="grid h-full w-full place-items-center text-primary">
            <Sparkles style={{ width: size * 0.42, height: size * 0.42 }} />
          </span>
        )}
      </div>
    </div>
  )
}
