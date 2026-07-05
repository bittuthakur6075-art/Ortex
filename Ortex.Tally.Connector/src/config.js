// Loads ./config.json from the connector's working directory and applies a few
// sanity checks so misconfiguration fails loudly rather than silently.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

export function loadConfig() {
  const path = resolve(process.cwd(), "config.json")
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    throw new Error(`config.json not found at ${path} — copy config.example.json to config.json and fill it in.`)
  }
  const cfg = JSON.parse(raw)
  if (!cfg.tally?.url) throw new Error("config: tally.url is required")
  if (!cfg.tally?.company) throw new Error("config: tally.company is required")
  if (!cfg.supabase?.url || !cfg.supabase?.serviceKey || cfg.supabase.serviceKey.includes("PASTE")) {
    throw new Error("config: supabase.url and supabase.serviceKey are required")
  }
  cfg.ledgers = cfg.ledgers || {}
  cfg.sync = { customers: true, products: true, invoices: true, payments: true, intervalSeconds: 300, ...cfg.sync }
  return cfg
}
