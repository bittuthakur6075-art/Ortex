// Build-time guard: assert each static route's prerendered title/description
// still matches the string its page passes to useDocumentMetadata(). This
// catches the classic drift where a page's <title> is edited but the prerender
// metadata (what non-JS crawlers index) is forgotten.
//
// It works textually: the exact title and description strings must appear
// verbatim in the page's source file. Runs before prerender in `npm run build`,
// so a mismatch fails the build instead of shipping stale SEO metadata.

import { readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { STATIC_ROUTES, ROUTE_SOURCE } from "./routes-meta.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const errors = []

for (const route of STATIC_ROUTES) {
  const rel = ROUTE_SOURCE[route.path]
  if (!rel) {
    errors.push(`No source file mapped for ${route.path} (add it to ROUTE_SOURCE).`)
    continue
  }
  let src
  try {
    src = readFileSync(join(root, rel), "utf8")
  } catch {
    errors.push(`Cannot read ${rel} for ${route.path}.`)
    continue
  }
  if (!src.includes(route.title)) {
    errors.push(`Title drift on ${route.path}: prerender title not found in ${rel}.\n    prerender: "${route.title}"`)
  }
  if (!src.includes(route.description)) {
    errors.push(`Description drift on ${route.path}: prerender description not found in ${rel}.`)
  }
}

if (errors.length) {
  console.error("\nSEO metadata check FAILED:\n- " + errors.join("\n- "))
  console.error("\nFix: update scripts/routes-meta.mjs to match the page's useDocumentMetadata call (or vice versa).\n")
  process.exit(1)
}

console.log(`SEO metadata check passed (${STATIC_ROUTES.length} routes in sync).`)
