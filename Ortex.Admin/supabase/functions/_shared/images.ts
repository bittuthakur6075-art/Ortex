// Image helpers shared by the functions that LOOK AT or EDIT a product photo
// (product-copywriter, product-image-studio).
//
// Every photo these functions read is one of OUR stored photos, never an
// arbitrary URL: a function that fetches whatever URL the caller names is a
// server-side request forgery waiting to happen (it would happily fetch an
// internal address and hand the bytes back). `ownStorageUrl` is that gate.

import { decode, Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts"

/** The largest photo we will pull into a function. Matches the product-images bucket cap (0010). */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** True only for a public object in THIS project's storage. */
export function ownStorageUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || !raw) return false
  try {
    const url = new URL(raw)
    const project = new URL(Deno.env.get("SUPABASE_URL") || "")
    return (
      url.protocol === "https:" &&
      url.host === project.host &&
      url.pathname.startsWith("/storage/v1/object/public/")
    )
  } catch {
    return false
  }
}

export type Fetched = { bytes: Uint8Array; mime: string }

/** Download one of our photos, refusing anything oversized or not an image. */
export async function fetchImage(url: string): Promise<Fetched> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`photo fetch ${res.status}`)
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim()
  if (!mime.startsWith("image/")) throw new Error(`not an image (${mime || "no type"})`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (!bytes.length) throw new Error("empty photo")
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("photo too large")
  return { bytes, mime }
}

/**
 * Fit a photo inside `maxSide` × `maxSide` and re-encode it as JPEG.
 *
 * Cloudflare's FLUX.2 [klein] refuses reference images of 512px or more on
 * either side, so the studio sends 511. Returns null for a format imagescript
 * cannot decode (WebP, AVIF, HEIC), which the caller turns into a sentence.
 */
export async function shrinkToJpeg(bytes: Uint8Array, maxSide: number): Promise<Uint8Array | null> {
  let img: Image
  try {
    const decoded = await decode(bytes)
    if (!(decoded instanceof Image)) return null // a GIF decodes to frames
    img = decoded
  } catch {
    return null
  }
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
  if (scale < 1) img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
  return await img.encodeJPEG(92)
}

/** Base64 without blowing the call stack on a multi-megabyte photo. */
export function toBase64(bytes: Uint8Array): string {
  let binary = ""
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

/** The real type of an image, from its first bytes rather than from what the sender claimed. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg"
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png"
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp"
  return null
}
