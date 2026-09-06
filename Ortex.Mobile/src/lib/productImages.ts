/**
 * Product-photo upload — the phone's route into the same `product-images` bucket
 * the console's product editor and bulk import write to (migration 0010).
 *
 * The bucket is PUBLIC for reads and writable by any active staff member, so a
 * URL stored on `doc.images` renders in the console, on the marketing site (via
 * `products_public`) and here, with nothing new needed server-side.
 *
 * Bytes travel as base64 for the reason `avatarUpload.ts` documents: on React
 * Native a `Blob` from `fetch(uri)` is a native handle supabase-js cannot read,
 * and it uploads a 0-byte object WITHOUT erroring. The picker's own base64,
 * decoded here, is the reliable route.
 */

import { supabase, hasSupabase } from "@/data/supabase"
import { decodeBase64 } from "@/lib/avatarUpload"

const BUCKET = "product-images"

/**
 * The BUCKET's own ceiling, from migration 0010 — not a number picked here. Send
 * more and storage rejects the object with a message about payload size that
 * says nothing about which photo or what to do, so the check happens before the
 * upload and names the limit.
 */
export const MAX_PHOTO_MB = 5

/**
 * The bucket's `allowed_mime_types`, also from 0010. A type outside this list is
 * refused server-side, and the picker hands back types that are not on it —
 * iOS HEIC most often.
 */
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
}

/**
 * Upload one picked photo and return its public URL for `doc.images`.
 *
 * `mimeType` is what the picker reported. Anything the bucket will not accept is
 * sent as JPEG, which is what the asset actually is: the picker re-encodes to
 * JPEG whenever `quality` is set, while still labelling an iPhone original
 * `image/heic`.
 */
export async function uploadProductImage(base64: string, mimeType = "image/jpeg") {
  if (!hasSupabase) throw new Error("Not connected")

  // A storage write is an authenticated write: `staff_upload_product_images`
  // (0010) admits `authenticated` only, and an expired session surfaces as a
  // row-level-security refusal that reads like a permissions problem.
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) throw new Error("Your session has expired. Sign in again")

  const contentType = ALLOWED.includes(mimeType) ? mimeType : "image/jpeg"
  const extension = EXTENSIONS[contentType] ?? "jpg"
  const rand = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${rand}.${extension}`
  const body = toArrayBuffer(decodeBase64(base64))

  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType,
    upsert: false,
    cacheControl: "31536000",
  })
  if (error) {
    if (__DEV__) console.warn("[ortex] product image upload failed", error)
    // "Bucket not found" is not a photo problem and not something a salesperson
    // can act on: it means migration 0010 has never been applied to whichever
    // Supabase project this build points at, so no phone or console in that
    // environment can store a product photo until someone runs it.
    if (/bucket not found/i.test(error.message || "")) {
      throw new Error("Photo storage is not set up on this environment yet. Tell the office")
    }
    throw error
  }

  // The 0-byte trap: React Native's networking will happily send a body it does
  // not understand as nothing at all, and storage answers 200 to that. A URL
  // pointing at an empty object looks like a working save and shows a blank tile
  // days later, so the object is read back before its URL is handed out.
  const size = await uploadedSize(path)
  if (size === 0) {
    await removeByPath(path)
    throw new Error("The photo uploaded empty. Try again")
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/**
 * A view is not a buffer. `decodeBase64` allocates on a 3/4 estimate and hands
 * back a `subarray`, so its `.buffer` can carry slack bytes past the image; and
 * a typed array is the shape RN's fetch is least reliable with. Copy out exactly
 * the bytes that matter, as a plain ArrayBuffer — the shape Supabase's own React
 * Native guidance uses.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/** The stored object's size in bytes, or 0 when it cannot be read back. */
async function uploadedSize(path: string): Promise<number> {
  const { data, error } = await supabase.storage.from(BUCKET).list("", { search: path, limit: 1 })
  if (error || !data?.length) return 0
  const size = (data[0].metadata as { size?: number } | null)?.size
  return typeof size === "number" ? size : 0
}

async function removeByPath(path: string) {
  try {
    await supabase.storage.from(BUCKET).remove([path])
  } catch {
    // Best effort — the throw above is the message that matters.
  }
}

/**
 * Best-effort delete of a photo this app uploaded. Failures are swallowed: an
 * orphaned object costs a few kilobytes, while an error dialog over one costs
 * the person the edit they were making.
 *
 * Only objects in this bucket are touched — a URL typed in by the console (or
 * imported from a supplier's site) is left alone.
 */
export async function removeProductImage(url?: string | null) {
  const marker = `/${BUCKET}/`
  if (!hasSupabase || typeof url !== "string" || !url.includes(marker)) return
  const path = url.slice(url.indexOf(marker) + marker.length).split("?")[0]
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  } catch {
    // See above.
  }
}
