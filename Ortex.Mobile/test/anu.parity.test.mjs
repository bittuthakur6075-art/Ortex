// Anu's tool answers: the phone (src/domain/anu.ts) must say the same figures
// in the same words as the console (Ortex.Admin/src/lib/anu.js, the source).
// Money is whole rupees with Indian grouping on both.

import assert from "node:assert/strict"
import { dirname, resolve } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { loadModule, loadTs } from "./loadTs.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const admin = await loadModule(resolve(here, "../../Ortex.Admin/src/lib/anu.js"))
const mobile = await loadTs("domain/anu.ts")
const { VOICE_SOURCE } = await loadTs("domain/voice.ts")

const NOW = new Date("2026-09-13T10:00:00.000Z").getTime()
const DAY = 86400000
const ago = (d) => new Date(NOW - d * DAY).toISOString()
const inDays = (d) => new Date(NOW + d * DAY).toISOString()

const customer = { name: "Ravi Sharma", company: "Sharma Traders", email: "ravi@sharma.in", phone: "9876543210", stateCode: "08" }
const quotations = [
  {
    id: "q1",
    number: "QT-0101",
    status: "sent",
    customer,
    lines: [{ description: "Satin lanyards", quantity: 500, unit: "pcs", rate: 18.4, gstRate: 18 }],
    totals: { grandTotal: 1234567.5, taxable: 1046244.49, gstTotal: 188323.01, totalDiscount: 0, interState: false },
    issueDate: ago(9),
    validUntil: inDays(2),
  },
  { id: "q2", number: "QT-0102", status: "accepted", customer, lines: [], totals: { grandTotal: 48999.49 }, issueDate: ago(3), validUntil: inDays(20) },
]
const enquiries = [
  { id: "e1", name: "Asha", company: "Mehta Gifts", phone: "9811111111", status: "new", createdAt: ago(1), product: "Acrylic trophy" },
  { id: "v1", name: "Caller", phone: "9822222222", source: VOICE_SOURCE, status: "new", createdAt: ago(2), summary: "Wants keychains" },
]
const products = [{ id: "p1", name: "Satin lanyard", category: "Lanyards", basePrice: 18.75, gstRate: 18, moq: 100 }]
const access = { enquiries: true, voice: true, quotations: true, customers: true, products: true }

test("money: whole rupees, Indian grouping, same as the console", () => {
  for (const n of [0, 7, 999.5, 1000, 48999.49, 100000, 1234567.5, 98765432.1, "250", null, undefined, "abc"]) {
    assert.equal(mobile.money(n), admin.money(n), String(n))
  }
  assert.equal(mobile.money(1234567.5), "₹12,34,568")
})

// Node's en-IN ICU spells September "Sept"; the phone's hand-rolled formatDate
// (format.ts, a deliberate divergence) says "Sep". Dates are not what this test guards.
const plain = (x) => JSON.parse(JSON.stringify(x).replace(/ Sept /g, " Sep "))
const same = (a, b) => assert.deepEqual(plain(a), plain(b))

test("briefing, searches and summaries match the console", () => {
  const data = { enquiries, quotations }
  same(mobile.briefing(data, access, NOW), admin.briefing(data, access, NOW))
  same(mobile.salesSummary(data, 30, access, NOW), admin.salesSummary(data, 30, access, NOW))
  same(mobile.findQuotations(quotations, { query: "sharma" }), admin.findQuotations(quotations, { query: "sharma" }))
  same(mobile.quotationDetail(quotations[0]), admin.quotationDetail(quotations[0]))
  same(mobile.findProducts(products, "lanyard"), admin.findProducts(products, "lanyard"))
})
