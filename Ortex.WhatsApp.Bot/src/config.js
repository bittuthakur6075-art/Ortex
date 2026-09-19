// Reads config.json (copied from config.example.json, gitignored: it holds the
// Supabase service_role key) and fills every optional field with its default,
// so the rest of the bot can read config.x.y without guarding.
import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const DEFAULTS = {
  gemini: { apiKey: "", model: "gemini-3.6-flash" },
  whatsapp: { group: "Ortex Bot", answerEverything: true, prefixes: ["/", "bot", "?"] },
  timezone: "Asia/Kolkata",
  digest: { daily: "09:00", weekly: { day: "Monday", time: "09:00" } },
  alerts: {
    enabled: true,
    checkEverySeconds: 60,
    newEnquiry: true,
    voiceCall: true,
    quoteWon: true,
    paymentReceived: true,
    quietHours: { from: "21:00", to: "08:00" },
  },
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v)
function merge(base, over) {
  if (!isObj(over)) return over === undefined ? base : over
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = isObj(base?.[k]) ? merge(base[k], v) : v
  return out
}

export function loadConfig(file = path.join(ROOT, "config.json")) {
  if (!existsSync(file)) {
    throw new Error(`No config.json. Copy config.example.json to config.json and fill in the Supabase service_role key.`)
  }
  const cfg = merge(DEFAULTS, JSON.parse(readFileSync(file, "utf8")))
  if (!cfg.supabase?.url || !cfg.supabase?.serviceKey || /PASTE/.test(cfg.supabase.serviceKey)) {
    throw new Error("config.json: supabase.url and supabase.serviceKey are required.")
  }
  if (cfg.gemini.apiKey && !process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = cfg.gemini.apiKey
  return cfg
}
