// Build-time guard: a production build of the marketing site must read the
// PRODUCTION Supabase project, never development.
//
// This matters more here than it looks: scripts/prerender.mjs reads the live
// catalogue at build time and bakes it into the static HTML, so building
// against the dev project would publish dev products to the public site.
//
// Vite loads `.env` in every mode and `.env.<mode>` overrides it, so a missing
// `.env.production` silently falls back to the dev values. This makes that loud.
//
// Usage: node scripts/check-env.mjs <mode>

import { existsSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const mode = process.argv[2] || "production"

function readEnv(file) {
  const path = resolve(root, file)
  if (!existsSync(path)) return null
  const out = {}
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return out
}

// Values are secrets; report the FILE at fault, never the value.
const fail = (msg) => {
  console.error(`\n✖ Environment check failed (mode: ${mode})\n\n${msg}\n`)
  process.exit(1)
}

const base = readEnv(".env") || {}
const modeFile = `.env.${mode}`
const modeEnv = readEnv(modeFile)
const fromProcess = process.env.VITE_SUPABASE_URL ? { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL } : {}
const merged = { ...base, ...(modeEnv || {}), ...fromProcess }
const url = merged.VITE_SUPABASE_URL || ""

// Non-production modes may legitimately carry NO credentials: the site then
// runs without a backend, and the contact form queues leads to localStorage
// (src/lib/leads.js) instead of inserting them into the live enquiries table.
if (mode !== "production" && !url) {
  console.log(`✔ ${mode} → no Supabase configured, running without a backend`)
  process.exit(0)
}

if (!modeEnv && !fromProcess.VITE_SUPABASE_URL) {
  fail(
    `${modeFile} is missing, so the build would inherit whatever .env holds.\n` +
      `Fix: cp ${modeFile}.example ${modeFile} and fill in the ${mode} Supabase URL + anon key.`,
  )
}

if (!url || url.includes("YOUR-")) {
  fail(`VITE_SUPABASE_URL is missing or still a placeholder.\nFix: set a real project URL in ${modeFile}.`)
}

// Development and staging deliberately share ONE database; production is the
// only environment required to stand alone.
if (mode === "production") {
  for (const other of [".env.development", ".env.staging"]) {
    const otherUrl = readEnv(other)?.VITE_SUPABASE_URL || (other === ".env.development" ? base.VITE_SUPABASE_URL : "") || ""
    if (otherUrl && otherUrl === url) {
      fail(
        `This production build would prerender the public site from the shared DEV/STAGING project.\n` +
          `${modeFile} has the same VITE_SUPABASE_URL as ${other}.\n` +
          `Fix: put the production project's URL + anon key in ${modeFile}.`,
      )
    }
  }
}

const ref = url.replace(/^https:\/\//, "").split(".")[0]
console.log(`✔ ${mode} build → Supabase project "${ref}"`)
