// Where is the customer? Used to pick the local language, the regional
// festivals and the right opener. Signals, strongest first:
//   1. customer.stateCode (GST state code, "07" = Delhi) or the first two
//      digits of a GSTIN,
//   2. city / address text (lead, enquiry, invoice, ship-to, voice-lead city),
//   3. the language they used on an earlier call.
// The mobile number is NOT used: Indian numbers moved freely between circles
// under number portability, so the old prefix tables are wrong too often.

export type Region = {
  state: string
  code: string
  /** telecallerLanguages id for the local language ("hi" where Hindi dominates). */
  language: string
  /** Hindi is NOT the safe default here: open in English, switch if they do. */
  englishFirst?: boolean
  /** Extra keywords the calendar matches regional festivals against. */
  hints: string[]
}

const STATES: Region[] = [
  { code: "01", state: "Jammu & Kashmir", language: "ur", hints: ["jammu", "kashmir", "srinagar"] },
  { code: "02", state: "Himachal Pradesh", language: "hi", hints: ["himachal", "shimla"] },
  { code: "03", state: "Punjab", language: "pa", hints: ["punjab", "ludhiana", "amritsar", "jalandhar", "mohali", "pa"] },
  { code: "04", state: "Chandigarh", language: "pa", hints: ["chandigarh", "punjab", "pa"] },
  { code: "05", state: "Uttarakhand", language: "hi", hints: ["uttarakhand", "dehradun", "haridwar"] },
  { code: "06", state: "Haryana", language: "hi", hints: ["haryana", "gurgaon", "gurugram", "faridabad", "sonipat", "panipat", "delhi"] },
  { code: "07", state: "Delhi", language: "hi", hints: ["delhi", "new delhi", "noida", "gurgaon"] },
  { code: "08", state: "Rajasthan", language: "hi", hints: ["rajasthan", "jaipur", "jodhpur", "udaipur", "kota"] },
  { code: "09", state: "Uttar Pradesh", language: "hi", hints: ["uttar pradesh", "lucknow", "noida", "ghaziabad", "kanpur", "agra", "varanasi", "purvanchal"] },
  { code: "10", state: "Bihar", language: "hi", hints: ["bihar", "patna", "purvanchal"] },
  { code: "11", state: "Sikkim", language: "hi", hints: ["sikkim", "gangtok"] },
  { code: "12", state: "Arunachal Pradesh", language: "hi", hints: ["arunachal", "itanagar"] },
  { code: "13", state: "Nagaland", language: "en", englishFirst: true, hints: ["nagaland", "kohima", "dimapur"] },
  { code: "14", state: "Manipur", language: "en", englishFirst: true, hints: ["manipur", "imphal"] },
  { code: "15", state: "Mizoram", language: "en", englishFirst: true, hints: ["mizoram", "aizawl"] },
  { code: "16", state: "Tripura", language: "bn", hints: ["tripura", "agartala", "bn"] },
  { code: "17", state: "Meghalaya", language: "en", englishFirst: true, hints: ["meghalaya", "shillong"] },
  { code: "18", state: "Assam", language: "as", hints: ["assam", "guwahati", "dibrugarh", "as"] },
  { code: "19", state: "West Bengal", language: "bn", hints: ["west bengal", "bengal", "kolkata", "howrah", "siliguri", "durgapur", "bn"] },
  { code: "20", state: "Jharkhand", language: "hi", hints: ["jharkhand", "ranchi", "jamshedpur", "dhanbad"] },
  { code: "21", state: "Odisha", language: "or", hints: ["odisha", "orissa", "bhubaneswar", "cuttack", "rourkela", "or"] },
  { code: "22", state: "Chhattisgarh", language: "hi", hints: ["chhattisgarh", "raipur", "bhilai"] },
  { code: "23", state: "Madhya Pradesh", language: "hi", hints: ["madhya pradesh", "bhopal", "indore", "jabalpur", "gwalior"] },
  { code: "24", state: "Gujarat", language: "gu", hints: ["gujarat", "ahmedabad", "surat", "vadodara", "baroda", "rajkot", "gandhinagar", "gu"] },
  { code: "26", state: "Dadra & Nagar Haveli and Daman & Diu", language: "gu", hints: ["daman", "silvassa", "gu"] },
  { code: "27", state: "Maharashtra", language: "mr", hints: ["maharashtra", "mumbai", "bombay", "pune", "nagpur", "nashik", "thane", "navi mumbai", "aurangabad", "mr"] },
  { code: "29", state: "Karnataka", language: "kn", englishFirst: true, hints: ["karnataka", "bengaluru", "bangalore", "mysuru", "mysore", "mangaluru", "hubli", "kn"] },
  { code: "30", state: "Goa", language: "en", englishFirst: true, hints: ["goa", "panaji", "margao"] },
  { code: "31", state: "Lakshadweep", language: "ml", englishFirst: true, hints: ["lakshadweep", "ml"] },
  { code: "32", state: "Kerala", language: "ml", englishFirst: true, hints: ["kerala", "kochi", "cochin", "thiruvananthapuram", "trivandrum", "kozhikode", "calicut", "thrissur", "ml"] },
  { code: "33", state: "Tamil Nadu", language: "ta", englishFirst: true, hints: ["tamil nadu", "tamilnadu", "chennai", "madras", "coimbatore", "madurai", "tiruchirappalli", "trichy", "salem", "tirupur", "ta"] },
  { code: "34", state: "Puducherry", language: "ta", englishFirst: true, hints: ["puducherry", "pondicherry", "ta"] },
  { code: "35", state: "Andaman & Nicobar", language: "hi", hints: ["andaman", "port blair"] },
  { code: "36", state: "Telangana", language: "te", hints: ["telangana", "hyderabad", "secunderabad", "warangal", "te"] },
  { code: "37", state: "Andhra Pradesh", language: "te", hints: ["andhra", "vijayawada", "visakhapatnam", "vizag", "guntur", "tirupati", "nellore", "te"] },
  { code: "38", state: "Ladakh", language: "hi", hints: ["ladakh", "leh"] },
]

