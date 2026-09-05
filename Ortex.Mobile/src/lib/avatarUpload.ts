/**
 * Profile-photo upload — the phone half of `Ortex.Admin/src/lib/avatarUpload.js`.
 *
 * Same bucket, same object layout, same policies (migration 0019): objects live
 * at `<uid>/<random>.jpg` in the public `avatars` bucket, and storage RLS only
 * lets a user write inside the folder named after their own uid. Nothing new is
 * needed server-side for this app.
 *
 * The one real difference is WHERE THE SQUARE COMES FROM. The console crops on a
 * canvas because a browser has one; here the picker itself does it — launching
 * with `allowsEditing` and `aspect: [1, 1]` hands back an already-square asset,
 * which is both cheaper and the interaction people expect on a phone.
 *
 * Bytes travel as base64 rather than a Blob: `fetch(uri).then(r => r.blob())`
 * on React Native yields a Blob whose data supabase-js cannot read (it is a
 * native handle, not a buffer) and uploads a 0-byte object with no error. The
 * picker's own base64, decoded to a Uint8Array here, is the reliable route.
 */

import { supabase, hasSupabase } from "@/data/supabase"

const BUCKET = "avatars"

export const MAX_AVATAR_MB = 5
export const MAX_AVATAR_BYTES = MAX_AVATAR_MB * 1024 * 1024

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

/**
 * base64 → bytes. Hand-rolled for the same reason `format.ts` hand-rolls Indian
 * digit grouping: `atob` is a browser API that Hermes has only had since RN 0.74
 * and still omits in some engine builds, and the failure would be silent.
 */
export function decodeBase64(input: string): Uint8Array {
  const clean = input.replace(/[^A-Za-z0-9+/]/g, "")
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let byte = 0
  let buffer = 0
  let bits = 0
  for (let i = 0; i < clean.length; i += 1) {
    buffer = (buffer << 6) | B64.indexOf(clean[i])
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[byte++] = (buffer >> bits) & 0xff
    }
  }
  return bytes.subarray(0, byte)
}

/** The byte size of a base64 payload, without materialising it. */
export function base64Bytes(base64: string): number {
  return Math.floor(base64.length * 0.75)
}

/**
 * Upload one already-square photo and return the URL to store on
 * `profiles.avatar_url`.
 *
 * @param base64 the picker asset's `base64` (no data: prefix)
 * @param userId the signed-in user's id — also the storage folder
 */
export async function uploadAvatar(base64: string, userId: string, mimeType = "image/jpeg") {
  if (!hasSupabase) throw new Error("Not connected")
  const extension = mimeType === "image/png" ? "png" : "jpg"
  const rand = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${userId}/${rand}.${extension}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, decodeBase64(base64), {
    contentType: mimeType,
    upsert: false,
    cacheControl: "31536000",
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Best-effort delete of a previously-uploaded avatar; failures are ignored. */
export async function removeAvatar(url?: string | null) {
  const marker = `/${BUCKET}/`
  if (!hasSupabase || typeof url !== "string" || !url.includes(marker)) return
  const path = url.slice(url.indexOf(marker) + marker.length).split("?")[0]
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  } catch {
    // An orphaned object costs a few kilobytes; a failed sign-out-worthy error
    // dialog over it costs the user the whole action.
  }
}
