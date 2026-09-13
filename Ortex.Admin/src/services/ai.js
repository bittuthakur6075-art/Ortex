// The console's route to the three AI Edge Functions: the general writer behind
// every "Write with AI" button (ai-writer), the product copywriter that reads the
// first photo (product-copywriter), and the photo studio (product-image-studio).
//
// Every call returns `{ error }` rather than throwing, with the function's own
// sentence when it sent one, so a caller can show it inline beside the field it
// was working on instead of in a generic toast.

import { supabase, hasSupabase } from "../data/store/supabaseClient"

const OFFLINE = "AI tools need a database connection. This build runs on demo data."

async function invoke(name, body) {
  if (!hasSupabase) return { error: OFFLINE }
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const status = error.context?.status
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.error) return { error: parsed.error }
    } catch {
      /* not JSON, fall through to the transport cases below */
    }
    if (status === 404 || /failed to send a request|failed to fetch/i.test(error.message)) {
      return { error: `The "${name}" function is not deployed on this Supabase project. Run: supabase functions deploy ${name}` }
    }
    return { error: error.message || "The AI request failed." }
  }
  if (data?.error) return { error: data.error }
  return { data }
}

// { purpose, mode, current, instruction, context, format, maxChars } -> { text } | { error }
export async function aiWrite(body) {
  const { data, error } = await invoke("ai-writer", body)
  if (error) return { error }
  return { text: String(data?.text || "") }
}

// -> { data: { name, description, category, material, usedPhoto } } | { error }
export async function aiProductCopy(body) {
  return invoke("product-copywriter", body)
}

// { imageUrl, style, instruction, productName } -> { data: { image, style } } | { error }
export async function aiEnhancePhoto(body) {
  return invoke("product-image-studio", body)
}

// Only a photo already in our own Storage can be read by the functions.
export function isStoredPhoto(url) {
  return typeof url === "string" && /^https:\/\/.+\/storage\/v1\/object\/public\//.test(url)
}
