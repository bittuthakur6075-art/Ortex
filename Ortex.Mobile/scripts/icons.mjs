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

/**
 * Coverage (0..1) of a pixel by a rounded square of side `size` with corner
 * radius `r`, inset by `pad` on every side. 4x4 supersampled so the corner is
 * anti-aliased rather than a staircase.
 */
function roundedCover(x, y, size, r, pad = 0) {
  const lo = pad
  const hi = size - pad
  let hits = 0
  for (let sy = 0; sy < 4; sy++) {
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4
      const py = y + (sy + 0.5) / 4
      if (px < lo || px > hi || py < lo || py > hi) continue
      // Distance into the nearest corner's quarter-circle, if in a corner box.
      const cx = px < lo + r ? lo + r : px > hi - r ? hi - r : px
      const cy = py < lo + r ? lo + r : py > hi - r ? hi - r : py
      if (Math.hypot(px - cx, py - cy) <= r) hits++
    }
  }
  return hits / 16
}

/**
 * Round the corners of a square icon: transparent outside a rounded square.
 * CORNER is the share of the side taken by the radius — 22.5%, the proportion
 * iOS and One UI use for their own icon shape, so the icon reads as native on
 * a launcher that does not mask it (legacy Android, some Xiaomi/Oppo skins).
 */
const CORNER = 0.225
function rounded(png) {
  const out = new PNG({ width: png.width, height: png.height })
  png.data.copy(out.data)
  const r = png.width * CORNER
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) << 2
      out.data[i + 3] = Math.round(out.data[i + 3] * roundedCover(x, y, png.width, r))
    }
  }
  return out
}

/**
 * How WHITE each master pixel is, 0 on the brand blue and 1 on the glyph. The
 * master is only those two colours plus their anti-aliased blend, and the red
 * channel separates them most (47 vs 255).
 */
const whiteness = (src, i) => Math.min(1, Math.max(0, (src.data[i] - BRAND[0]) / (255 - BRAND[0])))

/**
 * The glyph alone — white "O" on transparent — scaled to `scale` of a `size`
 * canvas and centred. Used for the adaptive icon's foreground and monochrome
 * layers, where the launcher supplies the background and the shape.
 */
function glyphLayer(masterPng, size, scale) {
  const inner = Math.round(size * scale)
  const glyph = resize(masterPng, inner)
  const out = new PNG({ width: size, height: size }) // zero-filled = transparent
  const off = Math.floor((size - inner) / 2)
  for (let y = 0; y < inner; y++) {
    for (let x = 0; x < inner; x++) {
      const s = (y * inner + x) << 2
      const o = ((y + off) * size + (x + off)) << 2
      out.data[o] = 255
      out.data[o + 1] = 255
      out.data[o + 2] = 255
      out.data[o + 3] = Math.round(255 * whiteness(glyph, s))
    }
  }
  return out
}

/**
 * The Android notification small icon: a white rounded tile with the "O"
 * knocked out of it. Android draws a small icon as a SILHOUETTE (only alpha
 * survives, tinted with the accent), so the full-colour launcher icon it fell
 * back to rendered as a plain white square. This keeps the icon's rounded-tile
 * shape and letter in the one form the status bar can draw.
 */
function notificationIcon(masterPng, size) {
  const pad = size / 12 // 2dp of the 24dp canvas, Android's own keyline
  const tile = size - pad * 2
  const glyph = resize(masterPng, Math.round(tile))
  const out = new PNG({ width: size, height: size })
  const r = tile * CORNER
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) << 2
      const cover = roundedCover(x, y, size, r, pad)
      const gx = Math.floor(x - pad)
      const gy = Math.floor(y - pad)
      const inside = gx >= 0 && gy >= 0 && gx < glyph.width && gy < glyph.height
      const cut = inside ? whiteness(glyph, (gy * glyph.width + gx) << 2) : 0
      out.data[o] = 255
      out.data[o + 1] = 255
      out.data[o + 2] = 255
      out.data[o + 3] = Math.round(255 * cover * (1 - cut))
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
// The adaptive layers are 108dp; the launcher shows the middle 72dp through its
// mask and guarantees only a 66dp circle. The master's glyph spans 70% of it, so
// at 66.7% of the layer the "O" is ~47% of 108dp — well inside the safe circle
// whatever shape (squircle, circle, teardrop) the launcher cuts.
const ADAPTIVE_SCALE = 72 / 108
const ADAPTIVE = { "mipmap-mdpi": 108, "mipmap-hdpi": 162, "mipmap-xhdpi": 216, "mipmap-xxhdpi": 324, "mipmap-xxxhdpi": 432 }
const NOTIFICATION = [
  ["drawable-mdpi", 24],
  ["drawable-hdpi", 36],
  ["drawable-xhdpi", 48],
  ["drawable-xxhdpi", 72],
  ["drawable-xxxhdpi", 96],
]

for (const [dir, size] of ANDROID) {
  const target = at(`android/app/src/main/res/${dir}`)
  mkdirSync(target, { recursive: true })
  const square = resize(master, size)
  // Legacy (pre-8.0) and non-masking launchers draw this PNG as-is, so it
  // carries its own rounded corners rather than a sharp square.
  writeFileSync(`${target}/ic_launcher.png`, PNG.sync.write(rounded(square)))
  writeFileSync(`${target}/ic_launcher_round.png`, PNG.sync.write(circular(square)))
  writeFileSync(`${target}/ic_launcher_foreground.png`, PNG.sync.write(glyphLayer(master, ADAPTIVE[dir], ADAPTIVE_SCALE)))
  console.log(`android ${dir}: ic_launcher (rounded) + ic_launcher_round + ic_launcher_foreground (${size}px)`)
}

// Android 8+ adaptive icon: brand background + glyph foreground, and the same
// glyph as the Android 13 themed (monochrome) layer. The LAUNCHER owns the
// shape, so the icon gets the device's own rounded mask instead of sitting as a
// square on a white plate.
const anydpi = at("android/app/src/main/res/mipmap-anydpi-v26")
mkdirSync(anydpi, { recursive: true })
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/icons.mjs. Do not hand-edit. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`
writeFileSync(`${anydpi}/ic_launcher.xml`, adaptiveXml)
writeFileSync(`${anydpi}/ic_launcher_round.xml`, adaptiveXml)
writeFileSync(
  at("android/app/src/main/res/values/ic_launcher_background.xml"),
  `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/icons.mjs: the adaptive icon's background, the master's own blue. -->
<resources>
    <color name="ic_launcher_background">#${BRAND.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}</color>
</resources>
`,
)
console.log("android mipmap-anydpi-v26: adaptive ic_launcher + ic_launcher_round")

for (const [dir, size] of NOTIFICATION) {
  const target = at(`android/app/src/main/res/${dir}`)
  mkdirSync(target, { recursive: true })
  writeFileSync(`${target}/notification_icon.png`, PNG.sync.write(notificationIcon(master, size)))
  console.log(`android ${dir}: notification_icon (${size}px)`)
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
