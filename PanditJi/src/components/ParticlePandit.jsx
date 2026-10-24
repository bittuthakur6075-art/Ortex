import { useEffect, useRef } from "react"
import { FACE_REGIONS, FACE_SIZE, PANDIT_SVG, SYMBOLS } from "./panditFace"

/* ============================================================
   ParticlePandit: Pandit Ji's face as a living point cloud, in the style of
   the Epiminds hero avatar. His portrait (panditFace.js) is rasterised once
   and sampled into a few thousand particles whose density follows the
   portrait's brightness. They are drawn with additive blending, so dense
   areas glow like diya light.

   - On mount the particles fly in from a scattered cloud and form the face.
   - The jaw region drops with the loudness of his real voice (readLevel).
   - The eyes squash shut for a blink every few seconds.
   - The head sways while he speaks and breathes while he listens.
   - Particles part around the pointer and drift back.
   - Sacred symbols (ॐ, श्री, a diya, a kalash) float around him as smaller
     particle clusters.

   Canvas 2D, no WebGL: particles are batched into colour/alpha buckets and
   drawn as one path per bucket, which keeps ~8,000 points at 60 fps on a
   laptop. Drawing stops while the tab is hidden.
   ============================================================ */

const FACE_PARTICLES = 9000
const SYMBOL_PARTICLES = 260
const ASSEMBLE_MS = 2200
const POINTER_RADIUS = 70
const ALPHA_STEPS = 8
// Warm diya palette: deep saffron to near-white gold, plus the tilak red.
const PALETTE = [
  [150, 62, 14], [196, 92, 22], [226, 124, 36], [244, 158, 58],
  [252, 188, 92], [255, 210, 130], [255, 228, 170], [255, 242, 214],
]
const RED = PALETTE.length

const easeOut = (p) => 1 - Math.pow(1 - p, 3)

function loadSvg(markup) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  })
}

// Weighted sampling of a canvas: brighter, more opaque pixels get more points.
function sample(ctx, size, target, step = 2) {
  const { data } = ctx.getImageData(0, 0, size, size)
  const cand = []
  let total = 0
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const i = (y * size + x) * 4
      const a = data[i + 3] / 255
      if (a < 0.1) continue
      const r = data[i], g = data[i + 1], b = data[i + 2]
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
      // Strong contrast: lit areas fill in, shadows stay almost empty.
      const w = a * Math.pow(0.04 + 0.96 * lum, 2.4)
      const red = r > 170 && g < 90 && b < 90
      const saffron = !red && r > 180 && b < 80 && r - b > 120
      cand.push({ x, y, lum, w, red, saffron })
      total += w
    }
  }
  const k = target / total
  const out = []
  for (const c of cand) {
    if (Math.random() < c.w * k) {
      out.push({
        hx: c.x + (Math.random() - 0.5) * step,
        hy: c.y + (Math.random() - 0.5) * step,
        colour: c.red ? RED : c.saffron ? 3 : Math.min(PALETTE.length - 1, Math.floor(c.lum * PALETTE.length)),
        bright: 0.35 + c.lum * 0.65,
      })
    }
  }
  return out
}

