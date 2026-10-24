// Pandit Ji's portrait as SVG markup, in a 400 x 400 frame. It is never shown
// as is: ParticlePandit rasterises it and samples it into a point cloud, so
// LIGHT here becomes particle DENSITY there. That is why the portrait is lit
// like a photograph (dark eye sockets, lit forehead, cheekbones and nose,
// individual beard strands): flat colours would come out as a flat blob.
// FACE_REGIONS name the parts that move.

export const FACE_SIZE = 400

export const FACE_REGIONS = {
  // Lower lip and the beard below the mouth: drops with his voice.
  jaw: { x0: 150, x1: 250, y0: 256, y1: 316 },
  // Eyes: close for a blink.
  eyes: [{ cx: 170, cy: 196, rx: 16, ry: 11 }, { cx: 230, cy: 196, rx: 16, ry: 11 }],
  // Head pivot for the sway.
  pivot: { x: 200, y: 270 },
}

// Deterministic pseudo-random numbers, so the beard is the same on every load.
function rng(seed) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// Fine white strands following the beard, moustache and side hair.
function strands() {
  const r = rng(7)
  const out = []
  // Beard: from under the cheeks and mouth, falling down to the chin.
  for (let i = 0; i < 140; i++) {
    const u = r()
    const x0 = 140 + u * 120
    const y0 = 222 + Math.abs(u - 0.5) * -30 + r() * 30
    const len = 30 + (1 - Math.abs(u - 0.5) * 2) * 46 + r() * 10
    const bend = (u - 0.5) * -24
    out.push(`<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} q${(bend / 2).toFixed(1)} ${(len / 2).toFixed(1)} ${bend.toFixed(1)} ${len.toFixed(1)}" stroke="#fff" stroke-opacity="${(0.45 + r() * 0.55).toFixed(2)}" stroke-width="${(1 + r() * 1.4).toFixed(1)}" fill="none" stroke-linecap="round"/>`)
  }
  // Side hair over the ears.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const x0 = 200 + side * (58 + r() * 14)
      const y0 = 112 + r() * 70
      out.push(`<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} q${(side * 6).toFixed(1)} 12 ${(side * 4).toFixed(1)} ${(22 + r() * 10).toFixed(1)}" stroke="#fff" stroke-opacity="${(0.5 + r() * 0.5).toFixed(2)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`)
    }
  }
  return out.join("")
}

export const PANDIT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<defs>
  <radialGradient id="face" cx="50%" cy="38%" r="62%">
    <stop offset="0" stop-color="#f2c79e"/><stop offset="0.55" stop-color="#c58a5c"/><stop offset="1" stop-color="#5e3820"/>
  </radialGradient>
  <linearGradient id="kurta" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#f4f2ec"/><stop offset="1" stop-color="#6f6b63"/>
  </linearGradient>
  <linearGradient id="sash" x1="0" x2="1" y1="0" y2="1">
    <stop offset="0" stop-color="#ffc21a"/><stop offset="1" stop-color="#b86a00"/>
  </linearGradient>
  <radialGradient id="socket" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#3a2212" stop-opacity="0.9"/><stop offset="1" stop-color="#3a2212" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="lit" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#ffe2c2" stop-opacity="0.9"/><stop offset="1" stop-color="#ffe2c2" stop-opacity="0"/>
  </radialGradient>
