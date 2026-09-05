// Regenerate the app icon set from one master PNG.
//
//   node scripts/icons.mjs
//
// public/icons/app-icon-1000.png is the source of truth — the Ortex "O" on the
// brand blue, already square with the padding a maskable icon needs. Everything
// else in public/icons/ is generated, so never hand-edit those files.
//
// Box-filter downscale in pure JS via pngjs. A native resizer (sharp) would be
// sharper at the margins but pulls a ~50MB platform-specific binary into the
// install for a job that runs about once a year.

import { readFileSync, writeFileSync } from "node:fs"
import { PNG } from "pngjs"

const SRC = new URL("../public/icons/app-icon-1000.png", import.meta.url)
const OUT = (name) => new URL(`../public/icons/${name}`, import.meta.url)

// 192 and 512 are what Android asks for; 180 is the iOS home-screen size.
const SIZES = [
  { size: 512, name: "app-icon-512.png" },
  { size: 192, name: "app-icon-192.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size: 32, name: "favicon-32.png" },
]

/** Average every source pixel that falls inside a destination pixel. */
function resize(src, size) {
  const out = new PNG({ width: size, height: size })
  const scale = src.width / size
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scale)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale))
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scale)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale))
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) << 2
          r += src.data[i]
          g += src.data[i + 1]
          b += src.data[i + 2]
          a += src.data[i + 3]
          n++
        }
      }
      const o = (y * size + x) << 2
      out.data[o] = Math.round(r / n)
      out.data[o + 1] = Math.round(g / n)
      out.data[o + 2] = Math.round(b / n)
      out.data[o + 3] = Math.round(a / n)
    }
  }
  return out
}

const master = PNG.sync.read(readFileSync(SRC))
if (master.width !== master.height) {
  console.error(`Master icon must be square, got ${master.width}x${master.height}`)
  process.exit(1)
}

for (const { size, name } of SIZES) {
  writeFileSync(OUT(name), PNG.sync.write(resize(master, size)))
  console.log(`wrote public/icons/${name} (${size}x${size})`)
}
