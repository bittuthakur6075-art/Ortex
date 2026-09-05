// Profile-photo upload to the public "avatars" Supabase Storage bucket
// (migration 0019). The browser centre-crops the picture to a square and
// re-encodes it as a small JPEG first, so every avatar is the same shape and a
// few tens of kilobytes regardless of what the user picked.
//
// Objects live at `<userId>/<random>.jpg` — the storage policies only let a
// user write inside the folder named after their own uid.
//
// With no backend configured (localStorage mode) the crop is returned as a
// base64 data-URL instead, so the Admin still works offline.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

const BUCKET = "avatars"
const SIZE = 256 // px, square
const QUALITY = 0.85

export const MAX_AVATAR_MB = 5
export const MAX_AVATAR_BYTES = MAX_AVATAR_MB * 1024 * 1024

/** Centre-crop a File to a square JPEG Blob (plus a data-URL fallback). */
function squareCrop(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error("Could not load image"))
      img.onload = () => {
        const side = Math.min(img.width, img.height)
        const sx = (img.width - side) / 2
        const sy = (img.height - side) / 2
        const canvas = document.createElement("canvas")
        canvas.width = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext("2d")
        // JPEG has no alpha — paint white so transparent PNGs don't go black.
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, SIZE, SIZE)
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE)
        const dataUrl = canvas.toDataURL("image/jpeg", QUALITY)
        canvas.toBlob((blob) => resolve({ blob: blob || null, dataUrl }), "image/jpeg", QUALITY)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Upload one avatar and return the URL to store on profiles.avatar_url.
 * @param {File} file
 * @param {string} userId - the signed-in user's id; also the storage folder
 * @returns {Promise<string>} public URL (or a base64 data-URL offline)
 */
export async function uploadAvatar(file, userId) {
  const { blob, dataUrl } = await squareCrop(file)
  if (!hasSupabase || !blob || !userId) return dataUrl

  const rand = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${userId}/${rand}.jpg`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "31536000",
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** Best-effort delete of a previously-uploaded avatar (ignores failures). */
export async function removeAvatar(url) {
  const marker = `/${BUCKET}/`
  if (!hasSupabase || typeof url !== "string" || !url.includes(marker)) return
  const path = url.slice(url.indexOf(marker) + marker.length).split("?")[0]
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  } catch {
    /* cleanup is best-effort — a stale object is harmless */
  }
}
