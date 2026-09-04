// PCM helpers for Gemini Live: mic in at 16 kHz, the agent's voice out at
// 24 kHz, base64 on the wire. Same as Ortex.Web/live-orty/audio.js.

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
