// Push the auth email templates in supabase/templates/ to a Supabase project.
//
// WHY THIS EXISTS
// Email templates are project configuration, not schema: `supabase db push`
// does not carry them, and neither does anything else in this repo. Without
// this, the dashboard is the only copy -- so the repo's template drifts out of
// date, nobody can see what changed or when, and a fresh project silently
// keeps Supabase's stock text. That stock Magic Link template mails a sign-in
// LINK, which src/lib/auth.js cannot accept: it verifies a 6-digit code.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/push-email-templates.mjs
//   ... --dry-run     show what would change, send nothing
//
// The token is a personal access token from
// https://supabase.com/dashboard/account/tokens. It is account-scoped, so it
// is read from the environment only -- never a file, never an argument (which
// would land in shell history and process listings). Nothing here writes it
// anywhere.
//
// Target project comes from VITE_SUPABASE_URL in .env.production, so this
// always follows the same project the app is pointed at.

import { existsSync, readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const dryRun = process.argv.includes("--dry-run")

const die = (msg) => {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

// Which local file maps to which pair of Management API fields. Add a row here
// when you add a template; the API names are fixed by Supabase.
const TEMPLATES = [
  {
    file: "supabase/templates/magic-link.html",
    subjectField: "mailer_subjects_magic_link",
    contentField: "mailer_templates_magic_link_content",
    subject: "Your Ortex sign-in code",
    label: "Magic Link (sign-in code)",
  },
]

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

const token = process.env.SUPABASE_ACCESS_TOKEN
if (!token) {
  die(
    "No SUPABASE_ACCESS_TOKEN in the environment.\n\n" +
      "  Create one at https://supabase.com/dashboard/account/tokens, then:\n\n" +
      "    PowerShell:  $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'\n" +
      "    bash:        export SUPABASE_ACCESS_TOKEN=sbp_...\n\n" +
      "  Set it in the shell only. It grants access to every project on your\n" +
      "  account, so keep it out of files and out of command arguments.",
  )
}

const url = readEnv(".env.production").VITE_SUPABASE_URL
if (!url) die("No VITE_SUPABASE_URL in .env.production -- nothing to target.")
const ref = url.replace(/^https:\/\//, "").split(".")[0]

// The templates carry long HTML comments explaining their own constraints,
// which is right for the file and wrong for the wire: they would be mailed to
// every recipient, and they discuss {{ .ConfirmationURL }} by name, which would
// trip the check below. Strip them before validating and before sending, so
// what gets validated is exactly what gets mailed.
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\n/gm, "")

// Refuse to push a template that would break sign-in. The whole point of the
// custom template is that {{ .Token }} makes Supabase mail a code instead of a
// link; without it we would silently restore the broken behaviour, and with a
// ConfirmationURL alongside it both get sent.
function validate(html, label) {
  if (!/\{\{\s*\.Token\s*\}\}/.test(html)) {
    die(`${label}: no {{ .Token }} in the template. Supabase would mail a link, which the console cannot accept.`)
  }
  if (/\{\{\s*\.ConfirmationURL\s*\}\}/.test(html)) {
    die(`${label}: contains {{ .ConfirmationURL }}. That mails a link as well as the code -- remove it.`)
  }
  if (/REPLACE-WITH-PUBLIC-URL/.test(html)) {
    console.warn(`  ! ${label}: the logo src is still a placeholder, so the image will not load.`)
    console.warn(`    Readers will see the alt text. Upload public/img/logo-email.png to a public`)
    console.warn(`    storage bucket and put its URL in the template to fix it.`)
  }
}

const body = {}
console.log(`\nProject "${ref}"\n`)

for (const t of TEMPLATES) {
  const path = resolve(root, t.file)
  if (!existsSync(path)) die(`Missing ${t.file}`)
  const raw = readFileSync(path, "utf8")
  const html = stripComments(raw)
  validate(html, t.label)
  body[t.contentField] = html
  body[t.subjectField] = t.subject
  console.log(`  ${t.label}`)
  console.log(`    from    ${t.file} (${(raw.length / 1024).toFixed(1)} KB → ${(html.length / 1024).toFixed(1)} KB sent)`)
  console.log(`    subject ${t.subject}`)
}

if (dryRun) {
  console.log(`\nDry run -- nothing sent. Drop --dry-run to apply.\n`)
  process.exit(0)
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

if (!res.ok) {
  const text = await res.text()
  die(`Supabase returned ${res.status}.\n\n  ${text.slice(0, 400)}`)
}

console.log(`\n✔ Templates updated. Send yourself a sign-in code to check.\n`)
