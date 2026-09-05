// Pricing parity between Ortex.Mobile and Ortex.Admin.
//
// This is the most important test in the app. A quotation raised on a phone and
// the same quotation opened in the console MUST total identically — a
// divergence here is a wrong GST amount on a document that has already gone to
// a customer.
//
// So the test loads BOTH implementations and asserts they agree, rather than
// asserting the port against numbers someone typed out by hand:
//   Ortex.Admin/src/lib/pricing.js   — the source of truth
//   Ortex.Mobile/src/domain/pricing  — the port
//
// If Ortex.Admin's engine is ever changed without the port following, this test
// is what says so. Run with `npm test`.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/pricing.js"))
const mobile = await loadTs("domain/pricing.ts")

/**
 * Three lines at three different GST rates, one carrying a per-line discount,
 * plus a whole-document discount. This shape exercises every branch of
 * computeDocument: the per-rate tax buckets, the proportional re-proration of
 * GST after the document discount, and the round-off.
 */
const LINES = [
  { description: "MDF exam boards", quantity: 500, rate: 148.5, discountPercent: 0, gstRate: 18 },
  { description: "Printed lanyards", quantity: 1200, rate: 36.25, discountPercent: 7.5, gstRate: 12 },
  { description: "Delivery", quantity: 1, rate: 2500, discountPercent: 0, gstRate: 5 },
]

test("computeLine matches the console, line for line", () => {
  for (const line of LINES) {
    assert.deepEqual(mobile.computeLine(line), admin.computeLine(line))
  }
})

test("computeDocument matches the console — intra-state, with a document discount", () => {
  const options = { interState: false, extraDiscountPercent: 4 }
  assert.deepEqual(mobile.computeDocument(LINES, options), admin.computeDocument(LINES, options))
})

test("computeDocument matches the console — inter-state", () => {
  const options = { interState: true, extraDiscountPercent: 4 }
  assert.deepEqual(mobile.computeDocument(LINES, options), admin.computeDocument(LINES, options))
})

test("computeDocument matches the console — no discount at all", () => {
  assert.deepEqual(mobile.computeDocument(LINES, {}), admin.computeDocument(LINES, {}))
})

test("computeDocument matches the console — empty document", () => {
  assert.deepEqual(mobile.computeDocument([], {}), admin.computeDocument([], {}))
})

test("intra-state splits into CGST + SGST and never emits IGST", () => {
  const totals = mobile.computeDocument(LINES, { interState: false, extraDiscountPercent: 4 })
  assert.equal(totals.igst, 0)
  assert.ok(totals.cgst > 0 && totals.sgst > 0)
  // The split is remainder-safe (sgst = gstTotal - cgst), so the halves must add
  // back to the whole even when the total is an odd number of paise.
  assert.equal(totals.cgst + totals.sgst, totals.gstTotal)
})

test("inter-state puts everything in IGST and zeroes CGST/SGST", () => {
  const totals = mobile.computeDocument(LINES, { interState: true })
  assert.equal(totals.cgst, 0)
  assert.equal(totals.sgst, 0)
  assert.equal(totals.igst, totals.gstTotal)
})

test("the grand total is a whole rupee, and round-off explains the difference", () => {
  const totals = mobile.computeDocument(LINES, { extraDiscountPercent: 4 })
  assert.equal(totals.grandTotal, Math.round(totals.grandTotal))
  const preRound = Math.round((totals.taxable + totals.gstTotal) * 100) / 100
  assert.equal(Math.round((preRound + totals.roundOff) * 100) / 100, totals.grandTotal)
})

test("a document discount reduces GST proportionally, not just the taxable value", () => {
  const plain = mobile.computeDocument(LINES, {})
  const discounted = mobile.computeDocument(LINES, { extraDiscountPercent: 10 })
  assert.ok(discounted.gstTotal < plain.gstTotal, "GST must fall with the discount")
  // Within a paisa per line of the exact 90% — computeDocument rounds each
  // line's adjusted tax to 2dp before summing, so it is not exactly 0.9x.
  assert.ok(Math.abs(discounted.gstTotal - plain.gstTotal * 0.9) < LINES.length * 0.01)
})
