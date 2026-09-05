// Regenerate the native launcher icons from one master PNG.
//
//   npm run icons
//
// assets/app-icon-1000.png is the source of truth — the Ortex "O" on the brand
// blue. Everything this writes is generated; never hand-edit the files under
// android/app/src/main/res/mipmap-* or ios/.../AppIcon.appiconset.
//
// Box-filter downscale in pure JS (pngjs). A native resizer would be marginally
// sharper but pulls a platform-specific binary in for a job that runs about
// once a year.
//
// Two platform rules worth knowing, both of which bite silently:
//   * iOS icons must carry NO alpha channel — the App Store rejects the 1024px
//     marketing icon if it has one — so those are written as RGB, flattened on
//     the brand blue.
//   * Android's ic_launcher_round is a genuinely circular asset, not a square
//     one the launcher masks, so it gets a circular alpha cut.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { PNG } from "pngjs"

const here = dirname(fileURLToPath(import.meta.url))
const at = (p) => `${here}/../${p}`

const BRAND = [47, 80, 228] // #2F50E4 — the icon's own background

// Android launcher densities.
const ANDROID = [
  ["mipmap-mdpi", 48],
  ["mipmap-hdpi", 72],
  ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144],
  ["mipmap-xxxhdpi", 192],
]

// iOS slots, mirroring AppIcon.appiconset/Contents.json. 40 and 120 appear
// twice at different idioms; Xcode wants one file per entry, so each carries
// its own name.
const IOS = [
  { size: 20, scale: 2, idiom: "iphone" },
  { size: 20, scale: 3, idiom: "iphone" },
  { size: 29, scale: 2, idiom: "iphone" },
  { size: 29, scale: 3, idiom: "iphone" },
  { size: 40, scale: 2, idiom: "iphone" },
  { size: 40, scale: 3, idiom: "iphone" },
  { size: 60, scale: 2, idiom: "iphone" },
  { size: 60, scale: 3, idiom: "iphone" },
  { size: 1024, scale: 1, idiom: "ios-marketing" },
]

/** Average every source pixel falling inside a destination pixel. */
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
          r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; a += src.data[i + 3]; n++
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

/** Cut a circle out of a square icon, anti-aliased at the rim. */
function circular(png) {
  const out = new PNG({ width: png.width, height: png.height })
  png.data.copy(out.data)
  const c = (png.width - 1) / 2
  const r = png.width / 2
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const d = Math.hypot(x - c, y - c)
      const i = (y * png.width + x) << 2
      // One-pixel feather so the rim isn't a staircase.
      const cover = d <= r - 1 ? 1 : d >= r ? 0 : r - d
      out.data[i + 3] = Math.round(out.data[i + 3] * cover)
    }
  }
  return out
}

/** Flatten onto the brand colour and drop the alpha channel (iOS requirement). */
function opaque(png) {
  const out = new PNG({ width: png.width, height: png.height })
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255
    out.data[i] = Math.round(png.data[i] * a + BRAND[0] * (1 - a))
    out.data[i + 1] = Math.round(png.data[i + 1] * a + BRAND[1] * (1 - a))
    out.data[i + 2] = Math.round(png.data[i + 2] * a + BRAND[2] * (1 - a))
    out.data[i + 3] = 255
  }
  return out
}

const master = PNG.sync.read(readFileSync(at("assets/app-icon-1000.png")))
if (master.width !== master.height) {
  console.error(`Master icon must be square, got ${master.width}x${master.height}`)
  process.exit(1)
}

// ---- Android ----------------------------------------------------------------
for (const [dir, size] of ANDROID) {
  const target = at(`android/app/src/main/res/${dir}`)
  mkdirSync(target, { recursive: true })
  const square = resize(master, size)
  writeFileSync(`${target}/ic_launcher.png`, PNG.sync.write(square))
  writeFileSync(`${target}/ic_launcher_round.png`, PNG.sync.write(circular(square)))
  console.log(`android ${dir}: ic_launcher + ic_launcher_round (${size}px)`)
}

// ---- iOS --------------------------------------------------------------------
const iosDir = at("ios/OrtexMobile/Images.xcassets/AppIcon.appiconset")
mkdirSync(iosDir, { recursive: true })
const images = []
for (const { size, scale, idiom } of IOS) {
  const px = size * scale
  const filename = `icon-${size}@${scale}x.png`
  // colorType 2 = truecolour, no alpha.
  writeFileSync(`${iosDir}/${filename}`, PNG.sync.write(opaque(resize(master, px)), { colorType: 2 }))
  images.push({ filename, idiom, scale: `${scale}x`, size: `${size}x${size}` })
  console.log(`ios ${filename} (${px}px)`)
}
writeFileSync(
  `${iosDir}/Contents.json`,
  JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2) + "\n",
)
console.log("ios Contents.json")
