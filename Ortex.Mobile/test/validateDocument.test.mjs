// Quotation and invoice validation: the phone and the console must refuse the
// same drafts with the same words.
//   Ortex.Admin/src/lib/validateDocument.js  (source of truth, vitest suite)
//   Ortex.Mobile/src/domain/validateDocument.ts  (the port)

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/validateDocument.js"))
const mobile = await loadTs("domain/validateDocument.ts")
const contact = await loadTs("features/contacts/validateContact.ts")

const NOW = new Date("2026-10-03T06:00:00Z").getTime()
const DAY = 86400000
const line = { productId: "p1", description: "Acrylic award", hsn: "3926", quantity: 100, unit: "pcs", rate: 250, discountPercent: 0, gstRate: 18 }
const customer = { name: "Ravi Kumar", company: "Bright Corp", email: "ravi@brightcorp.in", phone: "9811122233", gstin: "07BFMPM7025K1Z2", stateCode: "07", address: "B-12, Okhla Phase 2, New Delhi 110020" }
const good = { companyId: "ortex", customer, shipTo: null, lines: [line], extraDiscountPercent: 0, issueDate: new Date(NOW).toISOString(), validityDays: 15, paymentTerms: "", notes: "", terms: "" }

// Every rule broken at least once, valid drafts included.
const CASES = [
  good,
  { ...good, companyId: "" },
  { ...good, customer: { ...customer, name: "", company: "" } },
  { ...good, customer: { ...customer, name: "12345", phone: "", email: "" } },
  { ...good, customer: { ...customer, phone: "9876543210", email: "ravi @x.in" } },
  { ...good, customer: { ...customer, phone: "41234567", email: "ravi@gmial.com" } },
  { ...good, customer: { ...customer, gstin: "07BFMPM7025K1Z3" } },
  { ...good, customer: { ...customer, gstin: "07BFMXM7025K1Z2" } },
  { ...good, customer: { ...customer, stateCode: "27" } },
  { ...good, customer: { ...customer, stateCode: "" } },
  { ...good, customer: { ...customer, gstin: "", stateCode: "" } },
  { ...good, customer: { ...customer, address: "" } },
  { ...good, customer: { ...customer, address: "Delhi" } },
  { ...good, customer: { ...customer, address: "New Delhi 11002" } },
  { ...good, shipTo: { name: "Site", stateCode: "", address: "" } },
  { ...good, shipTo: { name: "Site", stateCode: "27", address: "Thane, PIN 4213020", phone: "123" } },
  { ...good, lines: [] },
  { ...good, lines: [{ ...line, description: "", quantity: 0, rate: -1, discountPercent: 150, gstRate: 15, hsn: "12" }] },
  { ...good, lines: [{ ...line, quantity: 2.5 }, { ...line, quantity: 2000000 }] },
  { ...good, lines: [{ ...line, quantity: 10 }, { ...line, quantity: 10 }, { ...line, description: "Free sample", rate: 0 }] },
  { ...good, lines: [{ ...line, hsn: "" }] },
  { ...good, lines: [{ ...line, rate: 0 }] },
  { ...good, extraDiscountPercent: 120 },
  { ...good, issueDate: new Date(NOW + 3 * DAY).toISOString() },
  { ...good, issueDate: "" },
  { ...good, validityDays: -2 },
  { ...good, validityDays: 120 },
  { ...good, dueDate: new Date(NOW - 3 * DAY).toISOString() },
  { ...good, paymentTerms: "x".repeat(201), notes: "x".repeat(1001), terms: "x".repeat(3001) },
]
const OPTS = [
  { kind: "quotation", now: NOW, products: [{ id: "p1", moq: 500 }], companyRequired: true },
  { kind: "invoice", now: NOW, products: [], companyRequired: false },
]

test("validateDocument: identical errors and warnings on every case", () => {
  for (const opts of OPTS) {
    for (const doc of CASES) {
      assert.deepEqual(mobile.validateDocument(doc, opts), admin.validateDocument(doc, opts), JSON.stringify(doc).slice(0, 160))
    }
  }
})

test("the phone's own answers, so a broken port fails here and not only on parity", () => {
  assert.deepEqual(mobile.validateDocument(good, OPTS[1]), { errors: {}, warnings: {} })
  const r = mobile.validateDocument(CASES[6], OPTS[1])
  assert.match(r.errors["customer.gstin"], /typing mistake/)
})

test("GSTIN check digit and the single-field helpers agree", () => {
  for (const g of ["07BFMPM7025K1Z2", "07AABCW7659K1ZP", "29ABCDE1234F1Z5", "29ABCDE1234F1ZW", "07AABCU9603R1ZM", "x", ""]) {
    assert.equal(mobile.gstinCheckDigitValid(g), admin.gstinCheckDigitValid(g), g)
    assert.equal(mobile.gstinFormatProblem(g), admin.gstinFormatProblem(g), g)
  }
  for (const p of ["9811122233", "+91 98111 22233", "011-41234567", "41234567", "9999999999", "98111abc22", ""]) {
    assert.equal(mobile.indianPhoneProblem(p), admin.indianPhoneProblem(p), p)
  }
  for (const e of ["ravi@gmial.com", "ravi@x.con", "ravi@x", "a b@x.in", "ok@x.in"]) {
    assert.equal(mobile.emailFormatProblem(e), admin.emailFormatProblem(e), e)
    assert.equal(mobile.emailTypoHint(e), admin.emailTypoHint(e), e)
  }
})

test("tidyDocument matches", () => {
  const messy = { ...good, customer: { ...customer, name: " Ravi ", gstin: "07bfmpm7025k1z2 " }, shipTo: { name: " Site ", address: " Thane " }, lines: [{ ...line, description: " Award ", hsn: " 3926 " }] }
  assert.deepEqual(mobile.tidyDocument(messy), admin.tidyDocument(messy))
})

test("a contact saved on the phone gets the same GSTIN check digit", () => {
  assert.match(contact.gstinProblem("07BFMPM7025K1Z3", "07").message, /typing mistake/)
  assert.equal(contact.gstinProblem("07BFMPM7025K1Z2", "07"), null)
})
