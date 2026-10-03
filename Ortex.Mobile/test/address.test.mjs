// Company addresses on documents: the phone and the console must print the same lines.
//   Ortex.Admin/src/lib/address.js  (source of truth)
//   Ortex.Mobile/src/domain/address.ts  (the port)

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/address.js"))
const mobile = await loadTs("domain/address.ts")

const REG = { line1: "B-12, Okhla Phase 2", line2: "", city: "New Delhi", stateCode: "07", pincode: "110020" }

test("formatAddress: lines, empties skipped, the state by name", () => {
  assert.deepEqual(mobile.formatAddress(REG), ["B-12, Okhla Phase 2", "New Delhi - 110020", "Delhi"])
  assert.equal(mobile.formatAddressOneLine(REG), "B-12, Okhla Phase 2, New Delhi - 110020, Delhi")
  assert.deepEqual(mobile.formatAddress(null), [])
})

test("isValidPincode: six digits, not starting with 0", () => {
  assert.equal(mobile.isValidPincode("110020"), true)
  assert.equal(mobile.isValidPincode("011002"), false)
  assert.equal(mobile.isValidPincode("11002"), false)
})

test("a legacy address still prints; a dispatch block only when filled", () => {
  assert.deepEqual(mobile.registeredLines({ address: "Plot 4\nNew Delhi" }), ["Plot 4", "New Delhi"])
  assert.deepEqual(mobile.registeredLines({ gstin: "27ABCDE1234F1Z5", registeredAddress: { line1: "x" } }), ["x", "Maharashtra"])
  assert.equal(mobile.dispatchBlock({ dispatchAddress: { label: "Branch / dispatch" } }), null)
})

test("phone and console format every address identically", () => {
  const companies = [
    {},
    null,
    { address: "New Delhi, India", stateCode: "07" },
    { address: "Old", registeredAddress: REG },
    { address: "Old", registeredAddress: { line1: "  " } },
    { stateCode: "29", registeredAddress: { line1: "x", pincode: "560001" }, dispatchAddress: { city: "Hosur", stateCode: "33" } },
    { gstin: "09AAAAA0000A1Z5", registeredAddress: { city: "Noida" }, dispatchAddress: { label: "Okhla works", line1: "Shed 3", line2: "Phase 2" } },
    { dispatchAddress: null },
  ]
  for (const c of companies) {
    assert.deepEqual(mobile.registeredLines(c), admin.registeredLines(c), JSON.stringify(c))
    assert.deepEqual(mobile.dispatchBlock(c), admin.dispatchBlock(c), JSON.stringify(c))
    assert.equal(mobile.formatAddressOneLine(c?.registeredAddress), admin.formatAddressOneLine(c?.registeredAddress))
  }
  for (const pin of ["110020", "011002", " 560001 ", "1100201", "", null, 400001])
    assert.equal(mobile.isValidPincode(pin), admin.isValidPincode(pin), String(pin))
  for (const text of ["Plot 4\r\nNew Delhi", "", undefined])
    assert.deepEqual(mobile.addressFromLegacy(text), admin.addressFromLegacy(text))
  assert.equal(mobile.DISPATCH_LABEL, admin.DISPATCH_LABEL)
})
