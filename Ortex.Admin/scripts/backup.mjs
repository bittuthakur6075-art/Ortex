// Back up the production database to a timestamped JSON file.
//
// Why this exists: the Supabase free plan has no automated backups, and this
// database holds GST invoices and payment records you are required to retain.
// This closes that gap without paying for a plan, and without needing Postgres
// client tools installed — it reads through the REST API using the service-role
// key, so it works on any machine that can run Node.
//
// Usage:
//   npm run backup                 # writes backups/ortex-YYYY-MM-DD.json
//   npm run backup -- --out D:/x   # write somewhere else (e.g. a synced drive)
//
// Credentials come from .env.production:
//   VITE_SUPABASE_URL           (already there)
//   SUPABASE_SERVICE_ROLE_KEY   (add it — Dashboard → Settings → API)
//
// The service-role key bypasses row-level security, which is what lets one
// script read every table. It is NOT prefixed with VITE_, so Vite never bundles
// it into the browser build. Keep it out of git; .env* is already ignored.
//
// Scope: this captures your business DATA. It does not capture the schema
// (that lives in supabase/migrations/), auth users, or Storage objects. To
// restore, provision a project with `npm run provision -- <ref>` and load the
// JSON back through the app or a small insert script.

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createClient } from "@supabase/supabase-js"
import { COLLECTIONS } from "../src/data/domain/schema.js"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

function readEnv(file) {
  const path = resolve(root, file)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
}

const env = { ...readEnv(".env"), ...readEnv(".env.production"), ...process.env }
const url = env.VITE_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

const die = (msg) => {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

if (!url) die("No VITE_SUPABASE_URL in .env.production. Nothing to back up.")
if (!key) {
  die(
    "No SUPABASE_SERVICE_ROLE_KEY found.\n\n" +
      "  Get it from the Supabase Dashboard → Settings → API → service_role,\n" +
      "  then add this line to Ortex.Admin/.env.production:\n\n" +
      "    SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n" +
      "  It is not VITE_-prefixed, so it never reaches the browser bundle.",
  )
}

// Where to write. Default is backups/ next to the app; --out overrides so the
// file can land straight on a synced or remote drive.
const outFlag = process.argv.indexOf("--out")
const outDir = outFlag > -1 ? process.argv[outFlag + 1] : resolve(root, "backups")
const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")
const file = resolve(outDir, `ortex-${stamp}.json`)

const supabase = createClient(url, key, { auth: { persistSession: false } })

// Page through a table. The REST API caps a response at 1000 rows, so a table
// that ever outgrows that must still come back whole.
async function fetchAll(table) {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

const ref = url.replace(/^https:\/\//, "").split(".")[0]
console.log(`Backing up project "${ref}"\n`)

const dump = { takenAt: new Date().toISOString(), project: ref, tables: {} }
let total = 0
const missing = []

for (const table of [...COLLECTIONS, "settings", "sequences"]) {
  try {
    const rows = await fetchAll(table)
    dump.tables[table] = rows
    total += rows.length
    console.log(`  ${String(rows.length).padStart(6)}  ${table}`)
  } catch (err) {
    // A table can be legitimately absent when a migration has not been applied
    // to this project yet. Record it and keep going rather than losing the run.
    missing.push(table)
    console.log(`  ${"—".padStart(6)}  ${table}  (skipped: ${err.message})`)
  }
}

mkdirSync(outDir, { recursive: true })
writeFileSync(file, JSON.stringify(dump, null, 2))

const mb = (Buffer.byteLength(JSON.stringify(dump)) / 1024 / 1024).toFixed(2)
console.log(`\n✔ ${total} rows across ${Object.keys(dump.tables).length} tables → ${file} (${mb} MB)`)
if (missing.length) console.log(`  Skipped: ${missing.join(", ")}`)
console.log(`\nKeep a copy off this machine. Uploading it to your Hostinger storage is enough.`)
