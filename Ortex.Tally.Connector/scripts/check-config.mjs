// Compares config.json with config.example.json after an update: lists the
// settings a newer connector knows about that this server's config lacks, and
// warns about values that would post wrong vouchers. Never prints a value that
// could be a secret. Exit code 1 when something must be fixed before syncing.
// Run: npm run check-config
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const read = (f) => JSON.parse(readFileSync(join(root, f), "utf8"))

if (!existsSync(join(root, "config.json"))) {
  console.error("✗ config.json is missing. Copy config.example.json to config.json and fill it in.")
  process.exit(1)
}
const example = read("config.example.json")
const config = read("config.json")

// Keys the example has that config.json does not (partyMap entries are examples, not keys to copy).
const missing = []
const walk = (ex, cf, path) => {
  for (const [k, v] of Object.entries(ex)) {
    const p = path ? `${path}.${k}` : k
    if (p === "ledgers.partyMap") continue
    if (!cf || !(k in cf)) missing.push(p)
    else if (v && typeof v === "object" && !Array.isArray(v)) walk(v, cf[k], p)
  }
}
walk(example, config, "")

const errors = []
const warnings = []
const s = config.supabase || {}
if (!s.url || /YOUR-PROJECT-REF/.test(s.url)) errors.push("supabase.url is not set.")
if (!s.serviceKey || /PASTE/.test(s.serviceKey)) errors.push("supabase.serviceKey is not set.")
const L = config.ledgers || {}
const sync = { payouts: false, payments: true, ...(config.sync || {}) }
if (!L.receiptAccount) errors.push("ledgers.receiptAccount is not set (the cash or bank ledger receipts are debited to).")
if (L.partyMap && typeof L.partyMap !== "object") errors.push("ledgers.partyMap must be an object { \"party as typed\": \"Tally ledger\" }.")
if (sync.payouts && !L.payoutDefault && !Object.keys(L.partyMap || {}).length)
  warnings.push("sync.payouts is on but there is no ledgers.payoutDefault or partyMap: every payout will be refused (marked error).")
if (sync.payouts)
  warnings.push("sync.payouts is on: payouts NOT yet marked synced will be posted to Tally, past ones included. Turn it on only once past payouts are already in Tally.")
if (/^https?:\/\/(?!localhost|127\.0\.0\.1)/.test(config.tally?.url || ""))
  warnings.push(`tally.url points at another machine. Tally's gateway has no password: keep it on this server or a private LAN, never the internet.`)

console.log(missing.length ? `Settings this config does not have yet (defaults apply):\n  - ${missing.join("\n  - ")}` : "✓ config.json has every setting the example has.")
for (const w of warnings) console.log(`! ${w}`)
for (const e of errors) console.error(`✗ ${e}`)
if (errors.length) process.exit(1)
console.log("✓ config.json is usable.")
