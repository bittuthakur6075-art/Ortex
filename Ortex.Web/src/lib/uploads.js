// Customer artwork → Supabase Storage.
//
// The quote builder previously sent only the file *name* — the bytes never left
// the browser, so the factory received `Logo file: acme-logo.ai` and no logo.
// Files now upload to the private `artwork` bucket and the enquiry carries the
// storage path (see Ortex.Admin/supabase/migrations/0009_artwork_storage.sql).

import { supabase, hasSupabase } from "./supabaseClient"

export const ARTWORK_BUCKET = "artwork"
export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024

// .cdr and .dxf are the formats Indian print and CNC shops actually receive;
// the old picker rejected both while the homepage promised them.
export const ARTWORK_EXTENSIONS = [
  ".ai", ".cdr", ".dxf", ".eps", ".pdf", ".svg", ".png", ".jpg", ".jpeg",
]
export const ARTWORK_ACCEPT = ARTWORK_EXTENSIONS.join(",")
export const ARTWORK_HINT = "AI, CDR, DXF, EPS, PDF, SVG or high-res PNG/JPG — up to 10 MB"

function extensionOf(name) {
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot).toLowerCase()
}

/** @returns {string|null} An error message, or null when the file is accepted. */
export function validateArtwork(file) {
  if (!ARTWORK_EXTENSIONS.includes(extensionOf(file.name))) {
    return `Unsupported file type. Accepted: ${ARTWORK_EXTENSIONS.join(", ")}`
  }
  if (file.size > MAX_ARTWORK_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1)
    return `File is ${mb} MB — the limit is 10 MB. Please WhatsApp or email larger files.`
  }
  return null
}

// Storage object keys must be ASCII-safe, but keep the name recognisable to the
// sales desk rather than replacing it with an opaque uuid.
function safeName(name) {
  return name.replace(/[^\w.-]+/g, "_").slice(-80)
}

/** @returns {Promise<{path: string} | {error: string}>} */
export async function uploadArtwork(file, reference) {
  if (!hasSupabase) return { error: "Storage not configured" }

  const path = `${new Date().getFullYear()}/${reference}/${safeName(file.name)}`
  try {
    const { error } = await supabase.storage.from(ARTWORK_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      // Browsers report an empty type for .cdr/.dxf; the bucket accepts the
      // fallback and the extension whitelist above is what actually gates uploads.
      contentType: file.type || "application/octet-stream",
    })
    return error ? { error: error.message } : { path }
  } catch (err) {
    // A dropped connection mid-upload must not take the enquiry down with it.
    return { error: err?.message || "Upload failed" }
  }
}
