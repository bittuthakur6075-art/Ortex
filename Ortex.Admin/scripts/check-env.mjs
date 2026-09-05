// Build-time guard: a production build must point at the PRODUCTION Supabase
// project, never at development.
//
// Why this exists: Vite loads `.env` in EVERY mode and lets `.env.<mode>`
// override it. So if `.env.production` is missing, `vite build --mode
// production` silently falls back to whatever `.env` holds — which is the
// development database. That ships an admin console wired to dev data with no
// visible symptom. This script makes that failure loud instead.
//
// Run by `npm run build` / `build:staging` / `build:production` before Vite.
// Usage: node scripts/check-env.mjs <mode>

import { existsSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const mode = process.argv[2] || "production"

// Minimal .env parser: KEY=VALUE, ignoring comments/blank lines. Quotes are
// stripped so a quoted URL compares equal to an unquoted one.
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

// Values are secrets; only ever report which FILE is at fault, never the value.
const fail = (msg) => {
  console.error(`\n✖ Environment check failed (mode: ${mode})\n\n${msg}\n`)
  process.exit(1)
}

const base = readEnv(".env") || {}
const modeFile = `.env.${mode}`
const modeEnv = readEnv(modeFile)

// Vercel and other CI hosts inject VITE_ vars directly instead of using files.
const fromProcess = process.env.VITE_SUPABASE_URL ? { VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL } : {}
const merged = { ...base, ...(modeEnv || {}), ...fromProcess }
const url = merged.VITE_SUPABASE_URL || ""

// Non-production modes may legitimately carry NO credentials. The repository
// then resolves to localStore (src/data/store/repository.js) and the console
// runs on browser localStorage with demo data — free, and unable to reach the
// live database. That is the intended local setup, not a misconfiguration.
if (mode !== "production" && !url) {
  console.log(`✔ ${mode} → no Supabase configured, running on the localStorage fallback`)
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

// The core check: production must not reuse the shared dev/staging project.
// Development and staging deliberately share ONE database (both are
// non-production), so only production is required to stand alone.
if (mode === "production") {
  for (const other of [".env.development", ".env.staging"]) {
    const otherUrl = readEnv(other)?.VITE_SUPABASE_URL || (other === ".env.development" ? base.VITE_SUPABASE_URL : "") || ""
    if (otherUrl && otherUrl === url) {
      fail(
        `This production build points at the shared DEV/STAGING Supabase project.\n` +
          `${modeFile} has the same VITE_SUPABASE_URL as ${other}.\n` +
          `Fix: put the production project's URL + anon key in ${modeFile}.`,
      )
    }
  }
  if (merged.VITE_ENV_LABEL) {
    fail(`VITE_ENV_LABEL is set in ${modeFile}; production must ship without an environment badge.\nFix: leave it blank.`)
  }
}

const ref = url.replace(/^https:\/\//, "").split(".")[0]
console.log(`✔ ${mode} build → Supabase project "${ref}"`)
