import { hasSupabase, supabase } from "@/data/supabase"

// PORT OF Ortex.Admin/src/services/voiceRecordings.js.
//
// Playback for website voice-call recordings (Anu). The website uploads them to
// the private `voice-recordings` bucket (migration 0025) and stores the path on
// every lead row of the call as `doc.call.recording`. The bucket admits an
// anonymous INSERT and a staff READ, so a signed URL is the only way to play
// one — the object itself is not public, and a rep is staff.

const BUCKET = "voice-recordings"

/** How long a playback URL stays good. Matches the console's hour. */
const TTL_SECONDS = 3600

/** Short-lived playback URL, or null when the recording does not exist. */
export async function voiceRecordingUrl(path: string): Promise<string | null> {
  if (!hasSupabase || !path) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TTL_SECONDS)
  if (error) return null
  return data?.signedUrl || null
}
