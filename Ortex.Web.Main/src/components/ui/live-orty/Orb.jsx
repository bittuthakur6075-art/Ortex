import { useEffect, useRef } from "react"

/* ============================================================
   Orb: Anu's face. A liquid sphere on a 2D canvas that breathes while
   connecting, swells with the visitor's voice while listening, throws off
   ripples while Anu speaks, greys out when muted and warms red on an error.

   It runs its own animation frame and pulls loudness through `readLevel`
   (0..1), so the call hook never re-renders per frame. Colours tween between
   states rather than snapping, so a state change reads as a mood shift.
   ============================================================ */

// [core, accent, highlight] per mood. Core is the Ortex brand blue (#2F50E4).
const PALETTES = {
  idle: [[47, 80, 228], [139, 92, 246], [199, 210, 254]],
  connecting: [[51, 65, 85], [79, 70, 229], [148, 163, 184]],
  listening: [[47, 80, 228], [56, 189, 248], [224, 231, 255]],
  speaking: [[67, 56, 202], [192, 132, 252], [125, 211, 252]],
  muted: [[39, 39, 42], [82, 82, 91], [161, 161, 170]],
  error: [[127, 29, 29], [239, 68, 68], [254, 202, 202]],
  ended: [[30, 41, 59], [71, 85, 105], [148, 163, 184]],
}

const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const mix = (from, to, k) => from.map((c, i) => c.map((v, j) => v + (to[i][j] - v) * k))

export default function Orb({ mood = "idle", size = 200, readLevel, className = "" }) {
  const canvasRef = useRef(null)
  const moodRef = useRef(mood)
  const readRef = useRef(readLevel)
  moodRef.current = mood
  readRef.current = readLevel

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr

    let raf = 0
    let palette = PALETTES[moodRef.current] || PALETTES.idle
    let level = 0
    let ripple = 0
    const t0 = performance.now()
    const cx = size / 2
    const cy = size / 2
    const POINTS = 72

    const frame = (now) => {
      const m = moodRef.current
      const t = ((now - t0) / 1000) * (reduce ? 0.3 : 1)
      palette = mix(palette, PALETTES[m] || PALETTES.idle, 0.06)
      const [core, accent, hi] = palette

      // Loudness: the real signal while live, a slow breath otherwise.
      let target = 0
      if (m === "listening" || m === "speaking") target = readRef.current?.() || 0
      else if (m === "connecting") target = 0.18 + 0.14 * Math.sin(t * 2.4)
      else if (m === "idle") target = 0.08 + 0.05 * Math.sin(t * 1.6)
      level += (target - level) * (target > level ? 0.3 : 0.07)
      ripple += ((m === "speaking" ? 1 : 0) - ripple) * 0.05

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)
      const R = size * 0.3 * (1 + level * 0.16)

      // Halo behind the sphere.
      const halo = ctx.createRadialGradient(cx, cy, R * 0.5, cx, cy, size * 0.5)
      halo.addColorStop(0, rgba(accent, 0.12 + level * 0.22))
      halo.addColorStop(1, rgba(accent, 0))
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, size, size)

      // Ripples leaving the sphere while Anu speaks.
      if (!reduce && ripple > 0.01) {
        for (let k = 0; k < 3; k++) {
          const p = (t * 0.55 + k / 3) % 1
          ctx.beginPath()
          ctx.arc(cx, cy, R * (1.02 + p * 0.62), 0, Math.PI * 2)
          ctx.strokeStyle = rgba(hi, (1 - p) * 0.32 * ripple)
          ctx.lineWidth = 1.5
          ctx.stroke()
        }
      }

      // The liquid outline: a circle wobbled by three slow sine waves whose
      // depth follows the voice.
      const wobble = 0.025 + level * 0.07
      ctx.save()
      ctx.beginPath()
      for (let i = 0; i <= POINTS; i++) {
        const a = (i / POINTS) * Math.PI * 2
        const w = Math.sin(a * 3 + t * 1.3) * wobble + Math.sin(a * 5 - t * 1.9) * wobble * 0.55 + Math.sin(a * 2 + t * 0.7) * wobble * 0.4
        const r = R * (1 + w)
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.clip()

      const body = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R)
      body.addColorStop(0, rgba(hi, 1))
      body.addColorStop(0.45, rgba(core, 1))
      body.addColorStop(1, rgba(core.map((v) => v * 0.45), 1))
      ctx.fillStyle = body
      ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6)

      // Drifting colour clouds inside the sphere.
      ctx.globalCompositeOperation = "screen"
      const clouds = [[accent, 0.7, 0], [hi, 0.45, 2.1], [core, 0.5, 4.2]]
      for (const [c, alpha, phase] of clouds) {
        const bx = cx + Math.cos(t * 0.6 + phase) * R * (0.42 + level * 0.2)
        const by = cy + Math.sin(t * 0.8 + phase) * R * 0.42
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, R * 0.95)
        g.addColorStop(0, rgba(c, alpha))
        g.addColorStop(1, rgba(c, 0))
        ctx.fillStyle = g
        ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6)
      }
      ctx.globalCompositeOperation = "source-over"

      // Glassy highlight, top-left.
      const spec = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.45, 0, cx - R * 0.38, cy - R * 0.45, R * 0.7)
      spec.addColorStop(0, "rgba(255,255,255,0.55)")
      spec.addColorStop(1, "rgba(255,255,255,0)")
      ctx.fillStyle = spec
      ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6)
      ctx.restore()

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [size])

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={{ width: size, height: size }} />
}
