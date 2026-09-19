/**
 * Photos for social posts: the phone's route into the public `social-media`
 * bucket (migration 0013), under `uploads/`, exactly where the console's
 * lib/socialImage.js puts them, so a photo added on the phone publishes the same
 * way as one added at the desk.
 *
 * Instagram's publishing API takes a JPEG only, between 4:5 and 1.91:1, fetched
 * by Meta from a public URL. Every photo is therefore centre-cropped to the
 * post's feed format and re-encoded as JPEG here before it is uploaded; a
 * catalogue photo is downloaded first (the manipulator works on local files).
 * The catalogue's own photo is never changed.
 *
 * Bytes go up as base64 → ArrayBuffer, for the reason productImages.ts records:
 * an RN Blob uploads 0 bytes without an error.
 */

import * as FileSystem from "expo-file-system/legacy"
import * as ImageManipulator from "expo-image-manipulator"

import { supabase, hasSupabase } from "@/data/supabase"
import { formatOf, type SocialFormat } from "@/domain/social"
import { decodeBase64 } from "@/lib/avatarUpload"

const BUCKET = "social-media"
const QUALITY = 0.88

/** Centre-crop a local image to the format's ratio and size, as JPEG base64. */
export async function toFeedJpeg(localUri: string, format: SocialFormat): Promise<string> {
  const [outW, outH] = formatOf(format).size
  // A no-op pass reads the real pixel size (the picker's own numbers can be
  // pre-rotation on Android).
  const probe = await ImageManipulator.manipulateAsync(localUri, [])
  const { width, height } = probe
  const target = outW / outH
  let cropW = width
  let cropH = Math.round(width / target)
  if (cropH > height) {
    cropH = height
    cropW = Math.round(height * target)
  }
  const out = await ImageManipulator.manipulateAsync(
    localUri,
    [
      { crop: { originX: Math.floor((width - cropW) / 2), originY: Math.floor((height - cropH) / 2), width: cropW, height: cropH } },
      { resize: { width: outW, height: outH } },
    ],
    { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  )
  if (!out.base64) throw new Error("The photo could not be prepared. Try another one")
  return out.base64
}

/** A photo from the catalogue or the work gallery, copied into the post. */
export async function copyRemotePhoto(url: string, format: SocialFormat): Promise<string> {
  const target = `${FileSystem.cacheDirectory}social-${Date.now()}.img`
  const res = await FileSystem.downloadAsync(url, target)
  if (res.status < 200 || res.status >= 300) throw new Error("That photo could not be downloaded. Check the connection")
  try {
    return await uploadSocialJpeg(await toFeedJpeg(res.uri, format))
  } finally {
    void FileSystem.deleteAsync(target, { idempotent: true })
  }
}

/** A photo picked on this phone (a local file URI). */
export async function uploadLocalPhoto(localUri: string, format: SocialFormat): Promise<string> {
  return uploadSocialJpeg(await toFeedJpeg(localUri, format))
}

async function uploadSocialJpeg(base64: string): Promise<string> {
  if (!hasSupabase) throw new Error("Not connected")
  const { data: auth } = await supabase.auth.getSession()
  if (!auth.session) throw new Error("Your session has expired. Sign in again")

  const bytes = decodeBase64(base64)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
  const path = `uploads/${name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "31536000",
  })
  if (error) {
    if (/bucket not found/i.test(error.message || "")) {
      throw new Error("Social photo storage is not set up on this environment yet. Tell the office")
    }
    throw error
  }

  // The same read-back productImages.ts does: storage answers 200 to an empty
  // body, and an empty creative would fail at Meta days later.
  const { data } = await supabase.storage.from(BUCKET).list("uploads", { search: name, limit: 1 })
  const size = (data?.[0]?.metadata as { size?: number } | null)?.size
  if (!size) {
    void supabase.storage.from(BUCKET).remove([path])
    throw new Error("The photo uploaded empty. Try again")
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
