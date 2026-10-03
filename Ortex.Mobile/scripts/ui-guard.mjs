// One UI rules oxlint cannot express, run after it by `npm run lint` (and so
// in CI). Each rule was brought to zero by the 2026-10-03 UI audit; this keeps
// it there. Prints every hit and exits 1 if there is any.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = fileURLToPath(new URL("../src", import.meta.url))
const inUi = (f) => f.startsWith(`ui${sep}`)

const RULES = [
  // Owner's rule: no em dash in on-screen text (a full stop, comma or colon instead).
  { name: "em dash in code (on-screen text)", re: /—/ },
  // Owner's rule: no shadow anywhere except the bottom tab bar.
  {
    name: "shadow outside the tab bar",
    re: /\b(?:shadowColor|shadowOpacity|elevation)\s*:/,
    skip: (f) => f === `navigation${sep}OneUiTabBar.tsx`,
  },
  // Android does not synthesise weights: pick a fontFamily from theme/typography.
  { name: "fontWeight (use a fontFamily)", re: /\bfontWeight\b/ },
  // One dialog look: ui/Dialog, not the system alert.
  // src/lib helpers run outside any screen (a permission ask, a dialer fallback), where only the native Alert can show.
  { name: "Alert.alert in a screen (use ui/Dialog)", re: /\bAlert\.alert\b/, skip: (f) => inUi(f) || f.startsWith(`lib${sep}`) },
  // Bare workflow: Reanimated is not installed.
  { name: "Reanimated import", re: /from\s+["']react-native-reanimated["']|require\(["']react-native-reanimated["']\)/ },
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
