// Anu, the voice assistant, is the SAME code on both sites. Ortex.Web owns it;
// this site carries a byte-for-byte copy, because the two are independent npm
// projects and cannot import from each other. This check fails the build when
// the copy has drifted, so a fix made on one site cannot silently miss the
// other. Copy from Ortex.Web to fix it:
//
//   cp -r ../Ortex.Web/src/components/ui/live-orty src/components/ui/
//   (and the other files listed below)
//
// What legitimately differs per site lives OUTSIDE these files: QUOTE_PATH and
// CONTACT in constants/site.js, and submitEnquiry (with its site tag) in
// lib/leads.js.

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = join(dirname(fileURLToPath(import.meta.url)), "..")
const web = join(here, "..", "Ortex.Web")

if (!existsSync(web)) {
  // A build outside the monorepo has nothing to compare against.
  console.warn("check-anu-mirror: ../Ortex.Web not found, skipped")
  process.exit(0)
}

const DIR = "src/components/ui/live-orty"
const files = [
  ...readdirSync(join(web, DIR)).map((f) => `${DIR}/${f}`),
  "src/components/ui/LiveOrty.jsx",
  "src/constants/business.js",
  "public/anu-mic-worklet.js",
  "public/img/anu.jpg",
]
// A file added here but not in Ortex.Web would be dead weight nobody updates.
const extra = readdirSync(join(here, DIR)).filter((f) => !existsSync(join(web, DIR, f)))

const drift = files.filter((f) => {
  const mine = join(here, f)
  // Line endings are normalised so a Windows checkout does not fail the check.
  const read = (p) => (f.endsWith(".jpg") ? readFileSync(p).toString("base64") : readFileSync(p, "utf8").replace(/\r\n/g, "\n"))
  return !existsSync(mine) || read(mine) !== read(join(web, f))
})

if (drift.length || extra.length) {
  console.error("check-anu-mirror: Anu's files differ from Ortex.Web:")
  for (const f of drift) console.error(`  differs or missing: ${f}`)
  for (const f of extra) console.error(`  not in Ortex.Web:   ${DIR}/${f}`)
  console.error("Copy them from Ortex.Web (see the header of scripts/check-anu-mirror.mjs).")
  process.exit(1)
}
console.log(`check-anu-mirror: ${files.length} files identical to Ortex.Web`)
