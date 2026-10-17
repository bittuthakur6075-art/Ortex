// Product / category image upload to the public "product-images" Supabase
// Storage bucket (migration 0010). Images are compressed and resized in the
// browser first, then uploaded; the caller stores the returned PUBLIC URL on the
// product/category doc instead of a base64 blob.
//
// Falls back to a base64 data-URL when Supabase is not configured (local
// no-backend mode), so the Admin still works offline for demos.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

const BUCKET = "product-images"
const MAX_DIM = 1000 // px - good quality for product detail views
const QUALITY = 0.82

export const MAX_IMAGE_MB = 10
export const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024

// Photos are stored as WebP: about a third smaller than the JPEG this used to
// write at the same quality, which the website's catalogue pages load dozens
// of. A browser that cannot encode WebP hands back a PNG from toBlob, so the
// result's type is checked and such a browser gets the old white-backed JPEG.
const FORMATS = [
  { type: "image/webp", ext: "webp", opaque: false },
  { type: "image/jpeg", ext: "jpg", opaque: true },
]

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))

/** Resize/compress a File to a WebP (else JPEG) Blob, plus a data-URL fallback. */
function compress(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error("Could not load image"))
      img.onload = async () => {
        let { width, height } = img
        if (width > height && width > MAX_DIM) {
          height *= MAX_DIM / width
          width = MAX_DIM
        } else if (height > MAX_DIM) {
          width *= MAX_DIM / height
          height = MAX_DIM
        }
        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        for (const format of FORMATS) {
          ctx.clearRect(0, 0, width, height)
          // JPEG has no alpha: paint white so transparent PNGs don't go black.
          // WebP keeps the transparency.
          if (format.opaque) {
            ctx.fillStyle = "#ffffff"
            ctx.fillRect(0, 0, width, height)
          }
          ctx.drawImage(img, 0, 0, width, height)
          const blob = await toBlob(canvas, format.type)
          if (blob && blob.type === format.type) {
            resolve({ blob, format, dataUrl: canvas.toDataURL(format.type, QUALITY) })
            return
          }
        }
        resolve({ blob: null, format: null, dataUrl: canvas.toDataURL("image/jpeg", QUALITY) })
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Upload one image file and return a URL to store on the doc.
 * @param {File} file
 * @param {string} folder - path prefix inside the bucket ("products" | "categories")
 * @returns {Promise<string>} public URL (or base64 data-URL in offline mode)
 */
export async function uploadImage(file, folder = "products") {
  const { blob, format, dataUrl } = await compress(file)

  // Offline / no backend: keep the old base64 behaviour so demos still work.
  if (!hasSupabase || !blob) return dataUrl

  const rand = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `${folder}/${rand}.${format.ext}`

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: format.type,
    upsert: false,
    cacheControl: "31536000",
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

/** True if a stored image value lives in our bucket (vs. a base64 or remote URL). */
function isBucketUrl(url) {
  return typeof url === "string" && url.includes(`/${BUCKET}/`)
}

/** Best-effort delete of a previously-uploaded bucket image (ignores failures). */
export async function removeImage(url) {
  if (!hasSupabase || !isBucketUrl(url)) return
  const marker = `/${BUCKET}/`
  const path = url.slice(url.indexOf(marker) + marker.length).split("?")[0]
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  } catch {
    /* image cleanup is best-effort */
  }
}