const byCode = (code: string) => STATES.find((s) => s.code === code)

export type Detected = Region & { source: string; confidence: "high" | "medium" | "low" }

/**
 * Best guess at the customer's state from whatever records we have.
 * `texts` are free-form city / address strings; `stateCodes` are GST codes or
 * GSTINs; `priorLanguage` is a telecallerLanguages id from an earlier call.
 */
export function detectRegion(input: { stateCodes?: (string | undefined | null)[]; texts?: (string | undefined | null)[]; priorLanguage?: string | null }): Detected | null {
  for (const raw of input.stateCodes || []) {
    const v = String(raw || "").trim()
    if (!v) continue
    const code = /^\d{2}$/.test(v) ? v : /^\d{2}[A-Z0-9]{13}$/i.test(v) ? v.slice(0, 2) : ""
    const r = code ? byCode(code) : undefined
    if (r) return { ...r, source: /^\d{2}$/.test(v) ? "GST state code" : "GSTIN", confidence: "high" }
  }
  const blob = (input.texts || []).map((t) => String(t || "").toLowerCase()).filter(Boolean).join(" | ")
  if (blob) {
    // Longest keyword wins so "navi mumbai" beats "mumbai" and "new delhi" beats "delhi".
    let best: { r: Region; len: number } | null = null
    for (const r of STATES) {
      for (const h of r.hints) {
        if (h.length < 4) continue // language ids are for the calendar, not text matching
        if (blob.includes(h) && (!best || h.length > best.len)) best = { r, len: h.length }
      }
    }
    if (best) return { ...best.r, source: "address / city", confidence: "medium" }
  }
  if (input.priorLanguage && input.priorLanguage !== "auto" && input.priorLanguage !== "hinglish") {
    const r = STATES.find((s) => s.language === input.priorLanguage)
    if (r) return { ...r, source: "language used on an earlier call", confidence: "low" }
  }
  return null
}

const LANGUAGE_NAMES: Record<string, string> = {
  hi: "Hindi", en: "English", bn: "Bengali", ta: "Tamil", te: "Telugu", mr: "Marathi", gu: "Gujarati", kn: "Kannada", ml: "Malayalam", pa: "Punjabi", or: "Odia", as: "Assamese", ur: "Urdu",
}
export const languageName = (id: string) => LANGUAGE_NAMES[id] || id

/** Prompt block for the brief. */
export function regionBrief(r: Detected | null, autoLanguage: boolean): string {
  if (!r) return "Region unknown: ask the delivery city early (it also tells you which festivals matter to them)."
  const local = languageName(r.language)
  const opener = !autoLanguage
    ? ""
    : r.englishFirst
      ? `Hindi is not the safe default there: OPEN IN ENGLISH, and switch fully to ${local} the moment they use it.`
      : r.language === "hi"
        ? "Open in Hinglish."
        : `Open in Hinglish; if they answer in ${local}, switch fully to ${local} for the rest of the call.`
  return `Customer appears to be in ${r.state} (from ${r.source}, ${r.confidence} confidence). Local language: ${local}. ${opener} Use local references naturally (city, regional festivals below, local business seasons) without overdoing it.`
}
