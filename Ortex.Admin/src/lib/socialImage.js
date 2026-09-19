// Turns any photo (a file from the computer, a product photo, a work photo) into
// a creative Instagram will accept, and stores it in the public social-media
// bucket (migration 0013) under uploads/.
//
// Instagram's publishing API takes a JPEG only, between 4:5 and 1.91:1, fetched
// by Meta from a public URL. So every photo is centre-cropped to the chosen feed
// format and re-encoded as JPEG here, in the browser: the browser decodes WebP
// and (on Safari) HEIC, which the Edge Functions' decoder cannot.
//
// A catalogue photo is fetched with CORS (Supabase Storage allows it) so the
// canvas can be exported; the original product photo is never touched.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

const BUCKET = "social-media"
const QUALITY = 0.9

// Must match FORMATS in supabase/functions/social-creative/index.ts.
export const SOCIAL_FORMATS = [
  { value: "square", label: "Square 1:1", size: [1080, 1080] },
  { value: "portrait", label: "Portrait 4:5", size: [1080, 1350] },
  { value: "landscape", label: "Landscape 1.91:1", size: [1200, 628] },
]

export const formatSize = (format) => (SOCIAL_FORMATS.find((f) => f.value === format) || SOCIAL_FORMATS[0]).size

// Tailwind aspect class for a preview of each format.
export const FORMAT_ASPECT = { square: "aspect-square", portrait: "aspect-[4/5]", landscape: "aspect-[1.91/1]" }

// Instagram refuses anything larger, and the bucket caps at 8 MB (0013).
export const MAX_SOURCE_MB = 20

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not open that photo. Try a JPG or PNG."))
    img.src = src
  })
}

/** Centre-crop to the format and encode as JPEG. `source` is a File or a URL. */
export async function toFeedJpeg(source, format) {
  const isFile = typeof source !== "string"
  if (isFile && source.size > MAX_SOURCE_MB * 1024 * 1024) {
    throw new Error(`That photo is over ${MAX_SOURCE_MB} MB. Pick a smaller one.`)
  }
  const src = isFile ? URL.createObjectURL(source) : source
  try {
    const img = await loadImage(src)
    const [w, h] = formatSize(format)
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
    const sw = w / scale
    const sh = h / scale
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    // JPEG has no alpha: paint white so a transparent PNG does not go black.
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h)
    return await new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not prepare the photo."))), "image/jpeg", QUALITY)
      } catch {
        // A tainted canvas: the photo's host did not allow CORS.
        reject(new Error("That photo cannot be reused here. Download it and upload it instead."))
      }
    })
  } finally {
    if (isFile) URL.revokeObjectURL(src)
  }
}

/** Crop, encode and upload; returns the public URL Meta will fetch. */
export async function uploadSocialImage(source, format) {
  if (!hasSupabase) throw new Error("Connect Supabase to add photos.")
  const blob = await toFeedJpeg(source, format)
  const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const path = `uploads/${id}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  })
  if (error) throw new Error(`Could not upload the photo: ${error.message}`)
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// Instagram's own caption rules, shown while writing and checked again by
// social-publish before anything is sent.
export const IG_MAX_CAPTION = 2200
export const IG_MAX_HASHTAGS = 30
