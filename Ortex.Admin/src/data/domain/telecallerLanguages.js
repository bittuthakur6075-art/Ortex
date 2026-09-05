// Languages the telecaller can speak. `speech` is the Gemini Live / TTS locale
// hint; languages without a supported locale fall back to hi-IN and rely on
// the model's own language detection. Mirrored in
// supabase/functions/_shared/telecaller.ts (LANGUAGES) — keep the ids in step.
//
// Quality tiers reflect current Gemini Live behaviour: "strong" languages are
// safe for customer calls, "basic" ones work but with weaker pronunciation.

export const TELECALL_LANGUAGES = [
  { id: "auto", label: "Auto - open in Hinglish, match the customer", speech: "hi-IN", tier: "strong" },
  { id: "hinglish", label: "Hinglish (Hindi + English)", speech: "hi-IN", tier: "strong" },
  { id: "hi", label: "Hindi", speech: "hi-IN", tier: "strong" },
  { id: "en", label: "English (Indian)", speech: "en-IN", tier: "strong" },
  { id: "bn", label: "Bengali", speech: "bn-IN", tier: "strong" },
  { id: "ta", label: "Tamil", speech: "ta-IN", tier: "strong" },
  { id: "te", label: "Telugu", speech: "te-IN", tier: "strong" },
  { id: "mr", label: "Marathi", speech: "mr-IN", tier: "strong" },
  { id: "gu", label: "Gujarati", speech: "gu-IN", tier: "strong" },
  { id: "kn", label: "Kannada", speech: "kn-IN", tier: "strong" },
  { id: "ml", label: "Malayalam", speech: "ml-IN", tier: "strong" },
  { id: "pa", label: "Punjabi", speech: "hi-IN", tier: "basic" },
  { id: "or", label: "Odia", speech: "hi-IN", tier: "basic" },
  { id: "as", label: "Assamese", speech: "hi-IN", tier: "basic" },
  { id: "ur", label: "Urdu", speech: "hi-IN", tier: "basic" },
]

export const languageMeta = (id) => TELECALL_LANGUAGES.find((l) => l.id === id) || TELECALL_LANGUAGES[0]
