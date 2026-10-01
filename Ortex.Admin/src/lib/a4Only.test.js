// Every console PDF is one A4 portrait sheet: html2pdf.js is used only by the
// shared builder (components/documents/documentPdf.jsx) and the payslip run that
// reuses its A4 settings, never with a page size of its own.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

import { A4_JSPDF, A4_SHEET } from "./a4"

const SRC = join(__dirname, "..")
const ALLOWED = ["components/documents/documentPdf.jsx", "components/documents/payslipPdf.jsx"]

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(jsx?|tsx?)$/.test(name) ? [p] : []
  })
}

describe("PDFs are A4 only", () => {
  it("the shared settings are A4 portrait, captured at A4 96dpi", () => {
    expect(A4_JSPDF).toEqual({ unit: "pt", format: "a4", orientation: "portrait" })
    expect(A4_SHEET).toEqual({ width: "794px", minHeight: "1123px" })
  })

  it("html2pdf.js is used only by the shared A4 builder", () => {
    const users = files(SRC)
      .filter((f) => !f.endsWith(".test.js"))
      .filter((f) => /["']html2pdf\.js["']/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split("\\").join("/"))
    expect(users.sort()).toEqual(ALLOWED)
  })

  it("no PDF sets its own page size", () => {
    for (const f of ALLOWED) {
      expect(readFileSync(join(SRC, f), "utf8")).not.toMatch(/format:\s*["'`]/)
    }
  })
})