</defs>
<path d="M40 400 C52 326 108 296 160 288 L240 288 C292 296 348 326 360 400 Z" fill="url(#kurta)"/>
<path d="M120 340 C130 360 136 380 138 400 M282 340 C272 362 268 382 266 400" stroke="#3c3934" stroke-width="3" fill="none"/>
<path d="M222 292 C264 298 304 318 322 348 L304 400 L250 400 C246 360 234 322 214 298 Z" fill="url(#sash)"/>
<path d="M214 298 C234 322 246 360 250 400" stroke="#d01c1c" stroke-width="6" fill="none"/>
<path d="M150 294 C176 330 212 362 264 400" stroke="#ffffff" stroke-width="2.5" fill="none"/>
<path d="M172 262 L172 300 C186 312 214 312 228 300 L228 262 Z" fill="#6e4528"/>
<path d="M158 300 C176 332 224 332 242 300" stroke="#ffd58a" stroke-width="5" stroke-dasharray="2 6" stroke-linecap="round" fill="none"/>
<ellipse cx="126" cy="205" rx="12" ry="22" fill="#8a5a38"/>
<ellipse cx="274" cy="205" rx="12" ry="22" fill="#8a5a38"/>
<path d="M130 175 C130 120 162 92 200 92 C238 92 270 120 270 175 L270 215 C270 262 240 292 200 292 C160 292 130 262 130 215 Z" fill="url(#face)"/>
<ellipse cx="200" cy="128" rx="48" ry="24" fill="url(#lit)"/>
<ellipse cx="166" cy="226" rx="20" ry="12" fill="url(#lit)" opacity="0.8"/>
<ellipse cx="234" cy="226" rx="20" ry="12" fill="url(#lit)" opacity="0.8"/>
<path d="M200 168 L200 222" stroke="#ffe0bd" stroke-width="7" stroke-linecap="round" opacity="0.8"/>
<ellipse cx="170" cy="196" rx="26" ry="17" fill="url(#socket)"/>
<ellipse cx="230" cy="196" rx="26" ry="17" fill="url(#socket)"/>
<path d="M196 92 C192 80 200 72 210 74 C204 80 204 86 206 92 Z" fill="#ffffff"/>
<path d="M176 140 L224 140" stroke="#fff3d6" stroke-width="4" stroke-linecap="round"/>
<path d="M179 150 L221 150" stroke="#fff3d6" stroke-width="4" stroke-linecap="round"/>
<path d="M200 124 L200 166" stroke="#ff2a1a" stroke-width="7" stroke-linecap="round"/>
<path d="M150 178 C162 168 178 168 188 175" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none"/>
<path d="M212 175 C222 168 238 168 250 178" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none"/>
<path d="M157 198 Q170 189 183 198 Q170 204 157 198 Z" fill="#d9cdbb"/>
<path d="M217 198 Q230 189 243 198 Q230 204 217 198 Z" fill="#d9cdbb"/>
<path d="M156 197 Q170 186 184 197" stroke="#3a2212" stroke-width="2.5" fill="none"/>
<path d="M216 197 Q230 186 244 197" stroke="#3a2212" stroke-width="2.5" fill="none"/>
<circle cx="171" cy="197.5" r="4.2" fill="#0d0704"/>
<circle cx="229" cy="197.5" r="4.2" fill="#0d0704"/>
<circle cx="172.5" cy="196" r="1.4" fill="#ffffff"/>
<circle cx="230.5" cy="196" r="1.4" fill="#ffffff"/>
<path d="M158 206 Q170 212 182 206 M218 206 Q230 212 242 206" stroke="#ffe0bd" stroke-width="2" fill="none" opacity="0.7"/>
<path d="M190 232 C194 238 206 238 210 232" stroke="#4a2a16" stroke-width="3" stroke-linecap="round" fill="none"/>
<path d="M134 214 C138 262 162 300 200 310 C238 300 262 262 266 214 C254 236 238 248 222 250 L178 250 C162 248 146 236 134 214 Z" fill="#d9d5cc"/>
<path d="M128 190 C122 150 134 118 156 104 C146 126 142 152 144 186 Z" fill="#d9d5cc"/>
<path d="M272 190 C278 150 266 118 244 104 C254 126 258 152 256 186 Z" fill="#d9d5cc"/>
${strands()}
<ellipse cx="200" cy="259" rx="12" ry="3" fill="#0d0704"/>
<path d="M166 249 C180 235 192 237 200 244 C208 237 220 235 234 249 C222 254 210 251 200 249 C190 251 178 254 166 249 Z" fill="#ffffff"/>
</svg>`

// Floating sacred symbols around him, each drawn on a small canvas and sampled
// the same way. Glyphs use the page's Devanagari font.
export const SYMBOLS = [
  { glyph: "ॐ" },
  { glyph: "श्री" },
  { glyph: "ॐ" },
  { draw: "diya" },
  { draw: "kalash" },
  { glyph: "॥" },
]
