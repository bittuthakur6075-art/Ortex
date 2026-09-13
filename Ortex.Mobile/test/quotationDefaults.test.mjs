// A rep's own quotation defaults (Profile > Quotation defaults).
//
// What is asserted: a field left unset falls back to the company's value, an
// empty string is a real "start blank" choice, and typing the company terms
// back in re-links the rep to the company so a console update still reaches
// their new quotations.

import assert from "node:assert/strict"
import test from "node:test"

import { loadTs } from "./loadTs.mjs"

const { withDefaults, normaliseDefault, hasDefaults, NO_DEFAULTS } = await loadTs("domain/quotationDefaults.ts")

const COMPANY_TERMS = "1. Prices are subject to final artwork approval.\n2. Taxes as applicable."
const base = { paymentTerms: "", terms: COMPANY_TERMS, notes: "", customer: { name: "" }, lines: [] }

test("unset defaults leave the company draft untouched", () => {
  assert.deepEqual(withDefaults(base, NO_DEFAULTS), base)
  assert.equal(hasDefaults(NO_DEFAULTS), false)
})

test("set defaults replace the company values, including an intentional blank", () => {
  const d = { paymentTerms: "50% advance", terms: "", notes: "Proof within 24 hours" }
  const out = withDefaults(base, d)
  assert.equal(out.paymentTerms, "50% advance")
  assert.equal(out.terms, "")
  assert.equal(out.notes, "Proof within 24 hours")
  assert.equal(hasDefaults(d), true)
  // The rest of the draft is not touched.
  assert.equal(out.customer, base.customer)
})

test("typing the company text back stores null, so the rep stays linked to the company", () => {
  assert.equal(normaliseDefault(COMPANY_TERMS, COMPANY_TERMS), null)
  assert.equal(normaliseDefault(`${COMPANY_TERMS}\n\n`, COMPANY_TERMS), null)
  assert.equal(normaliseDefault("My own terms", COMPANY_TERMS), "My own terms")
  // Payment terms and notes fall back to empty, so an empty field is "not set".
  assert.equal(normaliseDefault("", ""), null)
  assert.equal(normaliseDefault("Net 30  ", ""), "Net 30")
})
