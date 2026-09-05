// Provision a Supabase project so it matches this repo: push every migration
// and deploy every Edge Function. Used when standing up a NEW environment (a
// fresh production project) or catching an existing one up.
//
// Usage:
//   node scripts/provision-supabase.mjs <project-ref>
//   node scripts/provision-supabase.mjs <project-ref> --dry-run
//
// Requires the Supabase CLI, logged in (`supabase login`). Secrets are NOT set
// here — they are per-project values you paste yourself; the script prints the
// exact commands at the end.

import { execFileSync } from "node:child_process"
import { readdirSync, existsSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const ref = process.argv[2]
const dryRun = process.argv.includes("--dry-run")

if (!ref || ref.startsWith("--")) {
  console.error("Usage: node scripts/provision-supabase.mjs <project-ref> [--dry-run]")
  process.exit(1)
}

const functionsDir = resolve(root, "supabase/functions")
const migrationsDir = resolve(root, "supabase/migrations")

// `_shared` is a library folder imported by the others, not a deployable function.
const functions = readdirSync(functionsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
  .map((e) => e.name)
  .sort()

const migrations = existsSync(migrationsDir) ? readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort() : []

console.log(`Target project : ${ref}`)
console.log(`Migrations     : ${migrations.length} (${migrations[0]} … ${migrations.at(-1)})`)
console.log(`Edge functions : ${functions.length}`)
console.log(dryRun ? "\nDry run — nothing will be executed.\n" : "")

const run = (args) => {
  console.log(`\n$ supabase ${args.join(" ")}`)
  if (dryRun) return
  execFileSync("supabase", args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" })
}

try {
  // Link this checkout to the target project, then apply the schema.
  run(["link", "--project-ref", ref])
  run(["db", "push"])
  for (const fn of functions) run(["functions", "deploy", fn, "--project-ref", ref])
} catch (err) {
  console.error(`\n✖ Provisioning stopped: ${err.message}`)
  console.error("Fix the error above and re-run — the steps are idempotent.")
  process.exit(1)
}

console.log(`
✔ Schema and functions are on ${ref}.

Still to do by hand (per-project values, never committed):

  1. Secrets — set the ones your functions use:
       supabase secrets set GEMINI_API_KEY=...        --project-ref ${ref}
       supabase secrets set META_ACCESS_TOKEN=...     --project-ref ${ref}
       supabase secrets set INDIAMART_CRM_KEY=...     --project-ref ${ref}

  2. Auth — Dashboard → Authentication → Providers → Email:
       "Allow new users to sign up" = OFF   (this console is invite-only)

  3. First admin — create the account, then activate it via admin-create-user.

  4. Front-end env — put this project's URL + anon key in the matching
     .env.<mode> file (see docs/ENVIRONMENTS.md).
`)
