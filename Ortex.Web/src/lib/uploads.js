// Customer artwork → Supabase Storage.
//
// The quote builder previously sent only the file *name* — the bytes never left
// the browser, so the factory received `Logo file: acme-logo.ai` and no logo.
// Files now upload to the private `artwork` bucket and the enquiry carries the
// storage path (see Ortex.Admin/supabase/migrations/0009_artwork_storage.sql).
//
// Order matters (migration 0079): the enquiry is saved first, naming the path
// in `doc.artwork`, and only then is the file uploaded. The bucket accepts an
// anonymous upload only for a path a Quote calculator enquiry from the last
// two hours names, so nobody can fill it with files tied to no enquiry.

import { supabase, hasSupabase } from "./supabaseClient"

const ARTWORK_BUCKET = "artwork"
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024
// A stalled upload on a weak connection must not spin for ever; the enquiry is
// already saved by then, so the customer is asked to WhatsApp the file instead.
const UPLOAD_TIMEOUT_MS = 60000

// The type sent for each extension. Browsers report an empty type for .cdr and
// .dxf (and sometimes .ai/.eps), and the bucket no longer accepts the generic
// application/octet-stream, so the type comes from the extension, not the browser.
const ARTWORK_TYPES = {
  ".ai": "application/postscript",
  ".eps": "application/postscript",
  ".cdr": "application/x-coreldraw",
  ".dxf": "application/dxf",
  ".pdf": "application/pdf",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
}

// .cdr and .dxf are the formats Indian print and CNC shops actually receive;
// the old picker rejected both while the homepage promised them.
const ARTWORK_EXTENSIONS = [
  ".ai", ".cdr", ".dxf", ".eps", ".pdf", ".svg", ".png", ".jpg", ".jpeg",
]
export const ARTWORK_ACCEPT = ARTWORK_EXTENSIONS.join(",")
export const ARTWORK_HINT = "AI, CDR, DXF, EPS, PDF, SVG or high-res PNG/JPG, up to 10 MB"

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
    return `File is ${mb} MB, and the limit is 10 MB. Please WhatsApp or email larger files.`
  }
  return null
}

// Storage object keys must be ASCII-safe, but keep the name recognisable to the
// sales desk rather than replacing it with an opaque uuid.
function safeName(name) {
  return name.replace(/[^\w.-]+/g, "_").slice(-80)
}

/** Where a file for this enquiry is stored: `<year>/<reference>/<name>`. */
export function artworkPath(file, reference) {
  return `${new Date().getFullYear()}/${reference}/${safeName(file.name)}`
}

/**
 * Upload to the path the saved enquiry named (artworkPath).
 * @returns {Promise<{path: string} | {error: string}>}
 */
export async function uploadArtwork(file, path) {
  if (!hasSupabase) return { error: "Storage not configured" }

  let timer
  try {
    const upload = supabase.storage.from(ARTWORK_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: ARTWORK_TYPES[extensionOf(file.name)] || file.type,
    })
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ error: { message: "Upload timed out" } }), UPLOAD_TIMEOUT_MS)
    })
    const { error } = await Promise.race([upload, timeout])
    return error ? { error: error.message } : { path }
  } catch (err) {
    // A dropped connection mid-upload must not take the enquiry down with it.
    return { error: err?.message || "Upload failed" }
  } finally {
    clearTimeout(timer)
  }
}
