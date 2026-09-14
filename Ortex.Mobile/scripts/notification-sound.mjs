// Generates android/app/src/main/res/raw/ortex_ring.wav, the lead notification ring.
// A short "tring-tring" twice (~1.85s), synthesised here so the sound carries no
// licence. Run: node scripts/notification-sound.mjs android/app/src/main/res/raw/ortex_ring.wav
// A changed sound needs a NEW channel id in src/lib/push.ts: Android never
// re-reads the sound of a channel that already exists on the handset.
import { writeFileSync } from "node:fs"
const rate = 44100, dur = 1.85, n = Math.floor(rate * dur)
const buf = new Float64Array(n)
// One bell hit: fundamental + inharmonic partials, sharp attack, fast decay.
function hit(t0, f, gain) {
  const s0 = Math.floor(t0 * rate), len = Math.floor(0.42 * rate)
  const partials = [[1, 1], [2.0, 0.45], [2.76, 0.28], [5.4, 0.12]]
  for (let i = 0; i < len && s0 + i < n; i++) {
    const t = i / rate
    const attack = Math.min(1, t / 0.003)
    const env = attack * Math.exp(-t * 9)
    let v = 0
    for (const [m, a] of partials) v += a * Math.sin(2 * Math.PI * f * m * t) * Math.exp(-t * 3 * m)
    buf[s0 + i] += v * env * gain
  }
}
// "tring-tring", twice: a high-low double hit, then the same again.
for (const base of [0, 0.9]) {
  hit(base + 0.00, 1568, 1.0)  // G6
  hit(base + 0.13, 2093, 0.9)  // C7
  hit(base + 0.30, 1568, 1.0)
  hit(base + 0.43, 2093, 0.9)
}
let peak = 0
for (const v of buf) peak = Math.max(peak, Math.abs(v))
const pcm = Buffer.alloc(44 + n * 2)
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + n * 2, 4); pcm.write("WAVE", 8)
pcm.write("fmt ", 12); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22)
pcm.writeUInt32LE(rate, 24); pcm.writeUInt32LE(rate * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34)
pcm.write("data", 36); pcm.writeUInt32LE(n * 2, 40)
// Fade the last 30ms so the file never ends on a click.
for (let i = 0; i < n; i++) {
  const tail = Math.min(1, (n - i) / (0.03 * rate))
  pcm.writeInt16LE(Math.round((buf[i] / peak) * 0.95 * tail * 32767), 44 + i * 2)
}
writeFileSync(process.argv[2], pcm)
console.log("wrote", process.argv[2], pcm.length, "bytes")
