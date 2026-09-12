// Playback for website voice-call recordings (Anu). The website uploads them
// to the private `voice-recordings` bucket (migration 0025) and stores the path
// on every lead row of the call as `doc.call.recording`.
import { supabase } from "../data/store/supabaseClient"

const BUCKET = "voice-recordings"

/** Short-lived playback URL, or null when the recording does not exist. */
export async function voiceRecordingUrl(path) {
  if (!supabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl || null
}
