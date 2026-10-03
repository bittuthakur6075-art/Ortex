// ---- Audio constants + PCM helpers ----------------------------------------
// Gemini Live streams mic input as 16 kHz PCM and returns Orty's voice as
// 24 kHz PCM; these helpers convert between Float32 samples, Int16 PCM and the
// base64 wire format.

export const INPUT_RATE = 16000
export const OUTPUT_RATE = 24000

export function floatTo16BitPCM(float32) {
  const out = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
export function int16ToBase64(int16) {
  let binary = ""
  const bytes = new Uint8Array(int16.buffer)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk))
  return btoa(binary)
}
export function base64ToInt16(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

// Mic samples at the context's own rate down to INPUT_RATE, averaging each
// span (a box filter, enough to keep speech clean). A no-op at 16 kHz, which
// is the mic context Chrome and Safari run; Firefox cannot feed a mic into a
// 16 kHz context and captures at the device rate instead.
// ponytail: drops the fractional sample at the end of each block (under one
// per 64 ms block at 44.1 kHz, inaudible); carry the remainder if it ever matters.
export function downsample(input, fromRate) {
  if (fromRate === INPUT_RATE) return input
  const ratio = fromRate / INPUT_RATE
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio)
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = a; j < b; j++) sum += input[j]
    out[i] = sum / (b - a)
  }
  return out
}
