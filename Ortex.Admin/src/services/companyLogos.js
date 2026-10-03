// A company's logo (migration 0078): the public bucket `company-logos`, written
// only by the Super Admin. Every upload is a NEW path (phones cache by URL), and
// the public URL goes onto companies.doc.company.logoUrl.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

const BUCKET = "company-logos"
export const LOGO_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "image/webp": "webp" }
export const LOGO_MAX_BYTES = 1024 * 1024

const asDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })

/** Refuses anything but PNG, JPEG, SVG or WebP up to 1 MB. Returns the URL to save. */
export async function uploadCompanyLogo(file, companyId) {
  const ext = LOGO_TYPES[file?.type]
  if (!ext) throw new Error("Choose a PNG, JPG, SVG or WebP file.")
  if (file.size > LOGO_MAX_BYTES) throw new Error("The logo must be 1 MB or smaller.")
  // Demo mode has no storage: the logo lives in the browser's copy of the company.
  if (!hasSupabase) return asDataUrl(file)
  const path = `${companyId}/${Date.now()}-logo.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: "31536000" })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Best-effort delete of a replaced or removed logo (ignores failures). */
export async function removeCompanyLogo(url) {
  const marker = `/${BUCKET}/`
  if (!hasSupabase || typeof url !== "string" || !url.includes(marker)) return
  const path = url.slice(url.indexOf(marker) + marker.length).split("?")[0]
  try {
    await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)])
  } catch {
    // an orphaned file costs nothing; the record no longer points at it
  }
}
