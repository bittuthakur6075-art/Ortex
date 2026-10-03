// Design-system rules oxlint cannot express, run after it by `npm run lint`
// (and so in CI). Each rule was brought to zero by the 2026-10-03 UI audit;
// this keeps it there. Prints every hit and exits 1 if there is any.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = fileURLToPath(new URL("../src", import.meta.url))

const RULES = [
  // Owner's rule: no em dash in on-screen text (a full stop, comma or colon instead).
  { name: "em dash in code (on-screen text)", re: /—/ },
  // Button has three sizes; an unknown one silently renders at md.
  { name: 'size="xs" (Button has sm, md, lg)', re: /size="xs"/ },
  // Flat surfaces: only the kit's overlay tokens may cast a shadow.
  { name: "in-page shadow", re: /\bshadow-(?:sm|md|lg|xl|2xl)\b/, skip: (f) => f.startsWith(`components${sep}ui${sep}`) },
  // Semantic tokens only; printed documents keep their fixed print colours.
  { name: "raw hex colour in a class", re: /-\[#[0-9a-fA-F]{3,8}\]/, skip: (f) => f.startsWith(`components${sep}documents${sep}`) },
]

// Comments may say anything: blank them out, keeping line numbers.
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")

const files = []
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) files.push(path)
  }
}
walk(SRC)

const hits = []
for (const path of files) {
  const file = relative(SRC, path)
  const lines = stripComments(readFileSync(path, "utf8")).split("\n")
  for (const rule of RULES) {
    if (rule.skip?.(file)) continue
    lines.forEach((line, i) => rule.re.test(line) && hits.push(`src${sep}${file}:${i + 1}  ${rule.name}`))
  }
}

if (hits.length) {
  console.error(`ui-guard: ${hits.length} design-system breach${hits.length === 1 ? "" : "es"}\n${hits.join("\n")}`)
  process.exit(1)
}
console.log(`ui-guard: ${files.length} files clean`)
