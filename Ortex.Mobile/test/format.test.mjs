// The mobile money/date formatters.
//
// Ortex.Admin reaches for `toLocaleString("en-IN")`. Hermes ships a cut-down
// Intl whose availability varies by React Native build, and when it is missing
// the failure is SILENT — grouping quietly degrades from 12,34,567.00 to
// 1,234,567.00 on a printed quotation. So the mobile port groups by hand, and
// these tests are what keep it honest.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const { amountInWords, formatCurrency, formatDate, formatNumber, initials, round2 } =
  await loadTs("domain/format.ts")

const here = dirname(fileURLToPath(import.meta.url))
const { round2: adminRound2 } = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/format.js"))

test("rupees group the Indian way: last three, then pairs", () => {
  assert.equal(formatCurrency(0), "₹0.00")
  assert.equal(formatCurrency(999), "₹999.00")
  assert.equal(formatCurrency(1000), "₹1,000.00")
  assert.equal(formatCurrency(99999), "₹99,999.00")
  // The one that a Western grouper gets wrong.
  assert.equal(formatCurrency(100000), "₹1,00,000.00")
  assert.equal(formatCurrency(1234567.5), "₹12,34,567.50")
  assert.equal(formatCurrency(123456789), "₹12,34,56,789.00")
})

test("negative amounts keep the sign outside the grouping", () => {
  assert.equal(formatCurrency(-1234567.5), "₹-12,34,567.50")
})

test("compact amounts read as lakhs and crores", () => {
  assert.equal(formatCurrency(120000, { compact: true }), "₹1.2L")
  assert.equal(formatCurrency(34000000, { compact: true }), "₹3.4Cr")
  assert.equal(formatCurrency(4500, { compact: true }), "₹4.5K")
  assert.equal(formatCurrency(950, { compact: true }), "₹950.00")
})

test("formatNumber groups without a currency or decimals", () => {
  assert.equal(formatNumber(1234567), "12,34,567")
  assert.equal(formatNumber(0), "0")
})

test("round2 agrees with the console value for value", () => {
  // Binary floating point makes some of these round DOWN where decimal
  // arithmetic would round up (1.005 * 100 is 100.4999…). That is fine, but it
  // must be the SAME wrong answer the console gives, or a line total drifts by
  // a paisa between the two. So this asserts parity, not the arithmetic ideal.
  for (const v of [0, 1, 1.005, 1.015, 2.345, 0.1 + 0.2, 148.5 * 500, -12.345, "2.345", undefined, null, ""]) {
    assert.equal(round2(v), adminRound2(v), `round2(${String(v)})`)
  }
})

test("dates render without relying on Intl", () => {
  assert.equal(formatDate("2026-03-09T10:30:00.000Z"), "09 Mar 2026")
  assert.equal(formatDate("not a date"), "-")
})

test("amount in words uses Indian scale", () => {
  assert.equal(amountInWords(0), "Rupees Zero Only")
  assert.equal(amountInWords(1200), "Rupees One Thousand Two Hundred Only")
  assert.equal(amountInWords(100000), "Rupees One Lakh Only")
  assert.equal(amountInWords(12345678), "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only")
})

test("initials fall back rather than crash on a blank name", () => {
  assert.equal(initials("Ortex Industries"), "OI")
  assert.equal(initials(""), "?")
  assert.equal(initials(undefined), "?")
})
