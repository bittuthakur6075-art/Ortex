// Every phone PDF is one A4 portrait sheet (src/documents/a4.ts).

import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"

const SRC = join(import.meta.dirname, "..", "src")
const files = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : []
  })
const rel = (f) => relative(SRC, f).split("\\").join("/")

test("PDFs are printed only by the two A4 paths, both at the shared A4 size", () => {
  const printers = files(SRC).filter((f) => readFileSync(f, "utf8").includes("printToFileAsync(")).map(rel).sort()
  assert.deepEqual(printers, ["lib/payslipPdf.ts", "lib/pdf.ts"])
  for (const f of printers) {
    const s = readFileSync(join(SRC, f), "utf8")
    assert.match(s, /width: A4\.width,\s*height: A4\.height/)
    assert.match(s, /from "@\/documents\/a4"/)
  }
})

test("each PDF template is an A4 page with no margin", () => {
  for (const f of ["documents/quotationHtml.ts", "documents/payslipHtml.ts"]) {
    assert.match(readFileSync(join(SRC, f), "utf8"), /@page \{ size: A4; margin: 0; \}/, f)
  }
  assert.match(readFileSync(join(SRC, "documents/a4.ts"), "utf8"), /A4 = \{ width: 595, height: 842 \}/)
})