function drawSymbol(ctx, s, size) {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = "#fff"
  ctx.strokeStyle = "#fff"
  if (s.glyph) {
    ctx.font = `700 ${size * 0.62}px "Noto Serif Devanagari", serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(s.glyph, size / 2, size * 0.56)
  } else if (s.draw === "diya") {
    ctx.beginPath()
    ctx.ellipse(size / 2, size * 0.66, size * 0.36, size * 0.14, 0, 0, Math.PI)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(size / 2, size * 0.18)
    ctx.quadraticCurveTo(size * 0.66, size * 0.44, size / 2, size * 0.6)
    ctx.quadraticCurveTo(size * 0.34, size * 0.44, size / 2, size * 0.18)
    ctx.fill()
  } else if (s.draw === "kalash") {
    ctx.beginPath()
    ctx.arc(size / 2, size * 0.62, size * 0.26, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillRect(size * 0.38, size * 0.3, size * 0.24, size * 0.1)
    ctx.beginPath()
    ctx.arc(size / 2, size * 0.2, size * 0.1, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = size * 0.04
    for (const dx of [-0.16, 0, 0.16]) {
      ctx.beginPath()
      ctx.moveTo(size / 2, size * 0.3)
      ctx.quadraticCurveTo(size * (0.5 + dx * 1.5), size * 0.2, size * (0.5 + dx * 2), size * 0.26)
      ctx.stroke()
    }
  }
}

// align: where the face sits across the tile, 0 = left, 0.5 = centre, 1 = right.
// It glides to a new value, so the face moves aside smoothly for a panel.
export default function ParticlePandit({ readLevel, speaking = false, active = true, align = 0.5, className = "" }) {
  const canvasRef = useRef(null)
  const speakingRef = useRef(speaking)
  const readRef = useRef(readLevel)
  const activeRef = useRef(active)
  const alignRef = useRef(align)
  alignRef.current = align
  speakingRef.current = speaking
  readRef.current = readLevel
  activeRef.current = active

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    let raf = 0
    let cancelled = false
    let face = []
    let symbols = []
    let w = 0
    let h = 0
    let dpr = 1
    const pointer = { x: -1e4, y: -1e4 }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const r = canvas.getBoundingClientRect()
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
    }
    const onLeave = () => {
      pointer.x = -1e4
      pointer.y = -1e4
    }
    canvas.addEventListener("pointermove", onMove)
    canvas.addEventListener("pointerleave", onLeave)

    // Build the clouds once the Devanagari font is ready for the glyphs.
    ;(async () => {
      const off = document.createElement("canvas")
      off.width = off.height = FACE_SIZE
      const octx = off.getContext("2d", { willReadFrequently: true })
      octx.drawImage(await loadSvg(PANDIT_SVG), 0, 0, FACE_SIZE, FACE_SIZE)
      face = sample(octx, FACE_SIZE, FACE_PARTICLES).map((p) => ({
        ...p,
        // Start scattered, then assemble into the face.
        sx: Math.random() * FACE_SIZE * 1.6 - FACE_SIZE * 0.3,
        sy: Math.random() * FACE_SIZE * 1.6 - FACE_SIZE * 0.3,
        phase: Math.random() * Math.PI * 2,
        delay: Math.random() * 600,
        ox: 0,
        oy: 0,
        jaw: p.hx > FACE_REGIONS.jaw.x0 && p.hx < FACE_REGIONS.jaw.x1 && p.hy > FACE_REGIONS.jaw.y0 && p.hy < FACE_REGIONS.jaw.y1,
        eye: FACE_REGIONS.eyes.find((e) => ((p.hx - e.cx) / e.rx) ** 2 + ((p.hy - e.cy) / e.ry) ** 2 < 1) || null,
      }))

      await document.fonts?.load(`700 80px "Noto Serif Devanagari"`).catch(() => {})
      const S = 120
      const sc = document.createElement("canvas")
      sc.width = sc.height = S
      const sctx = sc.getContext("2d", { willReadFrequently: true })
      symbols = SYMBOLS.map((s, i) => {
        drawSymbol(sctx, s, S)
        return {
          points: sample(sctx, S, SYMBOL_PARTICLES, 2).map((p) => ({ ...p, phase: Math.random() * Math.PI * 2 })),
          // Positions spread around the edges of the tile, away from the face.
          ax: [0.08, 0.9, 0.16, 0.86, 0.06, 0.94][i],
          ay: [0.18, 0.2, 0.74, 0.7, 0.46, 0.46][i],
          scale: 0.55 + Math.random() * 0.35,
          speed: 0.15 + Math.random() * 0.2,
          phase: Math.random() * Math.PI * 2,
        }
      })
      if (!cancelled) start()
    })().catch((err) => console.warn("[Pandit Ji] avatar could not be built", err))

    const buckets = Array.from({ length: (PALETTE.length + 1) * ALPHA_STEPS }, () => [])
    const fills = buckets.map((_, i) => {
      const c = Math.floor(i / ALPHA_STEPS)
      const a = ((i % ALPHA_STEPS) + 1) / ALPHA_STEPS
      const [r, g, b] = c === RED ? [255, 70, 50] : PALETTE[c]
      return `rgba(${r},${g},${b},${a.toFixed(3)})`
    })
    const put = (colour, alpha, x, y, s) => {
      const a = Math.max(0, Math.min(ALPHA_STEPS - 1, Math.floor(alpha * ALPHA_STEPS)))
      buckets[colour * ALPHA_STEPS + a].push(x, y, s)
    }

    let level = 0
    let along = alignRef.current
    let nextBlink = performance.now() + 2500
    let t0 = performance.now()

    const frame = (now) => {
      if (cancelled) return
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const t = (now - t0) / 1000
      const talking = speakingRef.current
      const target = talking ? readRef.current?.() || 0 : 0
      level += (target - level) * (target > level ? 0.45 : 0.15)

      // Blink: 0..1..0 over 160 ms every 2.5 to 6 s.
      let blink = 0
      if (now > nextBlink) {
        const p = (now - nextBlink) / 160
        blink = p < 1 ? Math.sin(p * Math.PI) : 0
        if (p >= 1) nextBlink = now + 2500 + Math.random() * 3500
      }

      const scale = Math.min(w / FACE_SIZE, h / FACE_SIZE) * 0.92
      along += (alignRef.current - along) * 0.06
      const fx = (w - FACE_SIZE * scale) * along
      const fy = h - FACE_SIZE * scale
      const sway = reduce ? 0 : talking ? Math.sin(t * 1.7) * 0.028 + level * 0.02 : Math.sin(t * 0.8) * 0.01
      const cos = Math.cos(sway)
      const sin = Math.sin(sway)
      const { x: px, y: py } = FACE_REGIONS.pivot
      const breathe = 1 + Math.sin(t * 1.3) * 0.004 + level * 0.012
      const glow = activeRef.current ? 1 : 0.8
      const size = Math.max(1, 1.1 * dpr)

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Aura behind him, swelling with his voice.
      const cx = (fx + FACE_SIZE * scale / 2) * dpr
      const cy = (fy + 200 * scale) * dpr
      const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260 * scale * dpr)
      aura.addColorStop(0, `rgba(240,140,40,${0.16 + level * 0.22})`)
      aura.addColorStop(1, "rgba(240,140,40,0)")
      ctx.fillStyle = aura
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const b of buckets) b.length = 0

      for (const p of face) {
        const k = easeOut(Math.min(1, Math.max(0, (now - t0 - p.delay) / ASSEMBLE_MS)))
        let x = p.hx
        let y = p.hy
        if (p.jaw) y += level * 11 * (1 - Math.abs(p.hx - 200) / 60)
        if (p.eye && blink) y = p.eye.cy + (y - p.eye.cy) * (1 - blink * 0.9)
        // Drift: a slow, small orbit per particle.
        if (!reduce) {
          x += Math.sin(t * 0.9 + p.phase) * 0.9
          y += Math.cos(t * 0.7 + p.phase * 1.3) * 0.9
        }
        // Sway around the neck, then breathe.
        const dx = (x - px) * breathe
        const dy = (y - py) * breathe
        x = px + dx * cos - dy * sin
        y = py + dx * sin + dy * cos
        x = x * k + p.sx * (1 - k)
        y = y * k + p.sy * (1 - k)
        let sx = fx + x * scale
        let sy = fy + y * scale
        // Part around the pointer, easing back when it leaves.
        const ddx = sx - pointer.x
        const ddy = sy - pointer.y
        const d2 = ddx * ddx + ddy * ddy
        let tx = 0
        let ty = 0
        if (d2 < POINTER_RADIUS * POINTER_RADIUS) {
          const d = Math.sqrt(d2) || 1
          const f = (POINTER_RADIUS - d) / POINTER_RADIUS
          tx = (ddx / d) * f * 26
          ty = (ddy / d) * f * 26
        }
        p.ox += (tx - p.ox) * 0.12
        p.oy += (ty - p.oy) * 0.12
        sx += p.ox
        sy += p.oy
        const twinkle = reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 2.2 + p.phase * 3)
        put(p.colour, p.bright * twinkle * glow * (0.85 + level * 0.4), sx * dpr, sy * dpr, size * (p.bright > 0.85 ? 1.35 : 1))
      }

      for (const s of symbols) {
        const ox = s.ax * w + Math.sin(t * s.speed + s.phase) * 18
        const oy = s.ay * h + Math.cos(t * s.speed * 0.8 + s.phase) * 22
        const rot = Math.sin(t * s.speed * 0.6 + s.phase) * 0.3
        const sc = s.scale * Math.min(1, Math.min(w, h) / 500)
        const rc = Math.cos(rot)
        const rs = Math.sin(rot)
        for (const p of s.points) {
          const lx = (p.hx - 60) * sc
          const ly = (p.hy - 60) * sc
          const x = ox + lx * rc - ly * rs + Math.sin(t + p.phase) * 0.8
          const y = oy + lx * rs + ly * rc + Math.cos(t * 0.8 + p.phase) * 0.8
          put(Math.min(p.colour, 4), 0.32 * glow * (0.7 + 0.3 * Math.sin(t * 2 + p.phase)), x * dpr, y * dpr, size)
        }
      }

      ctx.globalCompositeOperation = "lighter"
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i]
        if (!b.length) continue
        ctx.fillStyle = fills[i]
        ctx.beginPath()
        for (let j = 0; j < b.length; j += 3) ctx.rect(b[j], b[j + 1], b[j + 2], b[j + 2])
        ctx.fill()
      }
      ctx.globalCompositeOperation = "source-over"
    }

    const start = () => {
      t0 = performance.now()
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener("pointermove", onMove)
      canvas.removeEventListener("pointerleave", onLeave)
    }
  }, [])

  return <canvas ref={canvasRef} role="img" aria-label="Pandit Ji" className={`block h-full w-full ${className}`} />
}
