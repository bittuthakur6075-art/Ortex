// Spreadsheet import of enquiries: the phone and the console must turn the same
// sheet into the same enquiries, or a file imported twice (once from each)
// would not be recognised as a repeat.
//   Ortex.Admin/src/lib/enquiryImport.js  (source of truth)
//   Ortex.Mobile/src/domain/enquiryImport.ts  (the port)

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/enquiryImport.js"))
const mobile = await loadTs("domain/enquiryImport.ts")

const today = new Date("2026-09-27T12:00:00Z")
const ROWS = [
  ["", "Name ", "Mobile No.", "Status", "Mobile No.2", " Type of Product", "Quantity", "Rate", "City", "company Name", "Email id", ""],
  ["", "Before Date", 9307904816, "", "waiting for call", "Acrylic", "4l", "", "Beed", "", "", ""],
  ["21/12/2025", "Narendra", "+91 72404 44040", "order received", 9876543210, "Wrist band", "1,500", "6.5", "Mahwa", "Hardik", "N@X.IN", "spec"],
  [45683, "Swapped", 9811599339, "price given waiting for order", "", "Keychain", "Missed call", "", "Palam", "", "no email", ""],
  ["5/1/26", "Asha", "096599056431", "call not picked", 46132, "Badge", "3K-4K", "", "", "", "", ""],
  ["", "Asha", "096599056431", "call not picked", 46132, "Badge", "3K-4K", "", "", "", "", ""],
  ["", "", "", "not interested", "", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "Pen", "", "", "", "", "", ""],
]

test("phone and console read a sheet identically", () => {
  const a = admin.sheetToEnquiries(ROWS, { fileName: "x.xlsx", today })
  const b = mobile.sheetToEnquiries(ROWS, { fileName: "x.xlsx", today })
  assert.deepEqual(b, a)
  assert.equal(a.enquiries.length, 4)
  assert.deepEqual(a.skipped.map((s) => s.reason), ["Repeated in this file", "No name or mobile"])
})

test("helpers agree", () => {
  for (const v of ["4l", "2.5k", "2000+", "3K-4K", 750, ""]) assert.equal(mobile.parseQuantity(v), admin.parseQuantity(v))
  for (const v of ["price given", "Already given order to other", "order received", "pi given", ""]) assert.equal(mobile.mapStatus(v), admin.mapStatus(v))
  for (const v of [45683, "5/1/26", "27/062026"]) assert.equal(mobile.parseDate(v, "2025-12-21", today), admin.parseDate(v, "2025-12-21", today))
})
